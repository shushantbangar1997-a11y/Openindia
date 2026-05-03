import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  Bot,
  Plus,
  Save,
  Trash2,
  Loader2,
  Mic,
  CheckCircle,
} from "lucide-react";
import { type Agent, useAgents } from "@/lib/agents";
import { apiSend } from "@/lib/api";
import { LANGUAGES, VOICES } from "@/lib/voices";
import AgentTestModal from "@/components/AgentTestModal";

const EMPTY: Omit<Agent, "id" | "created_at" | "updated_at"> = {
  name: "",
  system_prompt: "",
  greeting: "",
  voice_id: "aura-asteria-en",
  language: "en",
  wait_for_user_first: false,
};

export default function AgentsPage() {
  const qc = useQueryClient();
  const { data, isLoading } = useAgents();
  const agents = data?.agents ?? [];

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [draft, setDraft] = useState(EMPTY);
  const [creating, setCreating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [testOpen, setTestOpen] = useState(false);

  // Auto-select first agent on load.
  useEffect(() => {
    if (!selectedId && !creating && agents.length > 0) {
      setSelectedId(agents[0]!.id);
    }
  }, [agents, selectedId, creating]);

  // Sync draft when selection changes.
  useEffect(() => {
    if (creating) {
      setDraft(EMPTY);
      return;
    }
    const a = agents.find((x) => x.id === selectedId);
    if (a) setDraft({ ...a });
  }, [selectedId, creating, agents]);

  const onPick = (id: string) => {
    setCreating(false);
    setSelectedId(id);
    setSavedAt(null);
  };

  const onNew = () => {
    setCreating(true);
    setSelectedId(null);
    setDraft({ ...EMPTY, name: "New Agent" });
    setSavedAt(null);
  };

  const onSave = async () => {
    if (!draft.name.trim()) return;
    setSaving(true);
    try {
      if (creating) {
        const r = await apiSend<{ agent: Agent }>("/agents", "POST", draft);
        setCreating(false);
        setSelectedId(r.agent.id);
      } else if (selectedId) {
        await apiSend<{ agent: Agent }>(
          `/agents/${selectedId}`,
          "PATCH",
          draft,
        );
      }
      await qc.invalidateQueries({ queryKey: ["agents"] });
      setSavedAt(Date.now());
    } finally {
      setSaving(false);
    }
  };

  const onDelete = async () => {
    if (!selectedId) return;
    if (!confirm(`Delete agent "${draft.name}"?`)) return;
    await apiSend(`/agents/${selectedId}`, "DELETE");
    await qc.invalidateQueries({ queryKey: ["agents"] });
    setSelectedId(null);
  };

  return (
    <main className="z-10 px-6 py-8 max-w-6xl mx-auto">
      <header className="mb-8">
        <h1 className="text-3xl font-bold flex items-center gap-3">
          <Bot className="w-7 h-7 text-purple-400" />
          AI Agents
        </h1>
        <p className="text-gray-400 mt-1">
          Define how your agent talks. Train it with a prompt — it'll use that
          on every call.
        </p>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-[280px_1fr] gap-6">
        {/* List */}
        <aside className="bg-black/60 border border-white/10 rounded-2xl p-3 h-fit">
          <button
            onClick={onNew}
            className="w-full mb-3 px-3 py-2 rounded-lg bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-500 hover:to-purple-500 text-white text-sm font-semibold flex items-center justify-center gap-2"
          >
            <Plus className="w-4 h-4" /> New Agent
          </button>
          {isLoading && <div className="p-3 text-sm text-gray-500">Loading…</div>}
          {agents.map((a) => {
            const active = !creating && a.id === selectedId;
            return (
              <button
                key={a.id}
                onClick={() => onPick(a.id)}
                className={`w-full text-left px-3 py-2 rounded-lg text-sm mb-1 transition ${
                  active
                    ? "bg-white/10 text-white"
                    : "text-gray-400 hover:bg-white/5 hover:text-white"
                }`}
              >
                <div className="font-medium truncate">{a.name}</div>
                <div className="text-[11px] text-gray-500 truncate">
                  {a.voice_id}
                </div>
              </button>
            );
          })}
        </aside>

        {/* Editor */}
        <section className="bg-black/60 border border-white/10 rounded-2xl p-6 space-y-5">
          {!creating && agents.length === 0 && !isLoading ? (
            <div className="text-gray-400 text-sm">
              No agents yet. Click <b>New Agent</b> to create one.
            </div>
          ) : (
            <>
              <div className="flex items-start justify-between gap-4">
                <input
                  value={draft.name}
                  onChange={(e) =>
                    setDraft({ ...draft, name: e.target.value })
                  }
                  placeholder="Agent name"
                  className="flex-1 px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-lg font-semibold focus:outline-none focus:ring-2 focus:ring-purple-500"
                />
                <div className="flex items-center gap-2">
                  {!creating && selectedId && (
                    <>
                      <button
                        onClick={() => setTestOpen(true)}
                        className="px-3 py-2 rounded-lg bg-emerald-600/20 hover:bg-emerald-600/30 border border-emerald-500/30 text-emerald-300 text-sm font-medium flex items-center gap-2"
                      >
                        <Mic className="w-4 h-4" /> Test in browser
                      </button>
                      <button
                        onClick={onDelete}
                        className="p-2 rounded-lg bg-red-500/10 hover:bg-red-500/20 border border-red-500/20 text-red-400"
                        aria-label="Delete agent"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </>
                  )}
                </div>
              </div>

              <Field label="System prompt (the agent's personality & instructions)">
                <textarea
                  value={draft.system_prompt}
                  onChange={(e) =>
                    setDraft({ ...draft, system_prompt: e.target.value })
                  }
                  rows={10}
                  placeholder={
                    "You are a friendly receptionist for Acme Dental.\nKeep replies short. Ask the caller what they need, then offer to book an appointment Mon–Fri 9am–5pm."
                  }
                  className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-lg font-mono text-sm focus:outline-none focus:ring-2 focus:ring-purple-500 resize-y"
                />
              </Field>

              <Field label="Opening line (what the agent says first)">
                <textarea
                  value={draft.greeting}
                  onChange={(e) =>
                    setDraft({ ...draft, greeting: e.target.value })
                  }
                  rows={2}
                  placeholder="Hi, this is Sarah from Acme Dental — how can I help?"
                  className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-purple-500 resize-y"
                />
              </Field>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Field label="Voice">
                  <select
                    value={draft.voice_id}
                    onChange={(e) =>
                      setDraft({ ...draft, voice_id: e.target.value })
                    }
                    className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
                  >
                    {VOICES.map((v) => (
                      <option key={v.id} value={v.id}>
                        {v.label}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Language">
                  <select
                    value={draft.language}
                    onChange={(e) =>
                      setDraft({ ...draft, language: e.target.value })
                    }
                    className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
                  >
                    {LANGUAGES.map((l) => (
                      <option key={l.id} value={l.id}>
                        {l.label}
                      </option>
                    ))}
                  </select>
                </Field>
              </div>

              <label className="flex items-center gap-3 text-sm text-gray-300">
                <input
                  type="checkbox"
                  checked={draft.wait_for_user_first}
                  onChange={(e) =>
                    setDraft({
                      ...draft,
                      wait_for_user_first: e.target.checked,
                    })
                  }
                  className="w-4 h-4 accent-purple-500"
                />
                Wait for the caller to speak first (don't auto-greet)
              </label>

              <div className="pt-3 border-t border-white/5 flex items-center gap-3">
                <button
                  onClick={onSave}
                  disabled={saving || !draft.name.trim()}
                  className="px-4 py-2 rounded-lg bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-500 hover:to-purple-500 disabled:opacity-50 text-white font-semibold flex items-center gap-2"
                >
                  {saving ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Save className="w-4 h-4" />
                  )}
                  {creating ? "Create Agent" : "Save Changes"}
                </button>
                {savedAt && (
                  <span className="text-xs text-emerald-400 flex items-center gap-1">
                    <CheckCircle className="w-4 h-4" /> Saved
                  </span>
                )}
              </div>
            </>
          )}
        </section>
      </div>

      {testOpen && selectedId && (
        <AgentTestModal
          agentId={selectedId}
          agentName={draft.name}
          onClose={() => setTestOpen(false)}
        />
      )}
    </main>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <label className="text-xs uppercase tracking-wide text-gray-500 font-medium">
        {label}
      </label>
      {children}
    </div>
  );
}
