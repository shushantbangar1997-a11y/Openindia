import { useState } from "react";
import {
  Phone,
  User,
  Bot,
  Loader2,
  Clock,
  Calendar,
  Activity,
  Sparkles,
  TrendingUp,
  TrendingDown,
  Minus,
} from "lucide-react";
import { useCall, useCalls, type CallRecord, type CallOutcome, type CallSentiment } from "@/lib/agents";

export default function CallsPage() {
  const { data, isLoading } = useCalls(4000);
  const calls = data?.calls ?? [];
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const selected = selectedId ?? calls[0]?.id ?? null;

  return (
    <div className="flex h-screen overflow-hidden bg-[#F4F5F7]">
      {/* Call list panel */}
      <div className="w-[300px] shrink-0 bg-white border-r border-gray-200 flex flex-col h-full">
        <div className="px-5 py-4 border-b border-gray-100">
          <h1 className="text-[15px] font-semibold text-gray-900">Call History</h1>
          <p className="text-xs text-gray-400 mt-0.5">
            {calls.length} call{calls.length !== 1 ? "s" : ""} recorded
          </p>
        </div>
        <div className="flex-1 overflow-y-auto py-2 px-2">
          {isLoading && (
            <div className="flex items-center gap-2 px-3 py-4 text-xs text-gray-400">
              <Loader2 className="w-3.5 h-3.5 animate-spin" /> Loading…
            </div>
          )}
          {calls.length === 0 && !isLoading && (
            <div className="px-3 py-10 text-center">
              <Phone className="w-8 h-8 text-gray-200 mx-auto mb-2" />
              <p className="text-xs text-gray-400">No calls yet</p>
              <p className="text-[11px] text-gray-300 mt-1">Dispatch a call from the Dispatch page</p>
            </div>
          )}
          {calls.map((c) => (
            <button
              key={c.id}
              onClick={() => setSelectedId(c.id)}
              className={`w-full text-left px-3 py-3 rounded-lg mb-0.5 transition-all border ${
                c.id === selected
                  ? "bg-violet-50 border-violet-200"
                  : "border-transparent hover:bg-gray-50"
              }`}
            >
              <div className="flex items-center justify-between gap-2 mb-1">
                <span className={`text-sm font-semibold truncate ${c.id === selected ? "text-violet-700" : "text-gray-800"}`}>
                  {c.phone_number}
                </span>
                <StatusPill status={c.status} />
              </div>
              <div className="flex items-center justify-between text-[11px] text-gray-400 mb-1">
                <span className="truncate">{c.agent_name ?? "—"}</span>
                <span className="shrink-0 ml-2">{formatRelative(c.started_at)}</span>
              </div>
              {c.summary && (
                <p className="text-[11px] text-gray-500 leading-relaxed line-clamp-2 mt-0.5">
                  {c.summary}
                </p>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Detail panel */}
      <div className="flex-1 flex flex-col h-full overflow-hidden">
        {selected ? (
          <CallDetail callId={selected} />
        ) : (
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center">
              <Phone className="w-10 h-10 text-gray-200 mx-auto mb-3" />
              <p className="text-sm text-gray-400">Select a call to view its details</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function CallDetail({ callId }: { callId: string }) {
  const { data, isLoading } = useCall(callId, 3000);
  const c = data?.call;

  if (isLoading || !c) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="flex items-center gap-2 text-sm text-gray-400">
          <Loader2 className="w-4 h-4 animate-spin" /> Loading call…
        </div>
      </div>
    );
  }

  const showSummaryCard =
    c.summary ||
    (c.status === "ended" && c.transcript.length > 0 && !c.summary);

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-6 py-4 shrink-0">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gray-100 flex items-center justify-center">
              <Phone className="w-5 h-5 text-gray-500" />
            </div>
            <div>
              <h2 className="text-base font-semibold text-gray-900">{c.phone_number}</h2>
              <p className="text-xs text-gray-400">{c.agent_name ?? "Unknown agent"}</p>
            </div>
          </div>
          <StatusPill status={c.status} />
        </div>

        {/* Meta grid */}
        <div className="grid grid-cols-4 gap-3 mt-4">
          <MetaCard icon={<Calendar className="w-3.5 h-3.5" />} label="Started" value={new Date(c.started_at).toLocaleString()} />
          <MetaCard icon={<Clock className="w-3.5 h-3.5" />} label="Duration" value={formatDuration(c)} />
          <MetaCard icon={<Bot className="w-3.5 h-3.5" />} label="Agent" value={c.agent_name ?? "—"} />
          <MetaCard icon={<Activity className="w-3.5 h-3.5" />} label="End reason" value={c.end_reason ?? "—"} />
        </div>
      </div>

      {/* Scrollable body */}
      <div className="flex-1 overflow-y-auto px-6 py-5 space-y-6">
        {/* AI Summary card — appears before transcript */}
        {showSummaryCard && <SummaryCard call={c} />}

        {/* Transcript */}
        <div>
          <h3 className="text-[11px] uppercase tracking-widest text-gray-400 font-semibold mb-4">
            Transcript
          </h3>
          {c.transcript.length === 0 ? (
            <div className="text-sm text-gray-400 py-10 text-center">
              {c.status === "ringing" || c.status === "answered"
                ? "Waiting for the conversation to start…"
                : "No transcript captured for this call."}
            </div>
          ) : (
            <div className="space-y-3 max-w-2xl">
              {c.transcript.map((t, i) => (
                <div key={i} className={`flex gap-3 ${t.role === "assistant" ? "" : "flex-row-reverse"}`}>
                  <div className={`shrink-0 w-8 h-8 rounded-full flex items-center justify-center ${
                    t.role === "assistant" ? "bg-violet-100 text-violet-600" : "bg-blue-100 text-blue-600"
                  }`}>
                    {t.role === "assistant" ? <Bot className="w-4 h-4" /> : <User className="w-4 h-4" />}
                  </div>
                  <div className={`max-w-[75%] px-4 py-2.5 rounded-2xl text-sm ${
                    t.role === "assistant"
                      ? "bg-white border border-gray-200 text-gray-800 rounded-tl-sm"
                      : "bg-violet-600 text-white rounded-tr-sm"
                  }`}>
                    {t.text}
                    <div className={`text-[10px] mt-1 ${t.role === "assistant" ? "text-gray-400" : "text-violet-200"}`}>
                      {new Date(t.ts).toLocaleTimeString()}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function SummaryCard({ call: c }: { call: CallRecord }) {
  const generating = c.status === "ended" && c.transcript.length > 0 && !c.summary;

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
      <div className="flex items-center gap-2 mb-3">
        <div className="w-7 h-7 rounded-lg bg-violet-50 flex items-center justify-center">
          <Sparkles className="w-3.5 h-3.5 text-violet-500" />
        </div>
        <span className="text-[11px] font-semibold uppercase tracking-widest text-gray-400">
          AI Summary
        </span>
      </div>

      {generating ? (
        <div className="flex items-center gap-2 text-sm text-gray-400 py-1">
          <Loader2 className="w-3.5 h-3.5 animate-spin shrink-0" />
          <span>Generating summary…</span>
        </div>
      ) : (
        <>
          <p className="text-sm text-gray-700 leading-relaxed mb-4">{c.summary}</p>
          <div className="flex items-center gap-2 flex-wrap">
            {c.outcome && <OutcomeBadge outcome={c.outcome} />}
            {c.sentiment && <SentimentChip sentiment={c.sentiment} />}
          </div>
        </>
      )}
    </div>
  );
}

const OUTCOME_CFG: Record<CallOutcome, { label: string; color: string }> = {
  completed:   { label: "Completed",  color: "bg-emerald-50 text-emerald-700 border-emerald-200" },
  "no-answer": { label: "No answer",  color: "bg-gray-100 text-gray-600 border-gray-200" },
  voicemail:   { label: "Voicemail",  color: "bg-blue-50 text-blue-600 border-blue-200" },
  escalated:   { label: "Escalated",  color: "bg-amber-50 text-amber-700 border-amber-200" },
};

function OutcomeBadge({ outcome }: { outcome: CallOutcome }) {
  const cfg = OUTCOME_CFG[outcome];
  return (
    <span className={`inline-flex items-center px-2.5 py-1 rounded-lg text-[11px] font-semibold border ${cfg.color}`}>
      {cfg.label}
    </span>
  );
}

const SENTIMENT_CFG: Record<CallSentiment, { label: string; icon: React.ReactNode; color: string }> = {
  positive: { label: "Positive", icon: <TrendingUp className="w-3 h-3" />,   color: "bg-emerald-50 text-emerald-600 border-emerald-200" },
  neutral:  { label: "Neutral",  icon: <Minus className="w-3 h-3" />,        color: "bg-gray-100 text-gray-500 border-gray-200" },
  negative: { label: "Negative", icon: <TrendingDown className="w-3 h-3" />, color: "bg-red-50 text-red-600 border-red-200" },
};

function SentimentChip({ sentiment }: { sentiment: CallSentiment }) {
  const cfg = SENTIMENT_CFG[sentiment];
  return (
    <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-semibold border ${cfg.color}`}>
      {cfg.icon}
      {cfg.label}
    </span>
  );
}

function MetaCard({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="bg-gray-50 rounded-xl px-3 py-2.5 border border-gray-100">
      <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wide text-gray-400 font-semibold mb-1">
        <span className="text-gray-400">{icon}</span>
        {label}
      </div>
      <div className="text-xs font-semibold text-gray-700 truncate">{value}</div>
    </div>
  );
}

function StatusPill({ status }: { status: CallRecord["status"] }) {
  const cfg: Record<CallRecord["status"], { bg: string; text: string; dot: string }> = {
    ringing:  { bg: "bg-amber-50 border-amber-200",    text: "text-amber-700",   dot: "bg-amber-400" },
    answered: { bg: "bg-emerald-50 border-emerald-200", text: "text-emerald-700", dot: "bg-emerald-400" },
    ended:    { bg: "bg-gray-100 border-gray-200",     text: "text-gray-500",    dot: "bg-gray-400" },
    failed:   { bg: "bg-red-50 border-red-200",        text: "text-red-600",     dot: "bg-red-400" },
  };
  const s = cfg[status];
  return (
    <span className={`inline-flex items-center gap-1.5 text-[11px] font-semibold px-2 py-0.5 rounded-full border ${s.bg} ${s.text}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${s.dot}`} />
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
