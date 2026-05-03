import { useEffect, useMemo, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  Bot,
  Plus,
  Save,
  Trash2,
  Loader2,
  Mic,
  CheckCircle,
  Sparkles,
  Languages,
  Gauge,
  MessageSquare,
  Settings2,
  AlertCircle,
  Play,
  KeyRound,
  Copy,
} from "lucide-react";
import { type Agent, useAgents, useCatalog } from "@/lib/agents";
import { apiSend, apiUrl } from "@/lib/api";
import {
  DEFAULT_LANGUAGE_ID,
  DEFAULT_VOICE_ID,
  FALLBACK_CATALOG,
  type Catalog,
  type TtsProvider,
  voicesFor,
} from "@/lib/voices";
import AgentTestModal from "@/components/AgentTestModal";

type Draft = Omit<Agent, "id" | "created_at" | "updated_at">;

const EMPTY: Draft = {
  name: "",
  system_prompt: "",
  greeting: "",
  tts_provider: "deepgram",
  voice_id: DEFAULT_VOICE_ID,
  language: DEFAULT_LANGUAGE_ID,
  auto_detect_language: false,
  speaking_speed: 1.0,
  fillers_enabled: true,
  custom_fillers: [],
  interruption_sensitivity: "medium",
  wait_for_user_first: false,
  template_id: null,
};

type Tab = "persona" | "voice" | "behavior";

