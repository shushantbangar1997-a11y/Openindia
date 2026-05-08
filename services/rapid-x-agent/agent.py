"""Rapid X AI — outbound voice agent worker.

Joins LiveKit rooms created by the dashboard's /api/dispatch endpoint (or
browser-test rooms minted by /api/agents/:id/test-token), runs the
configured STT → LLM → TTS pipeline, and talks to the human.

Reads per-call config from `room.metadata` (JSON):
  agent_id, agent_name, user_prompt, greeting,
  tts_provider ("deepgram" | "elevenlabs" | "cartesia"),
  voice_id, language,
  speaking_speed (0.8 - 1.3),
  fillers_enabled (bool),
  interruption_sensitivity ("low" | "medium" | "high"),
  wait_for_user_first (bool),
  mode ("browser-test" or unset for phone calls)

Required env: LIVEKIT_URL, LIVEKIT_API_KEY, LIVEKIT_API_SECRET,
              GROQ_API_KEY, DEEPGRAM_API_KEY
Optional env: ELEVENLABS_API_KEY, CARTESIA_API_KEY,
              INTERNAL_API_URL (default http://localhost:8080)
"""

import asyncio
import json
import logging
import os
import math
import inspect
import random
import urllib.request
from typing import Optional

from livekit import agents, rtc
from livekit.agents import Agent, AgentSession, RoomInputOptions
from livekit.plugins import deepgram, noise_cancellation, openai, silero
from fillers import FillerCache

# Optional premium TTS providers — imported lazily so missing keys don't crash.
try:
    from livekit.plugins import elevenlabs as elevenlabs_plugin  # type: ignore
except Exception:
    elevenlabs_plugin = None  # type: ignore

try:
    from livekit.plugins import cartesia as cartesia_plugin  # type: ignore
except Exception:
    cartesia_plugin = None  # type: ignore

# Optional multilingual turn-detector model. When available it dramatically
# improves end-of-utterance detection across 14+ languages vs raw VAD.
try:
    from livekit.plugins.turn_detector.multilingual import MultilingualModel  # type: ignore
    _multilingual_available = True
except Exception:
    MultilingualModel = None  # type: ignore
    _multilingual_available = False

def _clean_key(value: str) -> str:
    """Strip invisible Unicode characters (line/paragraph separators, BOM, etc.)
    that break ASCII header encoding when keys are copy-pasted from browsers."""
    import re
    return re.sub(r"[^\x20-\x7E]", "", value).strip()

# Sanitize all API keys in-place so copy-paste Unicode artefacts never
# reach HTTP headers (httpx encodes header values as ASCII).
for _env_key in ("GROQ_API_KEY", "DEEPGRAM_API_KEY",
                 "LIVEKIT_API_KEY", "LIVEKIT_API_SECRET",
                 "ELEVENLABS_API_KEY", "CARTESIA_API_KEY"):
    _v = os.getenv(_env_key, "")
    if _v:
        os.environ[_env_key] = _clean_key(_v)

REQUIRED_ENV = (
    "LIVEKIT_URL", "LIVEKIT_API_KEY", "LIVEKIT_API_SECRET",
    "GROQ_API_KEY", "DEEPGRAM_API_KEY",
)
_missing = [k for k in REQUIRED_ENV if not os.getenv(k)]
if _missing:
    raise RuntimeError(f"Missing required env vars: {', '.join(_missing)}")

INTERNAL_API_URL = os.getenv("INTERNAL_API_URL", "http://localhost:8080").rstrip("/")
# Written once per job by _load_internal_token(); used in _post_back so every
# internal callback includes the shared secret the api-server requires.
_INTERNAL_TOKEN: str = ""


def _load_internal_token() -> str:
    """Return the shared INTERNAL_API_TOKEN, reading it from the token file
    on disk if the env var is absent.  Sets the module-level cache."""
    global _INTERNAL_TOKEN
    token = os.getenv("INTERNAL_API_TOKEN", "")
    if not token:
        try:
            import tempfile
            token_path = os.path.join(tempfile.gettempdir(), "rapid-x", "internal_token")
            with open(token_path, "r") as f:
                token = f.read().strip()
        except Exception:
            pass
    _INTERNAL_TOKEN = token
    return token

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("rapid-x-agent")

DEFAULT_SYSTEM_PROMPT = (
    "You are a friendly, concise voice assistant. Keep replies short "
    "(1-2 sentences). Use contractions and a casual, human tone. "
    "End the call warmly when the user says goodbye."
)
DEFAULT_GREETING = (
    "Greet the user warmly in one short sentence and ask how you can help."
)

# Filler phrases by language. Played while the LLM is generating to avoid
# dead air. Kept very short so they don't slow the conversation.
FILLERS = {
    "en": ["mm-hmm,", "right,", "okay,", "got it,", "let me see,", "sure,"],
    "es": ["mm-hmm,", "claro,", "vale,", "a ver,", "entiendo,"],
    "fr": ["mm-hmm,", "d'accord,", "voyons,", "bien sûr,", "je vois,"],
    "de": ["mm-hmm,", "okay,", "verstehe,", "mal sehen,", "klar,"],
    "it": ["mm-hmm,", "okay,", "vediamo,", "certo,", "capisco,"],
    "pt": ["mm-hmm,", "claro,", "tá,", "entendi,", "deixa ver,"],
    "hi": ["हाँ,", "ठीक है,", "अच्छा,", "एक मिनट,"],
    "ja": ["うん,", "はい,", "そうですね,", "ええと,"],
    "zh": ["嗯,", "好的,", "我想想,", "明白了,"],
    "ko": ["음,", "네,", "그렇군요,", "잠시만요,"],
    "ar": ["نعم,", "حسناً,", "لحظة,", "فهمت,"],
}

