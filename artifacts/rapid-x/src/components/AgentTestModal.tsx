import { useEffect, useRef, useState } from "react";
import { Mic, MicOff, Loader2, X, AudioLines, Activity } from "lucide-react";
import {
  Room,
  RoomEvent,
  Track,
  type RemoteTrack,
  type RemoteParticipant,
} from "livekit-client";
import { apiSend } from "@/lib/api";

type State = "idle" | "connecting" | "live" | "ended" | "error";

type LatencyHud = {
  stt_ms?: number; // EOU end_of_utterance_delay
  llm_ms?: number; // LLM ttft
  tts_ms?: number; // TTS ttfb
  updated_at?: number;
};

export default function AgentTestModal({
  agentId,
  agentName,
  onClose,
}: {
  agentId: string;
  agentName: string;
  onClose: () => void;
}) {
  const [state, setState] = useState<State>("idle");
  const [error, setError] = useState<string>("");
  const [muted, setMuted] = useState(false);
  const [agentSpeaking, setAgentSpeaking] = useState(false);
  const [hud, setHud] = useState<LatencyHud>({});
  const roomRef = useRef<Room | null>(null);
  const audioRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    return () => {
      roomRef.current?.disconnect().catch(() => {});
    };
  }, []);

  const start = async () => {
    setState("connecting");
    setError("");
    setHud({});
    try {
      const { token, url } = await apiSend<{ token: string; url: string }>(
        `/agents/${agentId}/test-token`,
        "POST",
      );
      const room = new Room({ adaptiveStream: true, dynacast: true });
      roomRef.current = room;

      room.on(
        RoomEvent.TrackSubscribed,
        (track: RemoteTrack, _pub, _p: RemoteParticipant) => {
          if (track.kind === Track.Kind.Audio) {
            const el = track.attach();
            el.autoplay = true;
            (el as HTMLAudioElement).volume = 1.0;
            if (audioRef.current?.parentNode) {
              audioRef.current.parentNode.appendChild(el);
            } else {
              document.body.appendChild(el);
            }
          }
        },
      );

      room.on(RoomEvent.ActiveSpeakersChanged, (speakers) => {
        const remote = speakers.some(
          (s) => s.identity !== room.localParticipant.identity,
        );
        setAgentSpeaking(remote);
      });

      // Latency HUD: agent worker publishes timing events on topic="latency".
      room.on(RoomEvent.DataReceived, (payload, _participant, _kind, topic) => {
        if (topic !== "latency") return;
        try {
          const data = JSON.parse(new TextDecoder().decode(payload));
          setHud((prev) => {
            const next: LatencyHud = { ...prev, updated_at: Date.now() };
            const kind = String(data.kind || "");
            if (kind === "EOUMetrics" && typeof data.end_of_utterance_delay === "number") {
              next.stt_ms = data.end_of_utterance_delay;
            } else if (kind === "LLMMetrics" && typeof data.ttft === "number") {
              next.llm_ms = data.ttft;
            } else if (kind === "TTSMetrics" && typeof data.ttfb === "number") {
              next.tts_ms = data.ttfb;
            } else if (kind === "STTMetrics" && typeof data.duration === "number") {
              // STT streaming duration — only set if EOU not seen.
              if (next.stt_ms === undefined) next.stt_ms = data.duration;
            }
            return next;
          });
        } catch {
          // ignore malformed payloads
        }
      });

      room.on(RoomEvent.Disconnected, () => setState("ended"));

      await room.connect(url, token);
      await room.localParticipant.setMicrophoneEnabled(true);
      setState("live");
    } catch (e: any) {
      setError(e?.message || "Failed to connect");
      setState("error");
    }
  };

  const hangup = async () => {
    await roomRef.current?.disconnect().catch(() => {});
    setState("ended");
    onClose();
  };

  const toggleMute = async () => {
    const room = roomRef.current;
    if (!room) return;
    const next = !muted;
    await room.localParticipant.setMicrophoneEnabled(!next);
    setMuted(next);
  };

  const totalMs =
    (hud.stt_ms ?? 0) + (hud.llm_ms ?? 0) + (hud.tts_ms ?? 0);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
      <div className="relative w-full max-w-md bg-[#0b0b0f] border border-white/10 rounded-2xl p-6 shadow-2xl">
        <button
          onClick={hangup}
          className="absolute top-3 right-3 p-2 rounded-lg text-gray-400 hover:bg-white/5"
          aria-label="Close"
        >
          <X className="w-4 h-4" />
        </button>

        <h3 className="text-xl font-bold mb-1">Test {agentName}</h3>
        <p className="text-sm text-gray-400 mb-6">
          Talk to your agent live in the browser — no phone call needed.
        </p>

        <div className="flex flex-col items-center gap-6 py-6">
          <div
            className={`relative w-32 h-32 rounded-full flex items-center justify-center transition-all ${
              state === "live"
                ? agentSpeaking
                  ? "bg-emerald-500/20 ring-4 ring-emerald-500/40 animate-pulse"
                  : "bg-blue-500/20 ring-4 ring-blue-500/30"
                : "bg-white/5 ring-1 ring-white/10"
            }`}
          >
            {state === "connecting" ? (
              <Loader2 className="w-10 h-10 text-blue-400 animate-spin" />
            ) : (
              <AudioLines
                className={`w-12 h-12 ${
                  state === "live" ? "text-emerald-300" : "text-gray-500"
                }`}
              />
            )}
          </div>

          <div className="text-sm text-gray-400 h-5">
            {state === "idle" && "Ready to start"}
            {state === "connecting" && "Connecting…"}
            {state === "live" &&
              (agentSpeaking ? "Agent is speaking…" : "Listening…")}
            {state === "ended" && "Call ended"}
            {state === "error" && (
              <span className="text-red-400">{error}</span>
            )}
          </div>
        </div>

        {state === "live" && (
          <div className="mb-4 px-3 py-2.5 rounded-lg bg-white/[0.03] border border-white/10">
            <div className="flex items-center justify-between text-[11px] uppercase tracking-wide text-gray-500 mb-2">
              <span className="flex items-center gap-1.5">
                <Activity className="w-3 h-3" /> Latency
              </span>
              <span className="text-gray-400 normal-case tracking-normal">
                total {totalMs > 0 ? `${Math.round(totalMs)}ms` : "—"}
              </span>
            </div>
            <div className="grid grid-cols-3 gap-2 text-center">
              <HudCell label="STT" ms={hud.stt_ms} />
              <HudCell label="LLM" ms={hud.llm_ms} />
              <HudCell label="TTS" ms={hud.tts_ms} />
            </div>
          </div>
        )}

        <div className="flex items-center justify-center gap-3">
          {state === "idle" || state === "ended" || state === "error" ? (
            <button
              onClick={start}
              className="px-5 py-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-semibold flex items-center gap-2"
            >
              <Mic className="w-4 h-4" /> Start conversation
            </button>
          ) : (
            <>
              <button
                onClick={toggleMute}
                className={`px-4 py-3 rounded-xl border text-sm font-medium flex items-center gap-2 ${
                  muted
                    ? "bg-yellow-500/10 border-yellow-500/30 text-yellow-300"
                    : "bg-white/5 border-white/10 text-white"
                }`}
              >
                {muted ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
                {muted ? "Unmute" : "Mute"}
              </button>
              <button
                onClick={hangup}
                className="px-5 py-3 rounded-xl bg-red-600 hover:bg-red-500 text-white font-semibold"
              >
                End call
              </button>
            </>
          )}
        </div>

        <div ref={audioRef} className="hidden" />
      </div>
    </div>
  );
}

function HudCell({ label, ms }: { label: string; ms: number | undefined }) {
  const display = typeof ms === "number" ? `${Math.round(ms)}ms` : "—";
  const color =
    typeof ms !== "number"
      ? "text-gray-500"
      : ms < 400
        ? "text-emerald-300"
        : ms < 900
          ? "text-yellow-300"
          : "text-red-300";
  return (
    <div className="bg-white/5 rounded-md px-2 py-1.5 border border-white/5">
      <div className="text-[10px] uppercase text-gray-500">{label}</div>
      <div className={`font-mono text-sm font-semibold ${color}`}>{display}</div>
    </div>
  );
}
