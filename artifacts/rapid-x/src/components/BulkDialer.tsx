import { useState } from "react";
import {
  Users,
  FileText,
  Loader2,
  CheckCircle,
  AlertCircle,
  Bot,
  Phone,
} from "lucide-react";
import { Link } from "wouter";
import { apiUrl } from "@/lib/api";
import { useAgents } from "@/lib/agents";

type Result = {
  phoneNumber: string;
  status: "dispatched" | "failed";
  id?: string;
  error?: string;
};

export default function BulkDialer() {
  const [input, setInput] = useState("");
  const [prompt, setPrompt] = useState("");
  const [agentId, setAgentId] = useState<string>("");
  const [status, setStatus] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [results, setResults] = useState<Result[]>([]);

  const { data, isLoading } = useAgents();
  const agents = data?.agents ?? [];
  const effectiveAgentId = agentId || agents[0]?.id || "";

  const handleBulkDispatch = async (e: React.FormEvent) => {
    e.preventDefault();
    setStatus("loading");
    setResults([]);
    const numbers = input
      .split(/[\n,]+/)
      .map((s) => s.trim())
      .filter((s) => s.length > 0);
    if (numbers.length === 0) { setStatus("error"); return; }
    try {
      const res = await fetch(apiUrl("/queue"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ numbers, prompt, agentId: effectiveAgentId }),
      });
      const data = await res.json();
      setResults(data.results || []);
      setStatus(res.ok ? "success" : "error");
    } catch { setStatus("error"); }
  };

  const dispatched = results.filter((r) => r.status === "dispatched").length;
  const failed = results.filter((r) => r.status === "failed").length;

  return (
    <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
      {/* Header */}
      <div className="px-6 py-4 border-b border-gray-100 flex items-center gap-3">
        <div className="w-8 h-8 rounded-lg bg-emerald-100 flex items-center justify-center">
          <Users className="w-4 h-4 text-emerald-600" />
        </div>
        <div>
          <h2 className="text-sm font-semibold text-gray-900">Bulk Campaign</h2>
          <p className="text-[11px] text-gray-400">Dispatch calls to multiple numbers</p>
        </div>
      </div>

      <form onSubmit={handleBulkDispatch} className="px-6 py-5 space-y-4">
        {/* Agent picker */}
        <div className="space-y-1.5">
          <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide flex items-center gap-1.5">
            <Bot className="w-3.5 h-3.5" /> Assistant
          </label>
          {isLoading ? (
            <div className="text-xs text-gray-400 flex items-center gap-1.5">
              <Loader2 className="w-3 h-3 animate-spin" /> Loading…
            </div>
          ) : agents.length === 0 ? (
            <div className="text-xs text-amber-600 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2.5">
              No assistants yet.{" "}
              <Link href="/agents" className="underline font-semibold">Create one →</Link>
            </div>
          ) : (
            <select
              value={effectiveAgentId}
              onChange={(e) => setAgentId(e.target.value)}
              className="w-full px-3.5 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-400 appearance-none"
            >
              {agents.map((a) => (
                <option key={a.id} value={a.id}>{a.name}</option>
              ))}
            </select>
          )}
        </div>

        {/* Phone numbers */}
        <div className="space-y-1.5">
          <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide flex items-center gap-1.5">
            <Phone className="w-3.5 h-3.5" /> Phone numbers
          </label>
          <textarea
            placeholder={"+1 (555) 000-0001\n+1 (555) 000-0002\n+1 (555) 000-0003"}
            required
            value={input}
            onChange={(e) => setInput(e.target.value)}
            className="w-full px-3.5 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm text-gray-800 placeholder:text-gray-300 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-400 h-28 resize-none font-mono"
          />
          <p className="text-[11px] text-gray-400 text-right">
            One per line or comma-separated
          </p>
        </div>

        {/* Campaign context */}
        <div className="space-y-1.5">
          <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide flex items-center gap-1.5">
            <FileText className="w-3.5 h-3.5" /> Campaign context{" "}
            <span className="normal-case font-normal text-gray-400">(optional)</span>
          </label>
          <input
            type="text"
            placeholder="e.g. Survey about recent purchase experience…"
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            className="w-full px-3.5 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm text-gray-800 placeholder:text-gray-300 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-400"
          />
        </div>

        <button
          type="submit"
          disabled={status === "loading" || agents.length === 0}
          className="w-full py-2.5 px-4 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-40 text-white text-sm font-semibold rounded-xl transition-colors shadow-sm shadow-emerald-200 flex items-center justify-center gap-2"
        >
          {status === "loading" ? (
            <><Loader2 className="w-4 h-4 animate-spin" /> Launching…</>
          ) : (
            <><Users className="w-4 h-4" /> Launch campaign</>
          )}
        </button>

        {status === "success" && results.length > 0 && (
          <div className="space-y-2">
            <div className="flex items-center gap-3 text-xs font-semibold">
              {dispatched > 0 && (
                <span className="text-emerald-600 flex items-center gap-1">
                  <CheckCircle className="w-3.5 h-3.5" /> {dispatched} dispatched
                </span>
              )}
              {failed > 0 && (
                <span className="text-red-600 flex items-center gap-1">
                  <AlertCircle className="w-3.5 h-3.5" /> {failed} failed
                </span>
              )}
            </div>
            <div className="max-h-36 overflow-y-auto rounded-xl bg-gray-50 border border-gray-200 divide-y divide-gray-100">
              {results.map((res, i) => (
                <div key={i} className="flex items-center justify-between px-3 py-2 text-xs">
                  <span className="font-mono text-gray-600">{res.phoneNumber}</span>
                  {res.status === "dispatched" ? (
                    <span className="text-emerald-600 flex items-center gap-1 font-medium">
                      <CheckCircle className="w-3 h-3" /> Sent
                    </span>
                  ) : (
                    <span className="text-red-500 flex items-center gap-1 font-medium">
                      <AlertCircle className="w-3 h-3" /> Failed
                    </span>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </form>
    </div>
  );
}