# Map our friendly sensitivity setting to Deepgram's endpointing window (ms).
ENDPOINTING_MS = {"low": 600, "medium": 350, "high": 180}


def _filler_for(language: str) -> str:
    base = (language or "en").split("-")[0].lower()
    bank = FILLERS.get(base, FILLERS["en"])
    return random.choice(bank)


def build_llm():
    return openai.LLM(
        base_url="https://api.groq.com/openai/v1",
        api_key=os.environ["GROQ_API_KEY"],
        model=os.getenv("GROQ_MODEL", "llama-3.3-70b-versatile"),
        temperature=0.7,
    )


def build_stt(model: str, stt_language: str, language: str):
    """STT engine. Model + language come from the api-server's catalog
    (single source of truth in artifacts/api-server/src/lib/voices.ts);
    we only fall back to a heuristic if the metadata is missing."""
    if not model or not stt_language:
        base = (language or "en-US").split("-")[0].lower()
        model = "nova-3" if base == "en" else "nova-2"
        stt_language = "multi" if base == "ar" else (language or "en-US")
    try:
        return deepgram.STT(model=model, language=stt_language)
    except Exception:
        base = (language or "en-US").split("-")[0].lower()
        return deepgram.STT(model="nova-2", language=base)


def build_tts(
    provider: str,
    voice_id: str,
    language: str,
    speed: float,
    *,
    eleven_key: str = "",
    cartesia_key: str = "",
):
    """Construct the requested TTS engine, gracefully falling back to
    Deepgram Aura if the premium provider isn't available. Per-call keys
    are passed explicitly so we never mutate process-global env vars
    (which would bleed across concurrent jobs)."""
    provider = (provider or "deepgram").lower()
    speed = max(0.8, min(1.3, float(speed or 1.0)))
    eleven_key = eleven_key or os.getenv("ELEVENLABS_API_KEY", "")
    cartesia_key = cartesia_key or os.getenv("CARTESIA_API_KEY", "")

    if provider == "elevenlabs":
        if elevenlabs_plugin and eleven_key:
            try:
                Voice = getattr(elevenlabs_plugin, "Voice", None)
                if Voice is not None:
                    voice = Voice(id=voice_id, name=voice_id, category="premade")
                    return elevenlabs_plugin.TTS(
                        voice=voice,
                        model="eleven_multilingual_v2",
                        api_key=eleven_key,
                    )
                # Newer plugin signature: voice_id kwarg.
                return elevenlabs_plugin.TTS(
                    voice_id=voice_id,
                    model="eleven_multilingual_v2",
                    api_key=eleven_key,
                )
            except Exception as e:
                logger.warning(f"ElevenLabs init failed, falling back: {e}")
        else:
            logger.warning("ElevenLabs requested but plugin or key missing — falling back to Deepgram")

    if provider == "cartesia":
        if cartesia_plugin and cartesia_key:
            try:
                base = (language or "en").split("-")[0].lower()
                return cartesia_plugin.TTS(
                    voice=voice_id,
                    model="sonic-2",
                    language=base,
                    speed=speed,
                    api_key=cartesia_key,
                )
            except Exception as e:
                logger.warning(f"Cartesia init failed, falling back: {e}")
        else:
            logger.warning("Cartesia requested but plugin or key missing — falling back to Deepgram")

    # Deepgram Aura fallback / default. Aura voices are English-only;
    # for other languages we still use them but the LLM speaks the target
    # language phonetically — better than silence.
    model = voice_id if voice_id and voice_id.startswith("aura") else "aura-2-thalia-en"
    return deepgram.TTS(model=model)


def _post_back(path: str, payload: dict) -> None:
    try:
        url = f"{INTERNAL_API_URL}{path}"
        data = json.dumps(payload).encode("utf-8")
        headers: dict[str, str] = {"Content-Type": "application/json"}
        if _INTERNAL_TOKEN:
            headers["x-internal-token"] = _INTERNAL_TOKEN
        req = urllib.request.Request(url, data=data, headers=headers)
        urllib.request.urlopen(req, timeout=3).read()
    except Exception as e:
        logger.debug(f"post_back {path} failed: {e}")


def _post_back_json(path: str, payload: dict) -> dict:
    """Like _post_back but returns the parsed JSON response body (or {}).
    Used when the caller needs data from the response (e.g. call_id)."""
    try:
        url = f"{INTERNAL_API_URL}{path}"
        data = json.dumps(payload).encode("utf-8")
        headers: dict[str, str] = {"Content-Type": "application/json"}
        if _INTERNAL_TOKEN:
            headers["x-internal-token"] = _INTERNAL_TOKEN
        req = urllib.request.Request(url, data=data, headers=headers)
        with urllib.request.urlopen(req, timeout=3) as r:
            return json.loads(r.read())
    except Exception as e:
        logger.debug(f"post_back_json {path} failed: {e}")
        return {}