export default function AgentsPage() {
  const qc = useQueryClient();
  const { data, isLoading } = useAgents();
  const { data: catalogData } = useCatalog();
  const catalog: Catalog = catalogData ?? FALLBACK_CATALOG;
  const agents = data?.agents ?? [];

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft>(EMPTY);
  const [creating, setCreating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [testOpen, setTestOpen] = useState(false);
  const [tab, setTab] = useState<Tab>("persona");

  useEffect(() => {
    if (!selectedId && !creating && agents.length > 0) {
      setSelectedId(agents[0]!.id);
    }
  }, [agents, selectedId, creating]);

  useEffect(() => {
    if (creating) {
      setDraft(EMPTY);
      return;
    }
    const a = agents.find((x) => x.id === selectedId);
    if (a) setDraft({ ...a });
  }, [selectedId, creating, agents]);

  // Auto-clear "Saved" badge after a few seconds.
  useEffect(() => {
    if (!savedAt) return;
    const t = setTimeout(() => setSavedAt(null), 2500);
    return () => clearTimeout(t);
  }, [savedAt]);

  const onPick = (id: string) => {
    setCreating(false);
    setSelectedId(id);
    setSavedAt(null);
    setTab("persona");
  };

  const onNew = () => {
    setCreating(true);
    setSelectedId(null);
    setDraft({ ...EMPTY, name: "New Agent" });
    setSavedAt(null);
    setTab("persona");
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

  const onPickTemplate = (templateId: string) => {
    const t = catalog.templates.find((x) => x.id === templateId);
    if (!t) return;
    setDraft((d) => ({
      ...d,
      template_id: t.id === "blank" ? null : t.id,
      system_prompt: t.system_prompt,
      greeting: t.greeting,
    }));
  };

  const availableVoices = useMemo(
    () => voicesFor(catalog, draft.tts_provider, draft.language),
    [catalog, draft.tts_provider, draft.language],
  );

  // If user changes provider/language, ensure the voice is still valid.
  useEffect(() => {
    if (availableVoices.length === 0) return;
    if (!availableVoices.find((v) => v.id === draft.voice_id)) {
      setDraft((d) => ({ ...d, voice_id: availableVoices[0]!.id }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft.tts_provider, draft.language, availableVoices.length]);

  const providerInfo = catalog.providers[draft.tts_provider];

  return (
    <main className="z-10 px-6 py-8 max-w-6xl mx-auto">
      <header className="mb-8">
        <h1 className="text-3xl font-bold flex items-center gap-3">
          <Bot className="w-7 h-7 text-purple-400" />
          AI Agents
        </h1>
        <p className="text-gray-400 mt-1">
          Build agents that sound like real people. Pick a template, pick a
          voice, pick a language — your agent uses these on every call.
        </p>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-[280px_1fr] gap-6">
        {/* Sidebar */}
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
                  {a.language} · {a.voice_id}
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

              {/* Tabs */}
              <div className="flex gap-1 border-b border-white/10">
                <TabBtn
                  active={tab === "persona"}
                  onClick={() => setTab("persona")}
                  icon={<MessageSquare className="w-4 h-4" />}
                  label="Persona"
                />
                <TabBtn
                  active={tab === "voice"}
                  onClick={() => setTab("voice")}
                  icon={<Sparkles className="w-4 h-4" />}
                  label="Voice"
                />
                <TabBtn
                  active={tab === "behavior"}
                  onClick={() => setTab("behavior")}
                  icon={<Settings2 className="w-4 h-4" />}
                  label="Behavior"
                />
              </div>

              {tab === "persona" && (
                <>
                  <Field label="Start from a template (optional)">
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                      {catalog.templates.map((t) => {
                        const active = (draft.template_id ?? "blank") === t.id;
                        return (
                          <button
                            key={t.id}
                            onClick={() => onPickTemplate(t.id)}
                            className={`text-left px-3 py-2 rounded-lg border text-xs transition ${
                              active
                                ? "bg-purple-600/20 border-purple-500/40 text-purple-200"
                                : "bg-white/5 border-white/10 text-gray-300 hover:bg-white/10"
                            }`}
                          >
                            <div className="font-semibold mb-0.5">{t.label}</div>
                            <div className="text-[11px] text-gray-400 line-clamp-2">
                              {t.description}
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  </Field>

                  <Field label="System prompt — the agent's personality & rules">
                    <textarea
                      value={draft.system_prompt}
                      onChange={(e) =>
                        setDraft({ ...draft, system_prompt: e.target.value })
                      }
                      rows={14}
                      placeholder="You are a friendly receptionist for Acme Dental. Use contractions. Keep replies short. Ask the caller what they need…"
                      className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-lg font-mono text-sm focus:outline-none focus:ring-2 focus:ring-purple-500 resize-y"
                    />
                  </Field>

                  <Field label="Opening line — what the agent says first">
                    <textarea
                      value={draft.greeting}
                      onChange={(e) =>
                        setDraft({ ...draft, greeting: e.target.value })
                      }
                      rows={2}
                      placeholder="Hi, this is Sarah from Acme Dental — how can I help?"
                      className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-purple-500 resize-y"
                    />
                    <p className="text-[11px] text-gray-500 mt-1">
                      Spoken verbatim when the call connects (unless "wait for
                      caller to speak first" is on).
                    </p>
                  </Field>
                </>
              )}

              {tab === "voice" && (
                <>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <Field
                      label={
                        <span className="flex items-center gap-1.5">
                          <Languages className="w-3.5 h-3.5" /> Language
                        </span>
                      }
                    >
                      <select
                        value={draft.language}
                        onChange={(e) =>
                          setDraft({ ...draft, language: e.target.value })
                        }
                        className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
                      >
                        {catalog.languages.map((l) => (
                          <option key={l.id} value={l.id}>
                            {l.label}
                          </option>
                        ))}
                      </select>
                    </Field>

                    <Field label="Voice provider">
                      <select
                        value={draft.tts_provider}
                        onChange={(e) =>
                          setDraft({
                            ...draft,
                            tts_provider: e.target.value as TtsProvider,
                          })
                        }
                        className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
                      >
                        {(Object.keys(catalog.providers) as TtsProvider[]).map(
                          (p) => (
                            <option key={p} value={p}>
                              {catalog.providers[p].label}
                              {!catalog.providers[p].available
                                ? " — needs API key"
                                : ""}
                            </option>
                          ),
                        )}
                      </select>
                    </Field>
                  </div>

                  {!providerInfo?.available && (
                    <ApiKeyOnboarding
                      provider={draft.tts_provider}
                      secretName={
                        draft.tts_provider === "elevenlabs"
                          ? "ELEVENLABS_API_KEY"
                          : "CARTESIA_API_KEY"
                      }
                      docsUrl={
                        draft.tts_provider === "elevenlabs"
                          ? "https://elevenlabs.io/app/settings/api-keys"
                          : "https://play.cartesia.ai/keys"
                      }
                    />
                  )}

                  <Field label="Auto-detect language">
                    <ToggleRow
                      checked={draft.auto_detect_language}
                      onChange={(b) =>
                        setDraft({ ...draft, auto_detect_language: b })
                      }
                      title="Detect the caller's language each turn and reply in that language"
                      hint="Uses Deepgram's multilingual STT. Pair with ElevenLabs or Cartesia for native voice in 25+ languages."
                    />
                  </Field>

                  <Field label="Voice">
                    <div className="flex gap-2">
                      <select
                        value={draft.voice_id}
                        onChange={(e) =>
                          setDraft({ ...draft, voice_id: e.target.value })
                        }
                        className="flex-1 px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
                      >
                        {availableVoices.length === 0 ? (
                          <option value="">No voices for this combination</option>
                        ) : (
                          availableVoices.map((v) => (
                            <option key={v.id} value={v.id}>
                              {v.label}
                            </option>
                          ))
                        )}
                      </select>
                      <VoicePreviewButton voiceId={draft.voice_id} />
                    </div>
                    {draft.tts_provider === "deepgram" &&
                      !draft.language.startsWith("en") && (
                        <p className="text-[11px] text-amber-400 mt-1">
                          Deepgram voices are English-only. For native-sounding{" "}
                          {draft.language} voice, switch to ElevenLabs or
                          Cartesia.
                        </p>
                      )}
                  </Field>

                  <Field
                    label={
                      <span className="flex items-center gap-1.5">
                        <Gauge className="w-3.5 h-3.5" /> Speaking speed:{" "}
                        {draft.speaking_speed.toFixed(2)}×
                      </span>
                    }
                  >
                    <input
                      type="range"
                      min={0.8}
                      max={1.3}
                      step={0.05}
                      value={draft.speaking_speed}
                      onChange={(e) =>
                        setDraft({
                          ...draft,
                          speaking_speed: parseFloat(e.target.value),
                        })
                      }
                      className="w-full accent-purple-500"
                    />
                    <div className="flex justify-between text-[10px] text-gray-500">
                      <span>slower</span>
                      <span>natural</span>
                      <span>faster</span>
                    </div>
                  </Field>
                </>
              )}

              {tab === "behavior" && (
                <>
                  <Field label="Filler words">
                    <ToggleRow
                      checked={draft.fillers_enabled}
                      onChange={(b) =>
                        setDraft({ ...draft, fillers_enabled: b })
                      }
                      title="Use fillers like 'mm-hmm' and 'okay' while thinking"
                      hint="Played 250ms after the caller stops talking and cancelled if the real reply arrives first — eliminates dead air without overlapping."
                    />
                  </Field>

                  {draft.fillers_enabled && (
                    <Field label="Custom fillers (one per line, optional)">
                      <textarea
                        value={draft.custom_fillers.join("\n")}
                        onChange={(e) =>
                          setDraft({
                            ...draft,
                            custom_fillers: e.target.value
                              .split("\n")
                              .map((s) => s.trim())
                              .filter((s) => s.length > 0),
                          })
                        }
                        rows={4}
                        placeholder={"mm-hmm,\nokay,\nlet me see,\nright,"}
                        className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-purple-500 resize-y font-mono"
                      />
                      <p className="text-[11px] text-gray-500 mt-1">
                        Leave empty to use the built-in pack for the agent's
                        language.
                      </p>
                    </Field>
                  )}

                  <Field label="Interruption sensitivity">
                    <div className="grid grid-cols-3 gap-2">
                      {(["low", "medium", "high"] as const).map((s) => {
                        const active = draft.interruption_sensitivity === s;
                        return (
                          <button
                            key={s}
                            onClick={() =>
                              setDraft({
                                ...draft,
                                interruption_sensitivity: s,
                              })
                            }
                            className={`px-3 py-2 rounded-lg border text-xs font-medium capitalize transition ${
                              active
                                ? "bg-purple-600/20 border-purple-500/40 text-purple-200"
                                : "bg-white/5 border-white/10 text-gray-300 hover:bg-white/10"
                            }`}
                          >
                            {s}
                            <div className="text-[10px] text-gray-500 mt-0.5 normal-case font-normal">
                              {s === "low" && "agent waits longer"}
                              {s === "medium" && "balanced"}
                              {s === "high" && "snappy, quick to respond"}
                            </div>
                          </button>
                        );
                      })}
                    </div>
                    <p className="text-[11px] text-gray-500 mt-1.5">
                      Higher sensitivity makes the agent stop and listen
                      faster when you start speaking — also makes it cut in
                      faster after you finish.
                    </p>
                  </Field>

                  <Field label="Wait for caller to speak first">
                    <ToggleRow
                      checked={draft.wait_for_user_first}
                      onChange={(b) =>
                        setDraft({ ...draft, wait_for_user_first: b })
                      }
                      title="Don't auto-greet — wait for the caller to talk"
                      hint="Useful for inbound flows where the caller initiates the conversation."
                    />
                  </Field>
                </>
              )}

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

function Field({
  label,
  children,
}: {
  label: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <label className="text-xs uppercase tracking-wide text-gray-500 font-medium">
        {label}
      </label>
      {children}
    </div>
  );
}

function TabBtn({
  active,
  onClick,
  icon,
  label,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
}) {
  return (
    <button
      onClick={onClick}
      className={`px-4 py-2.5 text-sm font-medium border-b-2 transition flex items-center gap-2 -mb-px ${
        active
          ? "border-purple-500 text-white"
          : "border-transparent text-gray-400 hover:text-white"
      }`}
    >
      {icon}
      {label}
    </button>
  );
}

function VoicePreviewButton({ voiceId }: { voiceId: string }) {
  const [loading, setLoading] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const onPlay = async () => {
    setLoading(true);
    try {
      audioRef.current?.pause();
      const r = await fetch(apiUrl("/agents/sample-voice"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ voice_id: voiceId }),
      });
      if (!r.ok) throw new Error(await r.text());
      const blob = await r.blob();
      const url = URL.createObjectURL(blob);
      const a = new Audio(url);
      audioRef.current = a;
      a.onended = () => URL.revokeObjectURL(url);
      await a.play();
    } catch (e) {
      console.error("voice sample failed", e);
    } finally {
      setLoading(false);
    }
  };
  return (
    <button
      type="button"
      onClick={onPlay}
      disabled={loading || !voiceId}
      className="px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-sm text-gray-200 hover:bg-white/10 disabled:opacity-50 flex items-center gap-1.5"
      aria-label="Preview voice"
    >
      {loading ? (
        <Loader2 className="w-4 h-4 animate-spin" />
      ) : (
        <Play className="w-4 h-4" />
      )}
      Sample
    </button>
  );
}

function ApiKeyOnboarding({
  provider,
  secretName,
  docsUrl,
}: {
  provider: string;
  secretName: string;
  docsUrl: string;
}) {
  const [copied, setCopied] = useState(false);
  const onCopy = async () => {
    try {
      await navigator.clipboard.writeText(secretName);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {}
  };
  return (
    <div className="p-3 rounded-lg bg-amber-500/10 border border-amber-500/30 text-amber-100 text-xs space-y-2">
      <div className="flex items-start gap-2">
        <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
        <div>
          <b className="capitalize">{provider}</b> needs an API key. Until
          you add one, calls will use Deepgram's free voices.
        </div>
      </div>
      <ol className="ml-6 list-decimal space-y-0.5 text-amber-200/90">
        <li>
          Get a key at{" "}
          <a
            href={docsUrl}
            target="_blank"
            rel="noreferrer"
            className="underline hover:text-amber-50"
          >
            {provider === "elevenlabs" ? "elevenlabs.io" : "play.cartesia.ai"}
          </a>
          .
        </li>
        <li>Open the Secrets pane in Replit and add the key.</li>
        <li>Restart the "Rapid X Agent" workflow.</li>
      </ol>
      <div className="flex items-center gap-2 pt-1">
        <code className="px-2 py-1 rounded bg-black/40 text-amber-100">
          {secretName}
        </code>
        <button
          type="button"
          onClick={onCopy}
          className="p-1.5 rounded bg-black/30 hover:bg-black/50 text-amber-100"
          aria-label="Copy secret name"
        >
          {copied ? (
            <CheckCircle className="w-3.5 h-3.5" />
          ) : (
            <Copy className="w-3.5 h-3.5" />
          )}
        </button>
        <KeyRound className="w-3.5 h-3.5 ml-auto opacity-60" />
      </div>
    </div>
  );
}

function ToggleRow({
  checked,
  onChange,
  title,
  hint,
}: {
  checked: boolean;
  onChange: (b: boolean) => void;
  title: string;
  hint?: string;
}) {
  return (
    <label className="flex items-start gap-3 px-3 py-2.5 rounded-lg bg-white/5 border border-white/10 cursor-pointer hover:bg-white/10 transition">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="w-4 h-4 mt-0.5 accent-purple-500"
      />
      <div className="flex-1">
        <div className="text-sm text-gray-200">{title}</div>
        {hint && <div className="text-[11px] text-gray-500 mt-0.5">{hint}</div>}
      </div>
    </label>
  );
}
