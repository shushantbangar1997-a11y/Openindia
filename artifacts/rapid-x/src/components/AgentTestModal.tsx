import { useEffect, useRef, useState } from "react";
import { Mic, MicOff, Loader2, X, AudioLines } from "lucide-react";
import { Room, RoomEvent, Track, type RemoteTrack, type RemoteParticipant } from "livekit-client";
import { apiSend } from "@/lib/api";

type State = "idle" | "connecting" | "live" | "ended" | "error";

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
  const roomRef = useRef<Room | null>(null);
  const audioRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    return () => {
      // Cleanup on unmount
      roomRef.current?.disconnect().catch(() => {});
    };
  }, []);

  const start = async () => {
    setState("connecting");
    setError("");
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