async def _post_back_async(path: str, payload: dict) -> None:
    await asyncio.to_thread(_post_back, path, payload)


async def _wait_for_callee(
    room: rtc.Room, timeout: float
) -> Optional[rtc.RemoteParticipant]:
    for p in room.remote_participants.values():
        return p
    fut: asyncio.Future[rtc.RemoteParticipant] = asyncio.get_running_loop().create_future()

    def _on_join(participant: rtc.RemoteParticipant) -> None:
        if not fut.done():
            fut.set_result(participant)

    room.on("participant_connected", _on_join)
    try:
        return await asyncio.wait_for(fut, timeout=timeout)
    except asyncio.TimeoutError:
        return None
    finally:
        try:
            room.off("participant_connected", _on_join)
        except Exception:
            pass


def _build_persona(
    user_prompt: str, language: str, speaking_speed: float, auto_detect: bool,
    knowledge_text: str = "",
    conversation_stages: list = None,
) -> str:
    """Stitch a small, opinionated language/style header onto the user prompt
    so the LLM consistently sounds human and stays in the right language."""
    lang_label = language or "en-US"
    pace = "a normal pace"
    if speaking_speed >= 1.15:
        pace = "a slightly quick pace"
    elif speaking_speed <= 0.9:
        pace = "a slightly slower pace"
    if auto_detect:
        lang_rule = (
            f"- Detect the caller's spoken language on each turn and reply in "
            f"that exact language. Default to {lang_label} only if you can't tell."
        )
    else:
        lang_rule = (
            f"- Always reply in language: {lang_label}. If the caller switches "
            f"language mid-call, follow them."
        )
    header = (
        f"# Conversation rules\n"
        f"- This is a live phone call. Speak naturally at {pace}.\n"
        f"{lang_rule}\n"
        f"- Use contractions and casual phrasing. Keep replies short "
        f"(usually one or two sentences).\n"
        f"- Never reveal that you are an AI, model, or bot. If asked, say "
        f"you're calling on behalf of the company.\n"
        f"- Numbers, dates and prices should be written the way you'd say "
        f"them out loud.\n"
    )
    body = (user_prompt or DEFAULT_SYSTEM_PROMPT).strip()
    kb_section = ""
    if knowledge_text.strip():
        kb_section = (
            f"\n\n# Knowledge base\n"
            f"Use the information below to answer caller questions accurately. "
            f"Only cite what is relevant. If the answer isn't in the knowledge base, "
            f"say you'll find out and follow up.\n\n"
            f"{knowledge_text}"
        )
    stage_section = ""
    if conversation_stages:
        parts = [
            "# Conversation script\n"
            "Follow these stages in order. Complete each stage's goal before moving to the next. "
            "Transition naturally — do not announce stage names to the caller.\n"
        ]
        for i, stage in enumerate(conversation_stages, 1):
            s_name = (stage.get("name") or f"Stage {i}").strip()
            s_goal = (stage.get("goal") or "").strip()
            s_inst = (stage.get("instructions") or "").strip()
            entry = f"**Stage {i} — {s_name}**"
            if s_goal:
                entry += f"\nGoal: {s_goal}"
            if s_inst:
                entry += f"\nInstructions: {s_inst}"
            parts.append(entry)
        stage_section = "\n\n" + "\n\n".join(parts)
    return f"{header}\n# Your role\n{body}{kb_section}{stage_section}"


async def _publish_latency(room: rtc.Room, payload: dict) -> None:
    try:
        data = json.dumps(payload).encode("utf-8")
        await room.local_participant.publish_data(data, reliable=True, topic="latency")
    except Exception as e:
        logger.debug(f"publish_data failed: {e}")


import re as _re


def _rank_kb_docs(docs: list[dict], query: str, top_k: int = 3, max_chars: int = 4000) -> list[dict]:
    """BM25 document ranking (k1=1.5, b=0.75) with unigram + bigram tokens.

    Bigrams improve recall for voiced compound terms (e.g. "business hours",
    "return policy") that are less likely to match on unigrams alone.
    Returns up to `top_k` docs whose combined content fits within `max_chars`."""
    STOP = {"a", "an", "the", "is", "it", "to", "i", "and", "or", "of", "do", "you", "what", "in", "on", "at"}

    def _tok(text: str) -> list[str]:
        words = [w for w in _re.findall(r'\w+', text.lower()) if w not in STOP and len(w) > 1]
        bigrams = [f"{words[j]}_{words[j+1]}" for j in range(len(words) - 1)]
        return words + bigrams

    query_tokens = set(_tok(query))
    if not query_tokens:
        return _kb_budget(docs, max_chars)[:top_k]

    corpus = [_tok(f"{d.get('title', '')} {d.get('content', '')}") for d in docs]
    N = len(corpus)
    avg_len = sum(len(c) for c in corpus) / max(N, 1)
    k1, b_val = 1.5, 0.75

    scored: list[tuple[float, dict]] = []
    for doc, tokens in zip(docs, corpus):
        freq: dict[str, int] = {}
        for t in tokens:
            freq[t] = freq.get(t, 0) + 1
        dl = len(tokens)
        score = 0.0
        for token in query_tokens:
            f = freq.get(token, 0)
            df = sum(1 for c in corpus if token in c)
            idf = max(0.0, math.log((N - df + 0.5) / (df + 0.5) + 1))
            score += idf * (f * (k1 + 1)) / (f + k1 * (1 - b_val + b_val * dl / max(avg_len, 1)))
        scored.append((score, doc))

    scored.sort(key=lambda x: x[0], reverse=True)
    relevant = [d for s, d in scored if s > 0]
    fallback = [d for _, d in scored]
    return _kb_budget(relevant or fallback, max_chars)[:top_k]


