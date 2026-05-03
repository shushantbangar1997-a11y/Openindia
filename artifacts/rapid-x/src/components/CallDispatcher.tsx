import { useState } from "react";
import { Phone, MessageSquare, Loader2, Sparkles, Bot } from "lucide-react";
import { Link } from "wouter";
import { apiUrl } from "@/lib/api";
import { useAgents } from "@/lib/agents";

export default function CallDispatcher() {
  const [phoneNumber, setPhoneNumber] = useState("");
  const [prompt, setPrompt] = useState("");
  const [agentId, setAgentId] = useState<string>("");
  const [status, setStatus] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [message, setMessage] = useState("");

  const { data, isLoading } = useAgents();
  const agents = data?.agents ?? [];
  const effectiveAgentId = agentId || agents[0]?.id || "";

  const handleDispatch = async (e: React.FormEvent) => {
    e.preventDefault();
    setStatus("loading");
    setMessage("");
    try {
      const res = await fetch(apiUrl("/dispatch"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          phoneNumber,
          prompt,
          agentId: effectiveAgentId,
        }),
      });
      const j = await res.json();
      if (res.ok) {
        setStatus("success");
        setMessage(`Call dispatched to ${phoneNumber}`);
      } else {
        setStatus("error");
        setMessage(j.error || "Failed to dispatch call");
      }
    } catch (err: any) {
      setStatus("error");
      setMessage(err.message || "Network error");
    }
  };

  return (
    <div className="relative group max-w-md w-full">
      <div className="absolute -inset-0.5 bg-gradient-to-r from-blue-500 to-purple-600 rounded-2xl opacity-75 group-hover:opacity-100 transition duration-1000 group-hover:duration-200 blur-lg" />
      <div className="relative p-8 bg-black/80 backdrop-blur-xl border border-white/10 rounded-2xl shadow-2xl">
        <div className="flex items-center justify-between mb-8">
          <h2 className="text-2xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-blue-400 to-purple-400">
            Deploy Agent
          </h2>
          <Sparkles className="w-5 h-5 text-purple-400 animate-pulse" />
        </div>

        <form onSubmit={handleDispatch} className="space-y-6">
          <div className="space-y-2">
            <label className="text-sm text-gray-400 font-medium flex items-center gap-2">
              <Bot className="w-4 h-4" /> Agent
            </label>
            {isLoading ? (
              <div className="text-xs text-gray-500">Loading agents…</div>
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
                className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white outline-none focus:ring-2 focus:ring-blue-500"
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
              <Phone className="w-4 h-4" /> Phone Number
            </label>
            <input
              type="tel"
              placeholder="+919876543210"
              required
              value={phoneNumber}
              onChange={(e) => setPhoneNumber(e.target.value)}
              className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent text-white placeholder-gray-600 outline-none transition-all"
            />
          </div>

          <div className="space-y-2">
            <label className="text-sm text-gray-400 font-medium flex items-center gap-2">
              <MessageSquare className="w-4 h-4" /> Per-call context (optional)
            </label>
            <textarea
              placeholder="e.g. The customer ordered a large pepperoni pizza for delivery to 123 Main St."
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl focus:ring-2 focus:ring-purple-500 focus:border-transparent text-white placeholder-gray-600 outline-none transition-all h-24 resize-none"
            />
            <p className="text-xs text-gray-500">
              Appended to the agent's system prompt for this call only.
            </p>
          </div>

          <button
            type="submit"
            disabled={status === "loading" || agents.length === 0}
            className="w-full py-4 px-6 bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-500 hover:to-purple-500 text-white font-bold rounded-xl shadow-lg hover:shadow-blue-500/25 transition-all flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {status === "loading" ? (
              <>
                <Loader2 className="w-5 h-5 animate-spin" /> Dispatching…
              </>
            ) : (
              "Initiate Call"
            )}
          </button>

          {message && (
            <div
              className={`p-4 rounded-xl text-sm text-center border ${
                status === "success"
                  ? "bg-green-500/10 text-green-200 border-green-500/20"
                  : "bg-red-500/10 text-red-200 border-red-500/20"
              }`}
            >
              {message}
            </div>
          )}
        </form>
      </div>
    </div>
  );
}
