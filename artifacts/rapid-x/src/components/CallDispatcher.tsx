import { useState } from "react";
import { Phone, MessageSquare, Loader2, Bot, CheckCircle, AlertCircle } from "lucide-react";
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
        body: JSON.stringify({ phoneNumber, prompt, agentId: effectiveAgentId }),
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
    <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
      {/* Header */}
      <div className="px-6 py-4 border-b border-gray-100 flex items-center gap-3">
        <div className="w-8 h-8 rounded-lg bg-violet-100 flex items-center justify-center">
          <Phone className="w-4 h-4 text-violet-600" />
        </div>
        <div>
          <h2 className="text-sm font-semibold text-gray-900">Single Call</h2>
          <p className="text-[11px] text-gray-400">Dispatch one outbound call</p>
        </div>
      </div>

      <form onSubmit={handleDispatch} className="px-6 py-5 space-y-4">
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
              className="w-full px-3.5 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-violet-500/20 focus:border-violet-400 appearance-none"
            >
              {agents.map((a) => (
                <option key={a.id} value={a.id}>{a.name}</option>
              ))}
            </select>
          )}
        </div>

        {/* Phone number */}
        <div className="space-y-1.5">
          <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide flex items-center gap-1.5">
            <Phone className="w-3.5 h-3.5" /> Phone number
          </label>
          <input
            type="tel"
            placeholder="+1 (555) 000-0000"
            required
            value={phoneNumber}
            onChange={(e) => setPhoneNumber(e.target.value)}
            className="w-full px-3.5 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm text-gray-800 placeholder:text-gray-300 focus:outline-none focus:ring-2 focus:ring-violet-500/20 focus:border-violet-400"
          />
        </div>

        {/* Context */}
        <div className="space-y-1.5">
          <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide flex items-center gap-1.5">
            <MessageSquare className="w-3.5 h-3.5" /> Call context{" "}
            <span className="normal-case font-normal text-gray-400">(optional)</span>
          </label>
          <textarea
            placeholder="e.g. The customer ordered a large pepperoni pizza for delivery to 123 Main St."
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            className="w-full px-3.5 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm text-gray-800 placeholder:text-gray-300 focus:outline-none focus:ring-2 focus:ring-violet-500/20 focus:border-violet-400 h-20 resize-none"
          />
          <p className="text-[11px] text-gray-400">Appended to the assistant's system prompt for this call only.</p>
        </div>

        <button
          type="submit"
          disabled={status === "loading" || agents.length === 0}
          className="w-full py-2.5 px-4 bg-violet-600 hover:bg-violet-700 disabled:opacity-40 text-white text-sm font-semibold rounded-xl transition-colors shadow-sm shadow-violet-200 flex items-center justify-center gap-2"
        >
          {status === "loading" ? (
            <><Loader2 className="w-4 h-4 animate-spin" /> Dispatching…</>
          ) : (
            <><Phone className="w-4 h-4" /> Dispatch call</>
          )}
        </button>

        {message && (
          <div className={`flex items-start gap-2 p-3 rounded-xl text-xs border ${
            status === "success"
              ? "bg-emerald-50 text-emerald-700 border-emerald-200"
              : "bg-red-50 text-red-700 border-red-200"
          }`}>
            {status === "success" ? (
              <CheckCircle className="w-4 h-4 shrink-0 mt-0.5" />
            ) : (
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
            )}
            {message}
          </div>
        )}
      </form>
    </div>
  );
}