def _kb_budget(docs: list[dict], max_chars: int) -> list[dict]:
    result: list[dict] = []
    total = 0
    for doc in docs:
        c = len(doc.get("content", ""))
        if total + c > max_chars and result:
            break
        result.append(doc)
        total += c
    return result


def _kb_initial_context(docs: list[dict], budget: int = 2000) -> str:
    """Build a brief KB summary injected before the first user utterance
    so the agent has baseline contextual awareness from call start."""
    parts: list[str] = []
    remaining = budget
    for d in docs[:6]:
        snippet = (d.get("content") or "")[:300].strip()
        if not snippet:
            continue
        entry = f"### {d.get('title', 'Note')}\n{snippet}"
        if len(entry) > remaining:
            break
        parts.append(entry)
        remaining -= len(entry)
    if not parts:
        return ""
    return (
        "\n\n# Knowledge base\n"
        "Use the following information to answer caller questions accurately. "
        "More detail will be injected per-turn as relevant.\n\n"
        + "\n\n---\n\n".join(parts)
    )


class OutboundAssistant(Agent):
    def __init__(self, base_instructions: str, kb_docs: list[dict], room_name: str = "") -> None:
        self._base_instructions = base_instructions
        self._kb_docs = kb_docs
        self._room_name = room_name
        initial = base_instructions + _kb_initial_context(kb_docs) if kb_docs else base_instructions
        super().__init__(instructions=initial)

    def refresh_knowledge(self, query: str) -> None:
        """Score knowledge docs against the caller's utterance and inject the
        top relevant docs into the active instructions for the next LLM turn."""
        if not self._kb_docs:
            return
        relevant = _rank_kb_docs(self._kb_docs, query, top_k=3, max_chars=4000)
        if not relevant:
            return
        kb_text = "\n\n---\n\n".join(
            f"### {d.get('title', 'Note')}\n{d.get('content', '')[:2000]}"
            for d in relevant
        )
        kb_section = (
            "\n\n# Knowledge base\n"
            "Use the facts below to answer the caller's question accurately. "
            "Only cite what is directly relevant. If the answer is not here, "
            "say you will find out and follow up.\n\n" + kb_text
        )
        new_instructions = self._base_instructions + kb_section
        # LiveKit Agents ≥ 1.0: instructions is a mutable property on Agent.
        try:
            self.instructions = new_instructions  # type: ignore[misc]
        except AttributeError:
            try:
                object.__setattr__(self, "instructions", new_instructions)
            except Exception:
                pass


