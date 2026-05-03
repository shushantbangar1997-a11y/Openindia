import { useState } from "react";
import {
  Users,
  FileText,
  Loader2,
  CheckCircle,
  AlertCircle,
  Bot,
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
    if (numbers.length === 0) {
      setStatus("error");
      return;
    }
    try {
      const res = await fetch(apiUrl("/queue"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          numbers,
          prompt,
          agentId: effectiveAgentId,
        }),
      });
      const data = await res.json();
      setResults(data.results || []);
      setStatus(res.ok ? "success" : "error");
    } catch {
      setStatus("error");
    }
  };

  return (
    <div className="relative group max-w-md w-full">
      <div className="absolute -inset-0.5 bg-gradient-to-r from-green-500 to-teal-600 rounded-2xl opacity-75 group-hover:opacity-100 transition duration-1000 group-hover:duration-200 blur-lg" />
      <div className="relative p-8 bg-black/80 backdrop-blur-xl border border-white/10 rounded-2xl shadow-2xl">
        <div className="flex items-center justify-between mb-8">
          <h2 className="text-2xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-green-400 to-teal-400">
            Bulk Operations
          </h2>
          <Users className="w-5 h-5 text-teal-400" />
        </div>

        <form onSubmit={handleBulkDispatch} className="space-y-6">
          <div className="space-y-2">
            <label className="text-sm text-gray-400 font-medium flex items-center gap-2">
              <Bot className="w-4 h-4" /> Agent
            </label>
            {isLoading ? (
              <div className="text-xs text-gray-500">Loading…</div>
            ) : agents.length === 0 ? (
              <div className="text-xs text-amber-400">
                No agents yet.{" "}
                <Link href="/agents" className="underline">
                  Create one →
                </Link>
              </div>
            ) : (
              <select
                value={effectiveAgentId}
                onChange={(e) => setAgentId(e.target.value)}
                className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white outline-none focus:ring-2 focus:ring-green-500"
              >
                {agents.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </select>
            )}
          </div>

          <div className="space-y-2">
            <label className="text-sm text-gray-400 font-medium flex items-center gap-2">
              <Users className="w-4 h-4" /> Phone Numbers
            </label>
            <textarea
              placeholder={"+919876543210\n+919988776655\n+12125551234"}
              required
              value={input}
              onChange={(e) => setInput(e.target.value)}
              className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl focus:ring-2 focus:ring-green-500 focus:border-transparent text-white placeholder-gray-600 outline-none transition-all h-32 resize-none font-mono text-sm"
            />
            <p className="text-xs text-gray-500 text-right">
              Separate by comma or new line
            </p>
          </div>

          <div className="space-y-2">
            <label className="text-sm text-gray-400 font-medium flex items-center gap-2">
              <FileText className="w-4 h-4" /> Campaign context (optional)
            </label>
            <input
              type="text"
              placeholder="e.g. Survey about recent purchase…"
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl focus:ring-2 focus:ring-green-500 focus:border-transparent text-white placeholder-gray-600 outline-none transition-all"
            />
          </div>

          <button
            type="submit"
            disabled={status === "loading" || agents.length === 0}
            className="w-full py-4 px-6 bg-gradient-to-r from-green-600 to-teal-600 hover:from-green-500 hover:to-teal-500 text-white font-bold rounded-xl shadow-lg hover:shadow-green-500/25 transition-all flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {status === "loading" ? (
              <>
                <Loader2 className="w-5 h-5 animate-spin" /> Processing…
              </>
            ) : (
              "Launch Campaign"
            )}
          </button>

          {status === "success" && (
            <div className="max-h-40 overflow-y-auto space-y-2 mt-4">
              {results.map((res, i) => (
                <div
                  key={i}
                  className="flex items-center justify-between p-2 rounded bg-white/5 text-xs"
                >
                  <span className="font-mono text-gray-300">
                    {res.phoneNumber}
                  </span>
                  {res.status === "dispatched" ? (
                    <span className="text-green-400 flex items-center gap-1">
                      <CheckCircle className="w-3 h-3" /> Sent
                    </span>
                  ) : (
                    <span className="text-red-400 flex items-center gap-1">
                      <AlertCircle className="w-3 h-3" /> Failed
                    </span>
                  )}
                </div>
              ))}
            </div>
          )}
        </form>
      </div>
    </div>
  );
}
