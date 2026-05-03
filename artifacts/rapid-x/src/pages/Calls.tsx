import { useState } from "react";
import { History, Phone, User, Bot, Loader2 } from "lucide-react";
import { useCall, useCalls, type CallRecord } from "@/lib/agents";

export default function CallsPage() {
  const { data, isLoading } = useCalls(4000);
  const calls = data?.calls ?? [];
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const selected = selectedId ?? calls[0]?.id ?? null;

  return (
    <main className="z-10 px-6 py-8 max-w-6xl mx-auto">
      <header className="mb-6">
        <h1 className="text-3xl font-bold flex items-center gap-3">
          <History className="w-7 h-7 text-blue-400" />
          Call History
        </h1>
        <p className="text-gray-400 mt-1">
          Every call your agents have made. Click one for the live transcript.
        </p>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-[360px_1fr] gap-6">
        <aside className="bg-black/60 border border-white/10 rounded-2xl p-3 h-fit max-h-[70vh] overflow-y-auto">
          {isLoading && (
            <div className="p-3 text-sm text-gray-500 flex items-center gap-2">
              <Loader2 className="w-4 h-4 animate-spin" /> Loading…
            </div>
          )}
          {calls.length === 0 && !isLoading && (
            <div className="p-4 text-sm text-gray-500">
              No calls yet. Dispatch one from the Dispatch tab.
            </div>
          )}
          {calls.map((c) => (
            <button
              key={c.id}
              onClick={() => setSelectedId(c.id)}
              className={`w-full text-left px-3 py-3 rounded-lg text-sm mb-1 transition ${
                c.id === selected
                  ? "bg-white/10"
                  : "hover:bg-white/5"
              }`}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="font-medium text-white truncate">
                  {c.phone_number}
                </span>
                <StatusPill status={c.status} />
              </div>
              <div className="text-[11px] text-gray-500 mt-1 flex items-center justify-between">
                <span className="truncate">{c.agent_name ?? "—"}</span>
                <span>{formatRelative(c.started_at)}</span>
              </div>
            </button>
          ))}
        </aside>

        <section className="bg-black/60 border border-white/10 rounded-2xl p-6 min-h-[60vh]">
          {selected ? (
            <CallDetail callId={selected} />
          ) : (
            <div className="text-gray-500 text-sm">Select a call to view its transcript.</div>
          )}
        </section>
      </div>
    </main>
  );
}

function CallDetail({ callId }: { callId: string }) {
  const { data, isLoading } = useCall(callId, 3000);
  const c = data?.call;
  if (isLoading || !c) {
    return (
      <div className="text-sm text-gray-500 flex items-center gap-2">
        <Loader2 className="w-4 h-4 animate-spin" /> Loading call…
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <header className="border-b border-white/5 pb-4">
        <div className="flex items-center justify-between gap-3 mb-2">
          <h2 className="text-xl font-bold flex items-center gap-2">
            <Phone className="w-5 h-5 text-blue-400" />
            {c.phone_number}
          </h2>
          <StatusPill status={c.status} />
        </div>
        <div className="text-sm text-gray-400 grid grid-cols-2 gap-2 mt-3">
          <Meta label="Agent" value={c.agent_name ?? "—"} />
          <Meta label="Duration" value={formatDuration(c)} />
          <Meta label="Started" value={new Date(c.started_at).toLocaleString()} />
          <Meta
            label="Ended"
            value={c.ended_at ? new Date(c.ended_at).toLocaleString() : "—"}
          />
          {c.end_reason && (
            <Meta label="End reason" value={c.end_reason} />
          )}
        </div>
      </header>

      <div>
        <h3 className="text-xs uppercase tracking-wide text-gray-500 font-semibold mb-3">
          Transcript
        </h3>
        {c.transcript.length === 0 ? (
          <div className="text-sm text-gray-500">
            {c.status === "ringing" || c.status === "answered"
              ? "Waiting for the conversation to start…"
              : "No transcript captured for this call."}
          </div>
        ) : (
          <div className="space-y-3 max-h-[55vh] overflow-y-auto pr-2">
            {c.transcript.map((t, i) => (
              <div
                key={i}
                className={`flex gap-3 ${
                  t.role === "assistant" ? "" : "flex-row-reverse"
                }`}
              >
                <div
                  className={`shrink-0 w-8 h-8 rounded-full flex items-center justify-center ${
                    t.role === "assistant"
                      ? "bg-purple-500/20 text-purple-300"
                      : "bg-blue-500/20 text-blue-300"
                  }`}
                >
                  {t.role === "assistant" ? (
                    <Bot className="w-4 h-4" />
                  ) : (
                    <User className="w-4 h-4" />
                  )}
                </div>
                <div
                  className={`max-w-[75%] px-4 py-2 rounded-2xl text-sm ${
                    t.role === "assistant"
                      ? "bg-white/5 text-gray-100 rounded-tl-sm"
                      : "bg-blue-600/20 text-blue-50 rounded-tr-sm"
                  }`}
                >
                  {t.text}
                  <div className="text-[10px] text-gray-500 mt-1">
                    {new Date(t.ts).toLocaleTimeString()}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function Meta({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wide text-gray-500">
        {label}
      </div>
      <div className="text-gray-200">{value}</div>
    </div>
  );
}

function StatusPill({ status }: { status: CallRecord["status"] }) {
  const styles: Record<CallRecord["status"], string> = {
    ringing: "bg-amber-500/15 text-amber-300 border-amber-500/30",
    answered: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30",
    ended: "bg-gray-500/15 text-gray-300 border-gray-500/30",
    failed: "bg-red-500/15 text-red-300 border-red-500/30",
  };
  return (
    <span
      className={`text-[10px] uppercase tracking-wide px-2 py-0.5 rounded-full border ${styles[status]}`}
    >
      {status}
    </span>
  );
}

function formatRelative(iso: string) {
  const d = new Date(iso).getTime();
  const diff = Date.now() - d;
  const mins = Math.round(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return new Date(iso).toLocaleDateString();
}

function formatDuration(c: CallRecord) {
  if (!c.answered_at) return "—";
  const end = c.ended_at ? new Date(c.ended_at).getTime() : Date.now();
  const ms = end - new Date(c.answered_at).getTime();
  const s = Math.max(0, Math.round(ms / 1000));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${String(r).padStart(2, "0")}`;
}
