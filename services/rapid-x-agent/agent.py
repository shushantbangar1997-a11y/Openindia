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
import random
import urllib.request
from typing import Optional

from livekit import agents, rtc
from livekit.agents import Agent, AgentSession, RoomInputOptions
from livekit.plugins import deepgram, noise_cancellation, openai, silero

# Optional premium TTS providers — imported lazily so missing keys don't crash.
try:
    from livekit.plugins import elevenlabs as elevenlabs_plugin  # type: ignore
except Exception:
    elevenlabs_plugin = None  # type: ignore

try:
    from livekit.plugins import cartesia as cartesia_plugin  # type: ignore
except Exception:
    cartesia_plugin = None  # type: ignore

REQUIRED_ENV = (
    "LIVEKIT_URL", "LIVEKIT_API_KEY", "LIVEKIT_API_SECRET",
    "GROQ_API_KEY", "DEEPGRAM_API_KEY",
)
_missing = [k for k in REQUIRED_ENV if not os.getenv(k)]
if _missing:
    raise RuntimeError(f"Missing required env vars: {', '.join(_missing)}")

INTERNAL_API_URL = os.getenv("INTERNAL_API_URL", "http://localhost:8080").rstrip("/")

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


def build_tts(provider: str, voice_id: str, language: str, speed: float):
    """Construct the requested TTS engine, gracefully falling back to
    Deepgram Aura if the premium provider isn't available."""
    provider = (provider or "deepgram").lower()
    speed = max(0.8, min(1.3, float(speed or 1.0)))

    if provider == "elevenlabs":
        if elevenlabs_plugin and os.getenv("ELEVENLABS_API_KEY"):
            try:
                Voice = getattr(elevenlabs_plugin, "Voice", None)
                if Voice is not None:
                    voice = Voice(id=voice_id, name=voice_id, category="premade")
                    return elevenlabs_plugin.TTS(
                        voice=voice,
                        model="eleven_multilingual_v2",
                    )
                # Newer plugin signature: voice_id kwarg.
                return elevenlabs_plugin.TTS(
                    voice_id=voice_id,
                    model="eleven_multilingual_v2",
                )
            except Exception as e:
                logger.warning(f"ElevenLabs init failed, falling back: {e}")
        else:
            logger.warning("ElevenLabs requested but plugin or key missing — falling back to Deepgram")

    if provider == "cartesia":
        if cartesia_plugin and os.getenv("CARTESIA_API_KEY"):
            try:
                base = (language or "en").split("-")[0].lower()
                return cartesia_plugin.TTS(
                    voice=voice_id,
                    model="sonic-2",
                    language=base,
                    speed=speed,
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
        req = urllib.request.Request(
            url, data=data, headers={"Content-Type": "application/json"}
        )
        urllib.request.urlopen(req, timeout=3).read()
    except Exception as e:
        logger.debug(f"post_back {path} failed: {e}")


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
    user_prompt: str, language: str, speaking_speed: float, auto_detect: bool
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
    return f"{header}\n# Your role\n{body}"


async def _publish_latency(room: rtc.Room, payload: dict) -> None:
    try:
        data = json.dumps(payload).encode("utf-8")
        await room.local_participant.publish_data(data, reliable=True, topic="latency")
    except Exception as e:
        logger.debug(f"publish_data failed: {e}")


class OutboundAssistant(Agent):
    def __init__(self, instructions: str) -> None:
        super().__init__(instructions=instructions)


async def entrypoint(ctx: agents.JobContext):
    logger.info(f"Joining room: {ctx.room.name}")
    await ctx.connect()

    cfg: dict = {}
    try:
        if ctx.room.metadata:
            cfg = json.loads(ctx.room.metadata)
    except Exception:
        logger.warning("Could not parse room metadata as JSON")

    user_prompt = (cfg.get("user_prompt") or "").strip()
    greeting = (cfg.get("greeting") or "").strip()
    tts_provider = (cfg.get("tts_provider") or "deepgram").strip().lower()
    voice_id = (cfg.get("voice_id") or "aura-2-thalia-en").strip()
    language = (cfg.get("language") or "en-US").strip()
    auto_detect = bool(cfg.get("auto_detect_language"))
    stt_model = (cfg.get("stt_model") or "").strip()
    stt_language = (cfg.get("stt_language") or "").strip()
    speaking_speed = float(cfg.get("speaking_speed") or 1.0)
    fillers_enabled = bool(cfg.get("fillers_enabled", True))
    custom_fillers = [str(s).strip() for s in (cfg.get("custom_fillers") or []) if str(s).strip()]
    sensitivity = (cfg.get("interruption_sensitivity") or "medium").strip().lower()
    wait_for_user_first = bool(cfg.get("wait_for_user_first"))
    mode = (cfg.get("mode") or "").strip()

    instructions = _build_persona(user_prompt, language, speaking_speed, auto_detect)
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
    await _post_back_async(
        f"/api/calls/by-room/{ctx.room.name}/events",
        {"type": "answered"},
    )

    # Build pipeline. min_endpointing_delay tunes barge-in / interruption
    # responsiveness on AgentSession.
    session = AgentSession(
        vad=silero.VAD.load(),
        stt=build_stt(stt_model, stt_language, language),
        llm=build_llm(),
        tts=build_tts(tts_provider, voice_id, language, speaking_speed),
        min_endpointing_delay=endpointing / 1000.0,
        allow_interruptions=True,
    )

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

    def _cancel_pending_filler() -> None:
        t = pending_filler.get("task")
        if t and not t.done():
            t.cancel()
        pending_filler["task"] = None

    if fillers_enabled:
        @session.on("user_input_transcribed")
        def _on_user_done(ev) -> None:
            try:
                if not getattr(ev, "is_final", False):
                    return
                text = (getattr(ev, "transcript", "") or "").strip()
                if len(text) < 3:
                    return
                if custom_fillers:
                    phrase = random.choice(custom_fillers)
                else:
                    phrase = _filler_for(language)

                async def _delayed_filler():
                    try:
                        await asyncio.sleep(0.25)
                        await session.say(phrase, add_to_chat_ctx=False, allow_interruptions=True)
                    except asyncio.CancelledError:
                        pass
                    except Exception as e:
                        logger.debug(f"filler say failed: {e}")
                _cancel_pending_filler()
                pending_filler["task"] = asyncio.create_task(_delayed_filler())
            except Exception as e:
                logger.debug(f"filler hook failed: {e}")

    # Explicit barge-in: the moment the user starts speaking, stop the agent
    # immediately. AgentSession also handles this internally via VAD when
    # allow_interruptions=True, but calling .interrupt() guarantees instant cut.
    @session.on("user_started_speaking")
    def _on_user_speak(_ev=None) -> None:
        _cancel_pending_filler()
        try:
            res = session.interrupt()
            if asyncio.iscoroutine(res):
                asyncio.create_task(res)
        except Exception as e:
            logger.debug(f"interrupt failed: {e}")

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

    await session.start(
        room=ctx.room,
        agent=OutboundAssistant(instructions),
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
