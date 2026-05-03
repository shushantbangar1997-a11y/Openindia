"""Rapid X AI — outbound voice agent worker.

Joins LiveKit rooms created by the dashboard's /api/dispatch endpoint (or
browser-test rooms minted by /api/agents/:id/test-token), runs Deepgram STT +
Groq LLM + Deepgram TTS, and talks to the human.

Reads per-call config from `room.metadata` (JSON):
  agent_id, agent_name, user_prompt, greeting, voice_id, language,
  wait_for_user_first, mode ("browser-test" or unset for phone calls)

Env vars required:
  LIVEKIT_URL, LIVEKIT_API_KEY, LIVEKIT_API_SECRET
  GROQ_API_KEY
  DEEPGRAM_API_KEY
Optional:
  INTERNAL_API_URL (default http://localhost:8080) — base URL of the api-server
                   for posting call events / transcript turns back.
"""

import asyncio
import json
import logging
import os
import urllib.request
from typing import Optional

from livekit import agents, rtc
from livekit.agents import Agent, AgentSession, RoomInputOptions
from livekit.plugins import deepgram, noise_cancellation, openai, silero

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
    "You are a friendly, concise AI voice assistant. Keep replies short "
    "(1-2 sentences). End the call warmly when the user says goodbye."
)

DEFAULT_GREETING = (
    "Greet the user warmly in one short sentence and ask how you can help."
)


def build_llm():
    return openai.LLM(
        base_url="https://api.groq.com/openai/v1",
        api_key=os.environ["GROQ_API_KEY"],
        model=os.getenv("GROQ_MODEL", "llama-3.3-70b-versatile"),
        temperature=0.7,
    )


def build_tts(voice_id: Optional[str] = None):
    model = voice_id or os.getenv("DEEPGRAM_TTS_MODEL", "aura-asteria-en")
    return deepgram.TTS(model=model)


def build_stt(language: Optional[str] = None):
    return deepgram.STT(
        model=os.getenv("DEEPGRAM_STT_MODEL", "nova-2"),
        language=language or os.getenv("DEEPGRAM_STT_LANGUAGE", "en"),
    )


class OutboundAssistant(Agent):
    def __init__(self, instructions: str) -> None:
        super().__init__(instructions=instructions)


def _post_back(path: str, payload: dict) -> None:
    """Best-effort POST back to the api-server. Never raises."""
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


def _is_sip_participant(p: rtc.RemoteParticipant) -> bool:
    # SIP participants get identities like "sip_+91…" from our dispatch route.
    # Browser testers join with identities like "tester-…".
    return p.identity.startswith("sip_") or "sip" in (p.kind or "").lower()


async def _wait_for_callee(
    room: rtc.Room, timeout: float
) -> Optional[rtc.RemoteParticipant]:
    """Resolve when a remote participant joins (SIP callee or browser tester)."""
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


async def entrypoint(ctx: agents.JobContext):
    logger.info(f"Joining room: {ctx.room.name}")
    await ctx.connect()

    # Parse config from room metadata.
    cfg: dict = {}
    try:
        if ctx.room.metadata:
            cfg = json.loads(ctx.room.metadata)
    except Exception:
        logger.warning("Could not parse room metadata as JSON")

    user_prompt = (cfg.get("user_prompt") or "").strip()
    greeting = (cfg.get("greeting") or "").strip()
    voice_id = (cfg.get("voice_id") or "").strip() or None
    language = (cfg.get("language") or "").strip() or None
    wait_for_user_first = bool(cfg.get("wait_for_user_first"))
    mode = (cfg.get("mode") or "").strip()

    instructions = user_prompt or DEFAULT_SYSTEM_PROMPT

    # ── Wait for the callee BEFORE starting the session, so the session lives
    # alongside an actual conversation partner. Starting the session in an
    # empty room (with close_on_disconnect) caused it to tear down before we
    # could greet the caller.
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

    session = AgentSession(
        vad=silero.VAD.load(),
        stt=build_stt(language),
        llm=build_llm(),
        tts=build_tts(voice_id),
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

    await session.start(
        room=ctx.room,
        agent=OutboundAssistant(instructions),
        room_input_options=RoomInputOptions(
            noise_cancellation=noise_cancellation.BVCTelephony(),
            close_on_disconnect=True,
        ),
    )

    if not wait_for_user_first:
        greeting_instr = greeting or DEFAULT_GREETING
        try:
            await session.generate_reply(instructions=greeting_instr)
        except Exception as e:
            logger.error(f"Initial greeting failed: {e}")

    # When the callee disconnects, mark the call ended. close_on_disconnect
    # will tear down the session shortly after this fires.
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
