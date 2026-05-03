"""Rapid X AI — outbound voice agent worker.

Joins LiveKit rooms created by the dashboard's /api/dispatch endpoint,
runs Deepgram STT + Groq LLM + Deepgram TTS, and talks to the human.

Env vars required:
  LIVEKIT_URL, LIVEKIT_API_KEY, LIVEKIT_API_SECRET
  GROQ_API_KEY
  DEEPGRAM_API_KEY
"""

import asyncio
import json
import logging
import os

from livekit import agents, rtc
from livekit.agents import Agent, AgentSession, RoomInputOptions
from livekit.plugins import deepgram, noise_cancellation, openai, silero

REQUIRED_ENV = ("LIVEKIT_URL", "LIVEKIT_API_KEY", "LIVEKIT_API_SECRET",
                "GROQ_API_KEY", "DEEPGRAM_API_KEY")
_missing = [k for k in REQUIRED_ENV if not os.getenv(k)]
if _missing:
    raise RuntimeError(f"Missing required env vars: {', '.join(_missing)}")

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("rapid-x-agent")

DEFAULT_SYSTEM_PROMPT = (
    "You are a friendly, concise AI voice assistant calling on behalf of "
    "Rapid X AI. Keep replies short (1-2 sentences). If the caller is silent "
    "or doesn't respond, politely confirm if they can hear you. End the call "
    "warmly when they say goodbye."
)

DEFAULT_GREETING = (
    "The user has just picked up. Greet them warmly, introduce yourself as "
    "an AI assistant, and explain why you are calling based on your "
    "instructions."
)


def build_llm():
    """Groq via OpenAI-compatible endpoint — free + fast."""
    return openai.LLM(
        base_url="https://api.groq.com/openai/v1",
        api_key=os.environ["GROQ_API_KEY"],
        model=os.getenv("GROQ_MODEL", "llama-3.3-70b-versatile"),
        temperature=0.7,
    )


def build_tts(voice_id: str | None = None):
    """Deepgram Aura — free tier, low latency."""
    model = voice_id or os.getenv("DEEPGRAM_TTS_MODEL", "aura-asteria-en")
    return deepgram.TTS(model=model)


def build_stt():
    return deepgram.STT(
        model=os.getenv("DEEPGRAM_STT_MODEL", "nova-2"),
        language=os.getenv("DEEPGRAM_STT_LANGUAGE", "en"),
    )


class OutboundAssistant(Agent):
    def __init__(self, instructions: str) -> None:
        super().__init__(instructions=instructions)


async def entrypoint(ctx: agents.JobContext):
    logger.info(f"Joining room: {ctx.room.name}")

    # Pull caller-specific config from room metadata (set by /api/dispatch).
    user_prompt = ""
    voice_id: str | None = None
    config_dict: dict = {}
    try:
        if ctx.room.metadata:
            config_dict = json.loads(ctx.room.metadata)
            user_prompt = (config_dict.get("user_prompt") or "").strip()
            voice_id = (config_dict.get("voice_id") or "").strip() or None
    except Exception:
        logger.warning("Could not parse room metadata as JSON")

    instructions = DEFAULT_SYSTEM_PROMPT
    if user_prompt:
        instructions = (
            f"{DEFAULT_SYSTEM_PROMPT}\n\n"
            f"## Reason for this call\n{user_prompt}"
        )

    session = AgentSession(
        vad=silero.VAD.load(),
        stt=build_stt(),
        llm=build_llm(),
        tts=build_tts(voice_id),
    )

    await session.start(
        room=ctx.room,
        agent=OutboundAssistant(instructions),
        room_input_options=RoomInputOptions(
            noise_cancellation=noise_cancellation.BVCTelephony(),
            close_on_disconnect=True,
        ),
    )

    # Wait for the SIP callee to actually pick up before greeting. The dashboard
    # has already triggered the outbound SIP dial; the participant will appear
    # in the room once they answer. If they're already there (e.g. the dial
    # completed before we got here), proceed immediately.
    callee = await _wait_for_sip_participant(ctx.room, timeout=60)
    if callee is None:
        logger.warning("Timed out waiting for SIP callee to join; ending job")
        await ctx.shutdown(reason="callee did not answer")
        return

    logger.info(f"SIP callee joined ({callee.identity}); starting conversation")
    await session.generate_reply(instructions=DEFAULT_GREETING)


async def _wait_for_sip_participant(
    room: rtc.Room, timeout: float
) -> rtc.RemoteParticipant | None:
    """Resolve when a remote participant (the SIP callee) is in the room."""
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
        room.off("participant_connected", _on_join)


if __name__ == "__main__":
    # No agent_name -> worker auto-accepts any new room (single-tenant for now).
    # Bind the worker's internal healthcheck server to a non-conflicting port.
    agents.cli.run_app(
        agents.WorkerOptions(
            entrypoint_fnc=entrypoint,
            port=int(os.getenv("AGENT_HTTP_PORT", "8765")),
        )
    )