def _build_agent_class(tools_cfg: list, room_name: str, call_state: dict) -> type:
    """Dynamically build an OutboundAssistant subclass with function tools
    configured for this call.  Returns the base class unchanged when no tools
    are active so the LLM context is kept minimal.

    call_state is a mutable dict that gets populated by the entrypoint AFTER
    this function returns (but BEFORE any tool can be invoked), so closures
    that reference it see the live session / end_fut objects."""
    if not tools_cfg:
        return OutboundAssistant

    from livekit.agents import llm as _llm

    methods: dict = {}
    builtins_enabled = {t.get("builtin") for t in tools_cfg if t.get("builtin")}

    if "save_lead" in builtins_enabled:
        async def _save_lead(
            self,
            name: str = "",
            email: str = "",
            phone: str = "",
            company: str = "",
            notes: str = "",
        ) -> str:
            """Save the caller's contact information as a lead.
            Call this whenever you have collected any of the caller's details
            such as their name, email address, phone number, company, or notes."""
            fields = {k: v for k, v in dict(
                name=name, email=email, phone=phone, company=company, notes=notes
            ).items() if v and str(v).strip()}
            if not fields:
                return "No contact information was provided to save."
            asyncio.create_task(_post_back_async(
                f"/api/calls/by-room/{self._room_name}/lead", fields
            ))
            return "Lead information saved."

        methods["save_lead"] = _llm.function_tool(_save_lead)

    if "end_call" in builtins_enabled:
        def _make_end_call(cs: dict):
            async def _end_call(self) -> str:
                """End the call politely when the conversation goal is complete
                or when the caller clearly says goodbye."""
                # Interrupt any in-progress TTS/LLM generation immediately.
                session = cs.get("session")
                if session is not None:
                    try:
                        session.interrupt()
                    except Exception:
                        pass
                # Resolve the end_fut so the entrypoint tears down and posts
                # the ended event to the api-server (avoids double-posting).
                end_fut = cs.get("end_fut")
                if end_fut is not None and not end_fut.done():
                    end_fut.set_result("agent ended call")
                # Explicitly shut down the job context — belt-and-suspenders on
                # top of end_fut in case something stalls in the event loop.
                job_ctx = cs.get("ctx")
                if job_ctx is not None:
                    try:
                        asyncio.create_task(job_ctx.shutdown(reason="agent ended call"))
                    except Exception:
                        pass
                return "Goodbye! Have a wonderful day."
            return _end_call

        methods["end_call"] = _llm.function_tool(_make_end_call(call_state))

    # Custom webhook tools
    for tool_cfg in tools_cfg:
        if tool_cfg.get("builtin"):
            continue
        t_name = str(tool_cfg.get("name") or "").strip().replace(" ", "_").lower()
        if not t_name or not t_name.isidentifier():
            continue
        if t_name in methods:
            continue
        t_desc = str(tool_cfg.get("description") or f"Execute the {t_name} action")
        t_url = str(tool_cfg.get("webhook_url") or "").strip()
        t_params = tool_cfg.get("parameters_schema") or []

        # Build typed inspect.Signature so function_tool can introspect params.
        _type_map = {"string": str, "str": str, "number": float, "integer": int,
                     "bool": bool, "boolean": bool}
        sig_params = [inspect.Parameter("self", inspect.Parameter.POSITIONAL_OR_KEYWORD)]
        annotations: dict = {"return": str}
        for p in t_params:
            p_name = str(p.get("name") or "").strip().replace(" ", "_")
            if not p_name or not p_name.isidentifier():
                continue
            p_type = _type_map.get(str(p.get("type") or "string").lower(), str)
            required = bool(p.get("required", False))
            default = inspect.Parameter.empty if required else ""
            sig_params.append(inspect.Parameter(
                p_name, inspect.Parameter.KEYWORD_ONLY,
                default=default, annotation=p_type,
            ))
            annotations[p_name] = p_type

        def _make_webhook(name: str, url: str, desc: str):
            async def _handler(self, **kwargs) -> str:
                if url:
                    try:
                        payload_obj = {
                            "call_id": call_state.get("call_id") or "",
                            "room": self._room_name,
                            "tool_name": name,
                            "arguments": kwargs,
                        }
                        payload_bytes = json.dumps(payload_obj).encode()
                        # External webhook — do NOT include the internal token.
                        req = urllib.request.Request(
                            url, data=payload_bytes,
                            headers={"Content-Type": "application/json"},
                            method="POST",
                        )
                        with urllib.request.urlopen(req, timeout=3) as r:
                            raw = r.read().decode("utf-8", errors="replace")
                        try:
                            parsed = json.loads(raw)
                            if isinstance(parsed, dict) and "message" in parsed:
                                return str(parsed["message"])[:500]
                            return str(parsed)[:500]
                        except json.JSONDecodeError:
                            return raw[:500] or "Done."
                    except Exception as e:
                        logger.warning(f"Webhook tool {name} failed: {e}")
                        return f"Action failed: {e}"
                return f"Action {name} noted."

            _handler.__name__ = name
            _handler.__doc__ = desc
            _handler.__signature__ = inspect.Signature(sig_params)
            _handler.__annotations__ = annotations
            return _handler

        try:
            methods[t_name] = _llm.function_tool(_make_webhook(t_name, t_url, t_desc))
        except Exception as e:
            logger.warning(f"Could not register tool {t_name}: {e}")

    if not methods:
        return OutboundAssistant

    return type("OutboundAssistantWithTools", (OutboundAssistant,), methods)


