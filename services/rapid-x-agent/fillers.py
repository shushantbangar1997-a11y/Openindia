"""Pre-cached filler audio in the agent's selected voice.

At session start we render every filler phrase the agent might say into raw
PCM via the agent's own TTS provider (ElevenLabs / Cartesia / Deepgram REST)
and stash the frames in memory. When the agent needs to play one we push the
cached frames straight into a dedicated LiveKit audio track — no live TTS
call, sub-50ms emission.

If the premium provider has no key, we fall back to Deepgram so calls
*always* have non-blocking fillers — never silence.
"""

from __future__ import annotations

import asyncio
import json
import logging
import os
import urllib.error
import urllib.request
from typing import Optional

from livekit import rtc

logger = logging.getLogger("rapid-x-agent.fillers")

NUM_CHANNELS = 1


def _http_post(url: str, headers: dict, body: bytes, timeout: float = 8.0) -> Optional[bytes]:
    req = urllib.request.Request(url, data=body, headers=headers)
    try:
        with urllib.request.urlopen(req, timeout=timeout) as r:
            return r.read()
    except (urllib.error.URLError, urllib.error.HTTPError) as e:
        logger.warning(f"filler render http {url}: {e}")
        return None


def _render_deepgram(phrase: str, voice: str, sample_rate: int) -> Optional[bytes]:
    api_key = os.getenv("DEEPGRAM_API_KEY")
    if not api_key:
        return None
    url = (
        f"https://api.deepgram.com/v1/speak"
        f"?model={voice}&encoding=linear16&sample_rate={sample_rate}"
    )
    body = json.dumps({"text": phrase}).encode("utf-8")
    headers = {"Authorization": f"Token {api_key}", "Content-Type": "application/json"}
    return _http_post(url, headers, body)


def _render_elevenlabs(phrase: str, voice_id: str, api_key: str, sample_rate: int) -> Optional[bytes]:
    """Returns 16-bit mono PCM at the requested sample rate."""
    fmt = f"pcm_{sample_rate}"
    url = (
        f"https://api.elevenlabs.io/v1/text-to-speech/"
        f"{urllib.request.quote(voice_id, safe='')}?output_format={fmt}"
    )
    body = json.dumps({"text": phrase, "model_id": "eleven_multilingual_v2"}).encode("utf-8")
    headers = {"xi-api-key": api_key, "Content-Type": "application/json", "Accept": "audio/pcm"}
    return _http_post(url, headers, body)


def _render_cartesia(
    phrase: str, voice_id: str, language: str, api_key: str, sample_rate: int
) -> Optional[bytes]:
    url = "https://api.cartesia.ai/tts/bytes"
    body = json.dumps({
        "model_id": "sonic-2",
        "transcript": phrase,
        "voice": {"mode": "id", "id": voice_id},
        "output_format": {
            "container": "raw",
            "encoding": "pcm_s16le",
            "sample_rate": sample_rate,
        },
        "language": (language or "en").split("-")[0].lower(),
    }).encode("utf-8")
    headers = {
        "X-API-Key": api_key,
        "Cartesia-Version": "2024-06-10",
        "Content-Type": "application/json",
    }
    return _http_post(url, headers, body)


def _split_frames(pcm: bytes, sample_rate: int) -> list[rtc.AudioFrame]:
    """Slice raw PCM into 20ms AudioFrames the way LiveKit wants them."""
    samples_per_frame = sample_rate // 50  # 20ms
    frame_bytes = samples_per_frame * 2  # 16-bit mono
    if len(pcm) % frame_bytes != 0:
        pcm = pcm + b"\x00" * (frame_bytes - (len(pcm) % frame_bytes))
    frames: list[rtc.AudioFrame] = []
    for i in range(0, len(pcm), frame_bytes):
        chunk = pcm[i : i + frame_bytes]
        frames.append(
            rtc.AudioFrame(
                data=chunk,
                sample_rate=sample_rate,
                num_channels=NUM_CHANNELS,
                samples_per_channel=samples_per_frame,
            )
        )
    return frames


class FillerCache:
    """Pre-rendered fillers played through a dedicated published audio track.

    Renders in the agent's selected provider/voice when keys are available,
    falling back to Deepgram so calls never go silent. Cache key is
    (provider, voice_id, language) — multiple cache instances coexist.
    """

    def __init__(
        self,
        room: rtc.Room,
        phrases: list[str],
        *,
        provider: str = "deepgram",
        voice_id: str = "aura-2-thalia-en",
        language: str = "en",
        eleven_key: str = "",
        cartesia_key: str = "",
    ):
        self.room = room
        self.phrases = [p for p in phrases if p and p.strip()]
        self.provider = (provider or "deepgram").lower()
        self.voice_id = voice_id
        self.language = language
        self.eleven_key = eleven_key
        self.cartesia_key = cartesia_key
        self.sample_rate = 24000  # Deepgram aura default; reset below if needed
        self._cache: dict[str, list[rtc.AudioFrame]] = {}
        self._source: Optional[rtc.AudioSource] = None
        self._track: Optional[rtc.LocalAudioTrack] = None
        self._lock = asyncio.Lock()
        self.ready = False

    def phrases_in_cache(self) -> list[str]:
        return list(self._cache.keys())

    def _render_one(self, phrase: str) -> Optional[bytes]:
        # Pick the first provider that we have a key for, in preference order.
        if self.provider == "elevenlabs" and self.eleven_key:
            return _render_elevenlabs(phrase, self.voice_id, self.eleven_key, self.sample_rate)
        if self.provider == "cartesia" and self.cartesia_key:
            return _render_cartesia(
                phrase, self.voice_id, self.language, self.cartesia_key, self.sample_rate
            )
        # Deepgram fallback (or default). Aura voices only — strip non-Aura ids.
        dg_voice = (
            self.voice_id
            if self.voice_id and self.voice_id.startswith("aura")
            else "aura-2-thalia-en"
        )
        return _render_deepgram(phrase, dg_voice, self.sample_rate)

    async def initialize(self) -> None:
        if not self.phrases:
            return
        # Publish a dedicated audio track for fillers so they coexist with the
        # main agent voice without contention.
        self._source = rtc.AudioSource(self.sample_rate, NUM_CHANNELS)
        self._track = rtc.LocalAudioTrack.create_audio_track("rapidx-fillers", self._source)
        try:
            await self.room.local_participant.publish_track(self._track)
        except Exception as e:
            logger.warning(f"Could not publish filler track: {e}")
            return
        # Render all phrases in parallel threads.
        results = await asyncio.gather(
            *[asyncio.to_thread(self._render_one, p) for p in self.phrases],
            return_exceptions=True,
        )
        for phrase, pcm in zip(self.phrases, results):
            if isinstance(pcm, Exception) or not pcm:
                continue
            self._cache[phrase] = _split_frames(pcm, self.sample_rate)
        self.ready = bool(self._cache)
        logger.info(
            f"Filler cache ({self.provider}/{self.voice_id}): "
            f"{len(self._cache)}/{len(self.phrases)} phrases pre-rendered"
        )

    async def play(self, phrase: str) -> None:
        """Push cached frames straight into the published track."""
        if not self.ready or self._source is None:
            return
        frames = self._cache.get(phrase)
        if not frames:
            return
        async with self._lock:
            for frame in frames:
                try:
                    await self._source.capture_frame(frame)
                except asyncio.CancelledError:
                    raise
                except Exception as e:
                    logger.debug(f"capture_frame failed: {e}")
                    return
