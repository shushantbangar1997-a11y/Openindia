"""Pre-cached filler audio.

At session start we render every filler phrase the agent might say into raw
PCM via Deepgram's REST TTS endpoint and stash the frames in memory. When
the agent needs to play one we push the cached frames straight into a
dedicated LiveKit audio track — no live TTS call, sub-50ms emission.

Deepgram is used regardless of the agent's main TTS provider because:
  * we always have a Deepgram key,
  * fillers are 1–2 syllables so the voice mismatch is barely audible, and
  * the alternative (calling premium TTS for every filler) blows the
    "sub-300ms dead-air" budget.
"""

from __future__ import annotations

import asyncio
import logging
import os
import urllib.error
import urllib.request
from typing import Optional

from livekit import rtc

logger = logging.getLogger("rapid-x-agent.fillers")

SAMPLE_RATE = 24000  # Deepgram aura returns 24kHz mono linear16
NUM_CHANNELS = 1
FRAME_SAMPLES = 480  # 20 ms at 24kHz
FRAME_BYTES = FRAME_SAMPLES * 2  # 16-bit mono


def _render_phrase(phrase: str, voice: str, api_key: str) -> Optional[bytes]:
    """Synchronously fetch raw PCM bytes for one phrase from Deepgram."""
    url = (
        f"https://api.deepgram.com/v1/speak"
        f"?model={voice}&encoding=linear16&sample_rate={SAMPLE_RATE}"
    )
    data = (b'{"text":' + (phrase.replace('"', '').encode("utf-8").decode("utf-8")
                            and ('"' + phrase.replace('"', '\\"') + '"').encode("utf-8")) + b"}")
    req = urllib.request.Request(
        url,
        data=data,
        headers={"Authorization": f"Token {api_key}", "Content-Type": "application/json"},
    )
    try:
        with urllib.request.urlopen(req, timeout=8) as r:
            return r.read()
    except (urllib.error.URLError, urllib.error.HTTPError) as e:
        logger.warning(f"Filler render '{phrase}' failed: {e}")
        return None


def _split_frames(pcm: bytes) -> list[rtc.AudioFrame]:
    """Slice raw PCM into 20ms AudioFrames the way LiveKit wants them."""
    frames: list[rtc.AudioFrame] = []
    # Pad to whole-frame boundary with silence so the last bit isn't cut.
    if len(pcm) % FRAME_BYTES != 0:
        pcm = pcm + b"\x00" * (FRAME_BYTES - (len(pcm) % FRAME_BYTES))
    for i in range(0, len(pcm), FRAME_BYTES):
        chunk = pcm[i : i + FRAME_BYTES]
        frames.append(
            rtc.AudioFrame(
                data=chunk,
                sample_rate=SAMPLE_RATE,
                num_channels=NUM_CHANNELS,
                samples_per_channel=FRAME_SAMPLES,
            )
        )
    return frames


class FillerCache:
    """Pre-rendered fillers played through a dedicated published audio track."""

    def __init__(self, room: rtc.Room, phrases: list[str], voice: str = "aura-2-thalia-en"):
        self.room = room
        self.phrases = [p for p in phrases if p and p.strip()]
        self.voice = voice
        self._cache: dict[str, list[rtc.AudioFrame]] = {}
        self._source: Optional[rtc.AudioSource] = None
        self._track: Optional[rtc.LocalAudioTrack] = None
        self._lock = asyncio.Lock()
        self.ready = False

    async def initialize(self) -> None:
        api_key = os.getenv("DEEPGRAM_API_KEY")
        if not api_key or not self.phrases:
            return
        self._source = rtc.AudioSource(SAMPLE_RATE, NUM_CHANNELS)
        self._track = rtc.LocalAudioTrack.create_audio_track("rapidx-fillers", self._source)
        try:
            await self.room.local_participant.publish_track(self._track)
        except Exception as e:
            logger.warning(f"Could not publish filler track: {e}")
            return
        # Render all phrases in parallel threads.
        results = await asyncio.gather(
            *[asyncio.to_thread(_render_phrase, p, self.voice, api_key) for p in self.phrases],
            return_exceptions=True,
        )
        for phrase, pcm in zip(self.phrases, results):
            if isinstance(pcm, Exception) or not pcm:
                continue
            self._cache[phrase] = _split_frames(pcm)
        self.ready = bool(self._cache)
        logger.info(
            f"Filler cache ready: {len(self._cache)}/{len(self.phrases)} phrases pre-rendered"
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