async def entrypoint(ctx: agents.JobContext):
    logger.info(f"Joining room: {ctx.room.name}")
    await ctx.connect()

    cfg: dict = {}
    try:
        if ctx.room.metadata:
            cfg = json.loads(ctx.room.metadata)
    except Exception:
        logger.warning("Could not parse room metadata as JSON")

    # Validate the per-call config against the canonical catalog served by
    # the api-server so worker behaviour can never silently drift from the
    # frontend's options. We don't fail the call on mismatch — just log loudly.
    try:
        catalog_url = f"{INTERNAL_API_URL}/api/agents/catalog"
        with urllib.request.urlopen(catalog_url, timeout=2) as r:
            catalog = json.loads(r.read())
        known_voices = {v["id"] for v in catalog.get("voices", [])}
        known_langs = {l["id"] for l in catalog.get("languages", [])}
        cfg_voice = cfg.get("voice_id")
        cfg_lang = cfg.get("language")
        if cfg_voice and cfg_voice not in known_voices:
            logger.warning(f"voice_id '{cfg_voice}' not in shared catalog")
        if cfg_lang and cfg_lang not in known_langs:
            logger.warning(f"language '{cfg_lang}' not in shared catalog")
    except Exception as e:
        logger.debug(f"Catalog validation skipped: {e}")

    user_prompt = (cfg.get("user_prompt") or "").strip()
    greeting = (cfg.get("greeting") or "").strip()
    tts_provider = (cfg.get("tts_provider") or "deepgram").strip().lower()
    # Per-agent provider API keys are fetched server-to-server from the
    # api-server's loopback-only /api/internal/agents/:id/keys endpoint,
    # NEVER through room metadata (which the browser participant can read).
    # Keys live as locals only — no os.environ mutation = no cross-call bleed.
    eleven_key = ""
    cartesia_key = ""
    # Load internal token once per job, setting the module-level _INTERNAL_TOKEN
    # so all _post_back calls automatically include it.
    internal_token = _load_internal_token()

    agent_id = (cfg.get("agent_id") or "").strip()
    if agent_id:
        try:
            keys_url = f"{INTERNAL_API_URL}/api/internal/agents/{agent_id}/keys"
            req = urllib.request.Request(
                keys_url, headers={"x-internal-token": internal_token}
            )
            with urllib.request.urlopen(req, timeout=2) as r:
                keys_blob = json.loads(r.read()).get("provider_api_keys") or {}
                eleven_key = (keys_blob.get("elevenlabs") or "").strip()
                cartesia_key = (keys_blob.get("cartesia") or "").strip()
        except Exception as e:
            logger.debug(f"Per-agent key fetch failed (using env vars): {e}")

    voice_id = (cfg.get("voice_id") or "aura-2-thalia-en").strip()
    language = (cfg.get("language") or "en-US").strip()
    auto_detect = bool(cfg.get("auto_detect_language"))
    stt_model = (cfg.get("stt_model") or "").strip()
    stt_language = (cfg.get("stt_language") or "").strip()
    speaking_speed = float(cfg.get("speaking_speed") or 1.0)
    fillers_enabled = bool(cfg.get("fillers_enabled", True))
    custom_fillers = [str(s).strip() for s in (cfg.get("custom_fillers") or []) if str(s).strip()]
    conversation_stages = cfg.get("conversation_stages") or []
    tools_cfg = cfg.get("tools") or []
    sensitivity = (cfg.get("interruption_sensitivity") or "medium").strip().lower()
    # For inbound calls the caller always initiates the conversation, so the
    # default behavior is to wait for them to speak first. Agents can opt into
    # auto-greet (agent speaks first) via the dedicated inbound_auto_greet flag,
    # which is separate from wait_for_user_first (an outbound-oriented setting).
    mode = (cfg.get("mode") or "").strip()
    if mode == "inbound":
        # inbound_auto_greet=True → agent speaks first (greeting played)
        # inbound_auto_greet=False (default) → wait for caller to speak first
        inbound_auto_greet = bool(cfg.get("inbound_auto_greet"))
        wait_for_user_first = not inbound_auto_greet
    else:
        wait_for_user_first = bool(cfg.get("wait_for_user_first"))

    # Fetch agent knowledge base documents from the api-server.
    # Stored as a list so we can do per-turn relevance selection (keyword scoring)
    # rather than injecting everything at call start.
    kb_docs: list[dict] = []
    if agent_id:
        try:
            kb_url = f"{INTERNAL_API_URL}/api/internal/agents/{agent_id}/knowledge"
            kb_req = urllib.request.Request(
                kb_url, headers={"x-internal-token": internal_token}
            )
            with urllib.request.urlopen(kb_req, timeout=3) as _r:
                kb_docs = json.loads(_r.read()).get("docs") or []
            if kb_docs:
                logger.info(f"Loaded {len(kb_docs)} knowledge doc(s) for per-turn retrieval")
        except Exception as _e:
            logger.debug(f"Knowledge base fetch skipped: {_e}")

    # Base instructions — no knowledge injected yet (done per-turn below).
    instructions = _build_persona(
        user_prompt, language, speaking_speed, auto_detect,
        conversation_stages=conversation_stages,
    )

    # For inbound calls where we wait for the caller to speak first, inject
    # the configured greeting into the instructions so the agent opens its
    # first response with the greeting text (after the caller has spoken).
    if mode == "inbound" and wait_for_user_first and greeting:
        instructions = instructions + (
            f"\n\n# Opening response\n"
            f"When you respond for the very first time, open with exactly: \"{greeting}\"\n"
            f"Then continue addressing whatever the caller said."
        )

    endpointing = ENDPOINTING_MS.get(sensitivity, ENDPOINTING_MS["medium"])

    logger.info(
        f"Config: provider={tts_provider} voice={voice_id} lang={language} "
        f"speed={speaking_speed} fillers={fillers_enabled} sens={sensitivity}"
    )

    # Wait for the callee BEFORE starting the session so we never start
    # a session in an empty room (close_on_disconnect would tear it down).
    callee = await _wait_for_callee(ctx.room, timeout=90)
    if callee is None:
        logger.warning("No callee joined within 90s; ending job")
        await _post_back_async(
            f"/api/calls/by-room/{ctx.room.name}/events",
            {"type": "failed", "reason": "no callee joined"},
        )
        await ctx.shutdown(reason="no callee joined")
        return

    logger.info(f"Callee joined: {callee.identity} (mode={mode or 'phone'})")

    # Initialise call_state early so all subsequent closures (session events,
    # tool callbacks) can safely write/read it.  ctx and call_id are available
    # now; session and end_fut are filled in below as they are created.
    call_state: dict = {"ctx": ctx, "call_id": "", "session": None, "end_fut": None}

    # Post the answered event and capture the call_id from the API response.
    _answered_resp = await asyncio.to_thread(
        _post_back_json,
        f"/api/calls/by-room/{ctx.room.name}/events",
        {"type": "answered"},
    )
    call_state["call_id"] = ((_answered_resp.get("call") or {}).get("id") or "")

    # Turn detection: prefer LiveKit's MultilingualModel — it understands
    # natural pauses, hedging and code-switching far better than raw VAD.
    # Falls back to Silero VAD only when the plugin isn't installed.
    turn_detection = None
    if _multilingual_available and MultilingualModel is not None:
        try:
            turn_detection = MultilingualModel()
            logger.info("Using MultilingualModel for turn detection")
        except Exception as e:
            logger.warning(f"MultilingualModel init failed, falling back to VAD: {e}")

    session_kwargs: dict = dict(
        vad=silero.VAD.load(),
        stt=build_stt(stt_model, stt_language, language),
        llm=build_llm(),
        tts=build_tts(
            tts_provider, voice_id, language, speaking_speed,
            eleven_key=eleven_key, cartesia_key=cartesia_key,
        ),
        min_endpointing_delay=endpointing / 1000.0,
        allow_interruptions=True,
    )
    if turn_detection is not None:
        session_kwargs["turn_detection"] = turn_detection
    session = AgentSession(**session_kwargs)
    call_state["session"] = session  # call_state already exists from above

    # Stream conversation turns back to the api-server for the transcript view.
    @session.on("conversation_item_added")
    def _on_item(ev) -> None:
        try:
            item = getattr(ev, "item", None)
            if item is None:
                return
            role = getattr(item, "role", None)
            text = getattr(item, "text_content", None) or ""
            if role in ("user", "assistant") and text.strip():
                asyncio.create_task(
                    _post_back_async(
                        f"/api/calls/by-room/{ctx.room.name}/transcript",
                        {"role": role, "text": text},
                    )
                )
        except Exception as e:
            logger.debug(f"transcript hook failed: {e}")

    # Filler engine: when the user finishes speaking, schedule a short
    # acknowledgement after a 250ms gate. If the LLM/TTS starts producing
    # audio first, we cancel the filler so it never overlaps the real reply.
    pending_filler: dict[str, Optional[asyncio.Task]] = {"task": None}
    current_lang: dict[str, str] = {"lang": (language or "en-US").split("-")[0].lower()}

    def _cancel_pending_filler() -> None:
        t = pending_filler.get("task")
        if t and not t.done():
            t.cancel()
        pending_filler["task"] = None

    # Cancel pending filler the moment the assistant starts producing audio
    # so the filler never overlaps or queues behind the real reply.
    @session.on("agent_state_changed")
    def _on_agent_state(ev) -> None:
        try:
            new_state = getattr(ev, "new_state", None) or getattr(ev, "state", None)
            if new_state == "speaking":
                _cancel_pending_filler()
        except Exception as e:
            logger.debug(f"agent_state hook failed: {e}")

    # Per-utterance language routing: when auto-detect is on and the caller
    # switches language mid-call, swap the TTS to a matching voice for that
    # language so the agent replies in the right voice (not just the right
    # words). Only acts on Cartesia (which is per-language); ElevenLabs
    # multilingual handles language internally; Deepgram Aura is EN-only.
    def _maybe_swap_tts(detected_lang: Optional[str]) -> None:
        if not auto_detect or not detected_lang:
            return
        base = str(detected_lang).split("-")[0].lower()
        if not base or base == current_lang["lang"]:
            return
        try:
            new_tts = build_tts(
                tts_provider, voice_id, base, speaking_speed,
                eleven_key=eleven_key, cartesia_key=cartesia_key,
            )
            try:
                session.tts = new_tts  # type: ignore[attr-defined]
            except Exception:
                # Some versions expose this through _tts; best-effort.
                setattr(session, "_tts", new_tts)
            current_lang["lang"] = base
            logger.info(f"Swapped TTS to language={base}")
        except Exception as e:
            logger.debug(f"tts swap failed for {base}: {e}")

    # Always-on hook for auto-detect language routing (separate from filler)
    @session.on("user_input_transcribed")
    def _on_user_lang(ev) -> None:
        try:
            if not getattr(ev, "is_final", False):
                return
            detected = getattr(ev, "language", None) or getattr(ev, "detected_language", None)
            _maybe_swap_tts(detected)
        except Exception as e:
            logger.debug(f"lang detect hook failed: {e}")

    # Pre-cache filler audio in the agent's selected provider/voice so
    # playback is instant — no live TTS call, no dead air. We kick off the
    # render in the background so it never delays the greeting; if a filler
    # is needed before the cache is ready we skip silently (the LLM reply
    # is on its way regardless).
    filler_cache: Optional[FillerCache] = None
    if fillers_enabled:
        bank = custom_fillers or list(FILLERS.get(
            (language or "en").split("-")[0].lower(), FILLERS["en"]
        ))
        filler_cache = FillerCache(
            ctx.room, bank,
            provider=tts_provider, voice_id=voice_id, language=language,
            eleven_key=eleven_key, cartesia_key=cartesia_key,
        )
        # Background warmup so greeting fires immediately after session.start.
        asyncio.create_task(filler_cache.initialize())

    if fillers_enabled and filler_cache is not None:
        @session.on("user_input_transcribed")
        def _on_user_done(ev) -> None:
            try:
                if not getattr(ev, "is_final", False):
                    return
                text = (getattr(ev, "transcript", "") or "").strip()
                if len(text) < 3:
                    return
                # If cache isn't warm yet (first ~1s of the call), skip the
                # filler — the real reply is already streaming.
                if not filler_cache.ready:
                    return
                phrases = filler_cache.phrases_in_cache()
                if not phrases:
                    return
                phrase = random.choice(phrases)

                async def _delayed_filler():
                    try:
                        # Sub-300ms emission: 250ms gate + ~10ms cache lookup
                        await asyncio.sleep(0.25)
                        await filler_cache.play(phrase)
                    except asyncio.CancelledError:
                        pass
                    except Exception as e:
                        logger.debug(f"filler play failed: {e}")
                _cancel_pending_filler()
                pending_filler["task"] = asyncio.create_task(_delayed_filler())
            except Exception as e:
                logger.debug(f"filler hook failed: {e}")

    # Cancel any pending filler the moment the user starts speaking.
    # We do NOT call session.interrupt() here — AgentSession handles barge-in
    # automatically when allow_interruptions=True. Calling interrupt() manually
    # would cancel any in-progress LLM generation, leaving only the filler
    # audible and preventing real responses from ever reaching the caller.
    @session.on("user_started_speaking")
    def _on_user_speak(_ev=None) -> None:
        _cancel_pending_filler()

    # Latency HUD: push STT/LLM/TTS timing events down a LiveKit data
    # channel (topic="latency") so the browser test modal can render a HUD.
    @session.on("metrics_collected")
    def _on_metrics(ev) -> None:
        try:
            m = getattr(ev, "metrics", None)
            if m is None:
                return
            # Each metric class has different fields; we extract what we can.
            kind = type(m).__name__
            payload: dict = {"kind": kind}
            for attr in ("ttft", "ttfb", "duration", "audio_duration", "end_of_utterance_delay"):
                val = getattr(m, attr, None)
                if isinstance(val, (int, float)):
                    payload[attr] = round(float(val) * 1000.0, 1)  # ms
            asyncio.create_task(_publish_latency(ctx.room, payload))
        except Exception as e:
            logger.debug(f"metrics hook failed: {e}")

    # call_state was initialised after callee joined (above). Pass it to the
    # agent class builder so tool closures (end_call in particular) can
    # reference the live session / end_fut / ctx objects.
    AgentClass = _build_agent_class(tools_cfg, ctx.room.name, call_state)
    assistant = AgentClass(instructions, kb_docs, room_name=ctx.room.name)

    # Per-turn relevance: when the caller finishes speaking, score all knowledge
    # docs against their utterance and update the agent's instructions before the
    # LLM generates its next reply. This fires *after* filler scheduling so the
    # knowledge refresh never delays audio playback.
    if kb_docs:
        @session.on("user_input_transcribed")
        def _on_user_kb(ev) -> None:
            try:
                if not getattr(ev, "is_final", False):
                    return
                query = (getattr(ev, "transcript", "") or "").strip()
                if len(query) < 3:
                    return
                assistant.refresh_knowledge(query)
            except Exception as _e:
                logger.debug(f"kb refresh failed: {_e}")

    await session.start(
        room=ctx.room,
        agent=assistant,
        room_input_options=RoomInputOptions(
            noise_cancellation=noise_cancellation.BVCTelephony(),
            close_on_disconnect=True,
        ),
    )

    if not wait_for_user_first:
        # If the user gave us a literal greeting, SAY it verbatim — that way
        # they get exactly the opening line they wrote. Otherwise let the LLM
        # generate a greeting from instructions.
        try:
            if greeting and len(greeting) > 0:
                await session.say(greeting, allow_interruptions=True)
            else:
                await session.generate_reply(instructions=DEFAULT_GREETING)
        except Exception as e:
            logger.error(f"Initial greeting failed: {e}")

    # End-of-call detection.
    end_fut: asyncio.Future[str] = asyncio.get_running_loop().create_future()
    call_state["end_fut"] = end_fut  # lets end_call tool resolve it directly

    def _on_leave(p: rtc.RemoteParticipant) -> None:
        if not end_fut.done() and p.identity == callee.identity:
            end_fut.set_result("callee disconnected")

    ctx.room.on("participant_disconnected", _on_leave)
    try:
        reason = await end_fut
    except asyncio.CancelledError:
        reason = "cancelled"
    finally:
        try:
            ctx.room.off("participant_disconnected", _on_leave)
        except Exception:
            pass

    logger.info(f"Call ended: {reason}")
    await _post_back_async(
        f"/api/calls/by-room/{ctx.room.name}/events",
        {"type": "ended", "reason": reason},
    )


if __name__ == "__main__":
    agents.cli.run_app(
        agents.WorkerOptions(
            entrypoint_fnc=entrypoint,
            port=int(os.getenv("AGENT_HTTP_PORT", "8765")),
        )
    )
