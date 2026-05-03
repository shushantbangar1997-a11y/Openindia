import { useEffect, useRef, useState } from "react";
import { Mic, MicOff, Loader2, X, AudioLines, Activity, Phone, PhoneOff } from "lucide-react";
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
  stt_ms?: number;
  llm_ms?: number;
  tts_ms?: number;
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
    return () => { roomRef.current?.disconnect().catch(() => {}); };
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

      room.on(RoomEvent.TrackSubscribed, (track: RemoteTrack, _pub, _p: RemoteParticipant) => {
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
      });

      room.on(RoomEvent.ActiveSpeakersChanged, (speakers) => {
        const remote = speakers.some((s) => s.identity !== room.localParticipant.identity);
        setAgentSpeaking(remote);
      });

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
              if (next.stt_ms === undefined) next.stt_ms = data.duration;
            }
            return next;
          });
        } catch {}
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

  const totalMs = (hud.stt_ms ?? 0) + (hud.llm_ms ?? 0) + (hud.tts_ms ?? 0);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
      <div className="relative w-full max-w-sm bg-white rounded-2xl shadow-2xl overflow-hidden border border-gray-200">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-violet-100 flex items-center justify-center">
              <Phone className="w-4 h-4 text-violet-600" />
            </div>
            <div>
              <div className="text-sm font-semibold text-gray-900">Test call</div>
              <div className="text-[11px] text-gray-400">{agentName}</div>
            </div>
          </div>
          <button
            onClick={hangup}
            className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Main call area */}
        <div className="px-5 py-8 flex flex-col items-center gap-5">
          {/* Avatar / status ring */}
          <div className="relative">
            <div
              className={`w-24 h-24 rounded-full flex items-center justify-center transition-all duration-300 ${
                state === "live"
                  ? agentSpeaking
                    ? "bg-violet-100 ring-4 ring-violet-300 ring-offset-2"
                    : "bg-gray-100 ring-4 ring-gray-200 ring-offset-2"
                  : "bg-gray-100"
              }`}
            >
              {state === "connecting" ? (
                <Loader2 className="w-10 h-10 text-violet-400 animate-spin" />
              ) : (
                <AudioLines
                  className={`w-10 h-10 transition-colors ${
                    state === "live"
                      ? agentSpeaking
                        ? "text-violet-600"
                        : "text-gray-400"
                      : "text-gray-300"
                  }`}
                />
              )}
            </div>
            {state === "live" && (
              <span className="absolute -bottom-1 -right-1 w-5 h-5 rounded-full bg-emerald-500 border-2 border-white flex items-center justify-center">
                <span className="w-1.5 h-1.5 rounded-full bg-white animate-ping" />
              </span>
            )}
          </div>

          <div className="text-sm font-medium text-gray-600 text-center">
            {state === "idle" && "Ready to connect"}
            {state === "connecting" && "Connecting…"}
            {state === "live" && (agentSpeaking ? "Agent is speaking…" : "Listening for you…")}
            {state === "ended" && "Call ended"}
            {state === "error" && <span className="text-red-500">{error}</span>}
          </div>
        </div>

        {/* Latency HUD */}
        {state === "live" && (
          <div className="mx-5 mb-4 px-4 py-3 rounded-xl bg-gray-50 border border-gray-200">
            <div className="flex items-center justify-between text-[10px] uppercase tracking-wide text-gray-400 font-semibold mb-2">
              <span className="flex items-center gap-1"><Activity className="w-3 h-3" /> Latency</span>
              <span className="normal-case tracking-normal text-gray-500">
                total {totalMs > 0 ? `${Math.round(totalMs)} ms` : "—"}
              </span>
            </div>
            <div className="grid grid-cols-3 gap-2">
              <HudCell label="STT" ms={hud.stt_ms} />
              <HudCell label="LLM" ms={hud.llm_ms} />
              <HudCell label="TTS" ms={hud.tts_ms} />
            </div>
          </div>
        )}

        {/* Controls */}
        <div className="px-5 py-4 border-t border-gray-100 flex items-center justify-center gap-3">
          {state === "idle" || state === "ended" || state === "error" ? (
            <button
              onClick={start}
              className="flex items-center gap-2 px-6 py-2.5 bg-violet-600 hover:bg-violet-700 text-white text-sm font-semibold rounded-xl transition-colors shadow-sm shadow-violet-200"
            >
              <Mic className="w-4 h-4" /> Start call
            </button>
          ) : (
            <>
              <button
                onClick={toggleMute}
                className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold transition-colors border ${
                  muted
                    ? "bg-amber-50 border-amber-200 text-amber-700 hover:bg-amber-100"
                    : "bg-gray-100 border-gray-200 text-gray-700 hover:bg-gray-200"
                }`}
              >
                {muted ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
                {muted ? "Unmute" : "Mute"}
              </button>
              <button
                onClick={hangup}
                className="flex items-center gap-2 px-4 py-2.5 bg-red-500 hover:bg-red-600 text-white text-sm font-semibold rounded-xl transition-colors"
              >
                <PhoneOff className="w-4 h-4" /> End call
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
  const display = typeof ms === "number" ? `${Math.round(ms)} ms` : "—";
  const color =
    typeof ms !== "number" ? "text-gray-400"
    : ms < 400 ? "text-emerald-600"
    : ms < 900 ? "text-amber-600"
    : "text-red-500";
  return (
    <div className="bg-white rounded-lg px-2 py-2 border border-gray-200 text-center">
      <div className="text-[10px] uppercase text-gray-400 font-semibold mb-1">{label}</div>
      <div className={`font-mono text-xs font-bold ${color}`}>{display}</div>
    </div>
  );
}
