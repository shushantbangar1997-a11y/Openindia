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
  Languages,
  Gauge,
  MessageSquare,
  Settings2,
  AlertCircle,
  Play,
  KeyRound,
  Copy,
  Sparkles,
  ChevronRight,
  Search,
  MoreHorizontal,
  Brain,
  Volume2,
  Sliders,
  TestTube2,
  Radio,
} from "lucide-react";
import { type Agent, useAgents, useCatalog, useSettings, useElevenLabsVoices } from "@/lib/agents";
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
  provider_api_keys: {},
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
  const [search, setSearch] = useState("");

  useEffect(() => {
    if (!selectedId && !creating && agents.length > 0) {
      setSelectedId(agents[0]!.id);
    }
  }, [agents, selectedId, creating]);

  useEffect(() => {
    if (creating) { setDraft(EMPTY); return; }
    const a = agents.find((x) => x.id === selectedId);
    if (a) setDraft({ ...a });
  }, [selectedId, creating, agents]);

  useEffect(() => {
    if (!savedAt) return;
    const t = setTimeout(() => setSavedAt(null), 2500);
    return () => clearTimeout(t);
  }, [savedAt]);

  const onPick = (id: string) => {
    setCreating(false); setSelectedId(id); setSavedAt(null); setTab("persona");
  };
  const onNew = () => {
    setCreating(true); setSelectedId(null);
    setDraft({ ...EMPTY, name: "New Assistant" }); setSavedAt(null); setTab("persona");
  };
  const onSave = async () => {
    if (!draft.name.trim()) return;
    setSaving(true);
    try {
      if (creating) {
        const r = await apiSend<{ agent: Agent }>("/agents", "POST", draft);
        setCreating(false); setSelectedId(r.agent.id);
      } else if (selectedId) {
        await apiSend<{ agent: Agent }>(`/agents/${selectedId}`, "PATCH", draft);
      }
      await qc.invalidateQueries({ queryKey: ["agents"] });
      setSavedAt(Date.now());
    } finally { setSaving(false); }
  };
  const onDelete = async () => {
    if (!selectedId) return;
    if (!confirm(`Delete assistant "${draft.name}"?`)) return;
    await apiSend(`/agents/${selectedId}`, "DELETE");
    await qc.invalidateQueries({ queryKey: ["agents"] });
    setSelectedId(null);
  };
  const onPickTemplate = (templateId: string) => {
    const t = catalog.templates.find((x) => x.id === templateId);
    if (!t) return;
    setDraft((d) => ({ ...d, template_id: t.id === "blank" ? null : t.id, system_prompt: t.system_prompt, greeting: t.greeting }));
  };

  const { data: settings } = useSettings();
  const elevenLabsGlobalKeySet = Boolean(settings?.elevenlabs_api_key);
  const cartesiaGlobalKeySet = Boolean(settings?.cartesia_api_key);
  const currentProviderGlobalKeySet =
    draft.tts_provider === "elevenlabs" ? elevenLabsGlobalKeySet :
    draft.tts_provider === "cartesia" ? cartesiaGlobalKeySet : false;
  const currentProviderAgentKey = draft.provider_api_keys?.[draft.tts_provider as "elevenlabs" | "cartesia"];
  const elevenLabsKeySet = Boolean(
    settings?.elevenlabs_api_key || draft.provider_api_keys?.elevenlabs,
  );
  const agentElevenKey = draft.provider_api_keys?.elevenlabs;
  const { data: elevenLabsVoicesData, isLoading: elevenLabsLoading, error: elevenLabsError } = useElevenLabsVoices(
    draft.tts_provider === "elevenlabs" && elevenLabsKeySet,
    agentElevenKey,
  );

  const availableVoices = useMemo(() => {
    if (draft.tts_provider === "elevenlabs" && elevenLabsVoicesData?.voices?.length) {
      return elevenLabsVoicesData.voices;
    }
    return voicesFor(catalog, draft.tts_provider, draft.language);
  }, [catalog, draft.tts_provider, draft.language, elevenLabsVoicesData]);

  useEffect(() => {
    if (availableVoices.length === 0) return;
    if (!availableVoices.find((v) => v.id === draft.voice_id)) {
      setDraft((d) => ({ ...d, voice_id: availableVoices[0]!.id }));
    }
  }, [draft.tts_provider, draft.language, availableVoices.length]);

  const providerInfo = catalog.providers[draft.tts_provider];
  const filteredAgents = agents.filter((a) =>
    a.name.toLowerCase().includes(search.toLowerCase()),
  );
  const showEditor = creating || selectedId;

  return (
    <div className="flex h-screen overflow-hidden bg-[#F4F5F7]">
      {/* Agent List Panel */}
      <div className="w-[280px] shrink-0 bg-white border-r border-gray-200 flex flex-col h-full">
        {/* Header */}
        <div className="px-4 py-4 border-b border-gray-100">
          <div className="flex items-center justify-between mb-3">
            <h1 className="text-[15px] font-semibold text-gray-900">Assistants</h1>
            <button
              onClick={onNew}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-violet-600 hover:bg-violet-700 text-white text-xs font-semibold rounded-lg transition-colors shadow-sm shadow-violet-200"
            >
              <Plus className="w-3.5 h-3.5" /> New
            </button>
          </div>
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search assistants…"
              className="w-full pl-8 pr-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-xs text-gray-700 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-violet-500/20 focus:border-violet-400"
            />
          </div>
        </div>

        {/* List */}
        <div className="flex-1 overflow-y-auto py-2 px-2">
          {isLoading && (
            <div className="flex items-center gap-2 px-3 py-4 text-xs text-gray-400">
              <Loader2 className="w-3.5 h-3.5 animate-spin" /> Loading…
            </div>
          )}
          {!isLoading && filteredAgents.length === 0 && (
            <div className="px-3 py-8 text-center">
              <Bot className="w-8 h-8 text-gray-200 mx-auto mb-2" />
              <p className="text-xs text-gray-400">No assistants yet</p>
              <button onClick={onNew} className="mt-3 text-xs text-violet-600 hover:underline font-medium">
                Create your first one →
              </button>
            </div>
          )}
          {filteredAgents.map((a) => {
            const active = !creating && a.id === selectedId;
            return (
              <button
                key={a.id}
                onClick={() => onPick(a.id)}
                className={`w-full text-left px-3 py-3 rounded-lg mb-0.5 transition-all group ${
                  active
                    ? "bg-violet-50 border border-violet-200"
                    : "hover:bg-gray-50 border border-transparent"
                }`}
              >
                <div className="flex items-center gap-2.5">
                  <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${
                    active ? "bg-violet-600" : "bg-gray-100 group-hover:bg-gray-200"
                  }`}>
                    <Bot className={`w-4 h-4 ${active ? "text-white" : "text-gray-500"}`} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className={`text-sm font-medium truncate ${active ? "text-violet-700" : "text-gray-800"}`}>
                      {a.name}
                    </div>
                    <div className="text-[11px] text-gray-400 truncate mt-0.5">
                      {a.language} · {a.tts_provider}
                    </div>
                  </div>
                  {active && <ChevronRight className="w-3.5 h-3.5 text-violet-400 shrink-0" />}
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Editor Panel */}
      <div className="flex-1 flex flex-col h-full overflow-hidden">
        {!showEditor ? (
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center">
              <div className="w-16 h-16 rounded-2xl bg-gray-100 flex items-center justify-center mx-auto mb-4">
                <Bot className="w-8 h-8 text-gray-300" />
              </div>
              <h3 className="text-sm font-medium text-gray-500 mb-1">No assistant selected</h3>
              <p className="text-xs text-gray-400 mb-4">Choose an assistant or create a new one</p>
              <button
                onClick={onNew}
                className="px-4 py-2 bg-violet-600 hover:bg-violet-700 text-white text-sm font-semibold rounded-lg transition-colors"
              >
                Create assistant
              </button>
            </div>
          </div>
        ) : (
          <>
            {/* Top bar */}
            <div className="bg-white border-b border-gray-200 px-6 py-3 flex items-center justify-between shrink-0">
              <div className="flex items-center gap-3 flex-1 min-w-0">
                <div className="w-8 h-8 rounded-lg bg-violet-600 flex items-center justify-center shrink-0">
                  <Bot className="w-4 h-4 text-white" />
                </div>
                <input
                  value={draft.name}
                  onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                  placeholder="Assistant name"
                  className="text-[15px] font-semibold text-gray-900 bg-transparent border-0 outline-none focus:ring-0 min-w-0 flex-1 placeholder:text-gray-300"
                />
              </div>
              <div className="flex items-center gap-2 shrink-0">
                {savedAt && (
                  <span className="text-xs text-emerald-600 flex items-center gap-1 font-medium">
                    <CheckCircle className="w-3.5 h-3.5" /> Saved
                  </span>
                )}
                {!creating && selectedId && (
                  <button
                    onClick={() => setTestOpen(true)}
                    className="flex items-center gap-2 px-3 py-2 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 text-emerald-700 text-xs font-semibold rounded-lg transition-colors"
                  >
                    <TestTube2 className="w-3.5 h-3.5" /> Test call
                  </button>
                )}
                <button
                  onClick={onSave}
                  disabled={saving || !draft.name.trim()}
                  className="flex items-center gap-2 px-4 py-2 bg-violet-600 hover:bg-violet-700 disabled:opacity-40 text-white text-xs font-semibold rounded-lg transition-colors shadow-sm shadow-violet-200"
                >
                  {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                  {creating ? "Create" : "Save"}
                </button>
                {!creating && selectedId && (
                  <button
                    onClick={onDelete}
                    className="p-2 rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-50 transition-colors border border-gray-200"
                    aria-label="Delete"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            </div>

            {/* Tab bar */}
            <div className="bg-white border-b border-gray-200 px-6 shrink-0">
              <div className="flex gap-0">
                <SfTab active={tab === "persona"} onClick={() => setTab("persona")} icon={<Brain className="w-3.5 h-3.5" />} label="AI Model" />
                <SfTab active={tab === "voice"} onClick={() => setTab("voice")} icon={<Volume2 className="w-3.5 h-3.5" />} label="Voice" />
                <SfTab active={tab === "behavior"} onClick={() => setTab("behavior")} icon={<Sliders className="w-3.5 h-3.5" />} label="Call behavior" />
              </div>
            </div>

            {/* Tab content */}
            <div className="flex-1 overflow-y-auto">
              <div className="max-w-2xl px-6 py-6 space-y-6">

                {tab === "persona" && (
                  <>
                    {/* Templates */}
                    <SfSection title="Use a template" subtitle="Start from a pre-built persona or begin blank.">
                      <div className="grid grid-cols-2 gap-2">
                        {catalog.templates.map((t) => {
                          const active = (draft.template_id ?? "blank") === t.id;
                          return (
                            <button
                              key={t.id}
                              onClick={() => onPickTemplate(t.id)}
                              className={`text-left p-3 rounded-xl border text-xs transition-all ${
                                active
                                  ? "bg-violet-50 border-violet-300 text-violet-800"
                                  : "bg-white border-gray-200 text-gray-700 hover:border-gray-300 hover:bg-gray-50"
                              }`}
                            >
                              <div className="font-semibold mb-0.5">{t.label}</div>
                              <div className="text-[11px] text-gray-400 line-clamp-2">{t.description}</div>
                            </button>
                          );
                        })}
                      </div>
                    </SfSection>

                    {/* System prompt */}
                    <SfSection title="System prompt" subtitle="Define the assistant's personality, goals, and rules.">
                      <textarea
                        value={draft.system_prompt}
                        onChange={(e) => setDraft({ ...draft, system_prompt: e.target.value })}
                        rows={12}
                        placeholder="You are a friendly receptionist for Acme Dental. Use contractions. Keep replies short. Ask the caller what they need…"
                        className="w-full px-3.5 py-3 bg-white border border-gray-200 rounded-xl text-sm text-gray-800 placeholder:text-gray-300 focus:outline-none focus:ring-2 focus:ring-violet-500/20 focus:border-violet-400 resize-y font-mono leading-relaxed"
                      />
                    </SfSection>

                    {/* Opening line */}
                    <SfSection title="Opening message" subtitle="The first thing the assistant says when the call connects.">
                      <textarea
                        value={draft.greeting}
                        onChange={(e) => setDraft({ ...draft, greeting: e.target.value })}
                        rows={2}
                        placeholder="Hi, this is Sarah from Acme Dental — how can I help you today?"
                        className="w-full px-3.5 py-3 bg-white border border-gray-200 rounded-xl text-sm text-gray-800 placeholder:text-gray-300 focus:outline-none focus:ring-2 focus:ring-violet-500/20 focus:border-violet-400 resize-y"
                      />
                      <p className="text-[11px] text-gray-400 mt-1.5">
                        Spoken verbatim when the call connects (unless "wait for caller" is on).
                      </p>
                    </SfSection>
                  </>
                )}

                {tab === "voice" && (
                  <>
                    <SfSection title="Language & provider" subtitle="Choose the spoken language and voice synthesis engine.">
                      <div className="grid grid-cols-2 gap-3">
                        <SfField label="Language">
                          <SfSelect
                            value={draft.language}
                            onChange={(v) => setDraft({ ...draft, language: v })}
                          >
                            {catalog.languages.map((l) => (
                              <option key={l.id} value={l.id}>{l.label}</option>
                            ))}
                          </SfSelect>
                        </SfField>
                        <SfField label="Voice provider">
                          <SfSelect
                            value={draft.tts_provider}
                            onChange={(v) => setDraft({ ...draft, tts_provider: v as TtsProvider })}
                          >
                            {(Object.keys(catalog.providers) as TtsProvider[]).map((p) => {
                              const pGlobal =
                                p === "elevenlabs" ? elevenLabsGlobalKeySet :
                                p === "cartesia" ? cartesiaGlobalKeySet : false;
                              const pAvail = catalog.providers[p].available || pGlobal || Boolean(draft.provider_api_keys?.[p as "elevenlabs" | "cartesia"]);
                              return (
                                <option key={p} value={p}>
                                  {catalog.providers[p].label}
                                  {!pAvail ? " — needs API key" : ""}
                                </option>
                              );
                            })}
                          </SfSelect>
                          {currentProviderGlobalKeySet && (
                            <div className="mt-1.5 flex items-center gap-1.5 text-[11px] text-violet-600 font-medium">
                              <CheckCircle className="w-3 h-3 shrink-0" />
                              Global key active
                            </div>
                          )}
                        </SfField>
                      </div>
                    </SfSection>

                    {/* API key onboarding */}
                    {!providerInfo?.available &&
                      !currentProviderAgentKey &&
                      !currentProviderGlobalKeySet && (
                        <ApiKeyOnboarding
                          provider={draft.tts_provider as "elevenlabs" | "cartesia"}
                          agentId={selectedId}
                          onSaved={(provider, masked) => {
                            setDraft({ ...draft, provider_api_keys: { ...draft.provider_api_keys, [provider]: masked } });
                            qc.invalidateQueries({ queryKey: ["agents"] });
                          }}
                        />
                      )}
                    {currentProviderAgentKey && (
                      <div className="px-3.5 py-2.5 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-700 text-xs flex items-center gap-2">
                        <CheckCircle className="w-3.5 h-3.5 shrink-0" />
                        <b className="capitalize">{draft.tts_provider}</b> API key saved — calls will use it directly.
                      </div>
                    )}
                    {!currentProviderAgentKey && currentProviderGlobalKeySet && (
                      <div className="px-3.5 py-2.5 rounded-xl bg-violet-50 border border-violet-200 text-violet-700 text-xs flex items-center gap-2">
                        <CheckCircle className="w-3.5 h-3.5 shrink-0" />
                        Using global key from Settings — no per-agent key needed.
                      </div>
                    )}

                    <SfSection title="Voice selection" subtitle="Pick the voice and preview how it sounds.">
                      <SfField label="Auto-detect language">
                        <SfToggle
                          checked={draft.auto_detect_language}
                          onChange={(b) => setDraft({ ...draft, auto_detect_language: b })}
                          label="Detect the caller's language and respond in kind"
                          hint="Uses Deepgram multilingual STT. Best paired with ElevenLabs or Cartesia."
                        />
                      </SfField>

                      <div className="mt-3">
                        <SfField label="Voice">
                          <div className="flex gap-2">
                            {elevenLabsLoading && draft.tts_provider === "elevenlabs" ? (
                              <div className="flex-1 flex items-center gap-2 px-3.5 py-2.5 bg-white border border-gray-200 rounded-xl text-sm text-gray-400">
                                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                Loading voices from ElevenLabs…
                              </div>
                            ) : elevenLabsError && draft.tts_provider === "elevenlabs" ? (
                              <div className="flex-1 flex items-center gap-2 px-3.5 py-2.5 bg-red-50 border border-red-200 rounded-xl text-sm text-red-600">
                                <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                                {(elevenLabsError as Error).message || "Failed to load ElevenLabs voices — check your API key."}
                              </div>
                            ) : (
                              <SfSelect
                                value={draft.voice_id}
                                onChange={(v) => setDraft({ ...draft, voice_id: v })}
                              >
                                {availableVoices.length === 0 ? (
                                  <option value="">No voices for this combination</option>
                                ) : (
                                  availableVoices.map((v) => (
                                    <option key={v.id} value={v.id}>{v.label}</option>
                                  ))
                                )}
                              </SfSelect>
                            )}
                            <VoicePreviewButton
                              voiceId={draft.voice_id}
                              provider={draft.tts_provider}
                              language={draft.language}
                              agentId={selectedId}
                            />
                          </div>
                          {draft.tts_provider === "deepgram" && !draft.language.startsWith("en") && (
                            <p className="text-[11px] text-amber-600 mt-1.5 flex items-center gap-1">
                              <AlertCircle className="w-3 h-3 shrink-0" />
                              Deepgram voices are English-only. Switch to ElevenLabs or Cartesia for native {draft.language}.
                            </p>
                          )}
                        </SfField>
                      </div>
                    </SfSection>

                    <SfSection title="Speaking speed" subtitle="Adjust how fast the agent talks.">
                      <div className="space-y-2">
                        <div className="flex items-center justify-between text-xs text-gray-500">
                          <span>Speed</span>
                          <span className="font-semibold text-gray-700">{draft.speaking_speed.toFixed(2)}×</span>
                        </div>
                        <input
                          type="range" min={0.8} max={1.3} step={0.05}
                          value={draft.speaking_speed}
                          onChange={(e) => setDraft({ ...draft, speaking_speed: parseFloat(e.target.value) })}
                          className="w-full accent-violet-600"
                        />
                        <div className="flex justify-between text-[10px] text-gray-400">
                          <span>0.8× slower</span>
                          <span>1.0× natural</span>
                          <span>1.3× faster</span>
                        </div>
                      </div>
                    </SfSection>
                  </>
                )}

                {tab === "behavior" && (
                  <>
                    <SfSection title="Filler words" subtitle="Natural sounds the agent makes while thinking to avoid silence.">
                      <SfToggle
                        checked={draft.fillers_enabled}
                        onChange={(b) => setDraft({ ...draft, fillers_enabled: b })}
                        label="Enable filler sounds (mm-hmm, okay, let me see…)"
                        hint="Played 250 ms after the caller stops talking, cancelled if the real reply arrives first."
                      />
                      {draft.fillers_enabled && (
                        <div className="mt-3">
                          <SfField label="Custom fillers (one per line, optional)">
                            <textarea
                              value={draft.custom_fillers.join("\n")}
                              onChange={(e) =>
                                setDraft({
                                  ...draft,
                                  custom_fillers: e.target.value.split("\n").map((s) => s.trim()).filter((s) => s.length > 0),
                                })
                              }
                              rows={4}
                              placeholder={"mm-hmm\nokay\nlet me see\nright"}
                              className="w-full px-3.5 py-3 bg-white border border-gray-200 rounded-xl text-sm text-gray-800 placeholder:text-gray-300 focus:outline-none focus:ring-2 focus:ring-violet-500/20 focus:border-violet-400 resize-y font-mono"
                            />
                            <p className="text-[11px] text-gray-400 mt-1.5">
                              Leave empty to use the built-in pack for this language.
                            </p>
                          </SfField>
                        </div>
                      )}
                    </SfSection>

                    <SfSection title="Interruption sensitivity" subtitle="How quickly the agent reacts when the caller starts talking.">
                      <div className="grid grid-cols-3 gap-2">
                        {(["low", "medium", "high"] as const).map((s) => {
                          const active = draft.interruption_sensitivity === s;
                          return (
                            <button
                              key={s}
                              onClick={() => setDraft({ ...draft, interruption_sensitivity: s })}
                              className={`p-3 rounded-xl border text-xs font-medium capitalize transition-all ${
                                active
                                  ? "bg-violet-50 border-violet-300 text-violet-700"
                                  : "bg-white border-gray-200 text-gray-600 hover:border-gray-300"
                              }`}
                            >
                              <div className="font-semibold mb-0.5">{s}</div>
                              <div className="text-[10px] text-gray-400 normal-case font-normal">
                                {s === "low" && "waits longer"}
                                {s === "medium" && "balanced"}
                                {s === "high" && "snappy"}
                              </div>
                            </button>
                          );
                        })}
                      </div>
                    </SfSection>

                    <SfSection title="Wait for caller" subtitle="Don't auto-greet — wait for the caller to speak first.">
                      <SfToggle
                        checked={draft.wait_for_user_first}
                        onChange={(b) => setDraft({ ...draft, wait_for_user_first: b })}
                        label="Wait for caller to speak first"
                        hint="Useful for inbound flows where the caller initiates the conversation."
                      />
                    </SfSection>
                  </>
                )}

                {/* Save footer */}
                <div className="pt-2 pb-8">
                  <button
                    onClick={onSave}
                    disabled={saving || !draft.name.trim()}
                    className="flex items-center gap-2 px-5 py-2.5 bg-violet-600 hover:bg-violet-700 disabled:opacity-40 text-white text-sm font-semibold rounded-xl transition-colors shadow-sm shadow-violet-200"
                  >
                    {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                    {creating ? "Create assistant" : "Save changes"}
                  </button>
                </div>
              </div>
            </div>
          </>
        )}
      </div>

      {testOpen && selectedId && (
        <AgentTestModal
          agentId={selectedId}
          agentName={draft.name}
          onClose={() => setTestOpen(false)}
        />
      )}
    </div>
  );
}

function SfSection({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
      <div className="px-5 py-4 border-b border-gray-100">
        <h3 className="text-sm font-semibold text-gray-900">{title}</h3>
        {subtitle && <p className="text-xs text-gray-400 mt-0.5">{subtitle}</p>}
      </div>
      <div className="px-5 py-4 space-y-4">{children}</div>
    </div>
  );
}

function SfField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">{label}</label>
      {children}
    </div>
  );
}

function SfSelect({ value, onChange, children }: { value: string; onChange: (v: string) => void; children: React.ReactNode }) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="w-full px-3.5 py-2.5 bg-white border border-gray-200 rounded-xl text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-violet-500/20 focus:border-violet-400 appearance-none"
    >
      {children}
    </select>
  );
}

function SfTab({ active, onClick, icon, label }: { active: boolean; onClick: () => void; icon: React.ReactNode; label: string }) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-all ${
        active
          ? "border-violet-600 text-violet-700"
          : "border-transparent text-gray-400 hover:text-gray-600"
      }`}
    >
      {icon}
      {label}
    </button>
  );
}

function SfToggle({ checked, onChange, label, hint }: { checked: boolean; onChange: (b: boolean) => void; label: string; hint?: string }) {
  return (
    <label className="flex items-start gap-3 cursor-pointer group">
      <div className="relative shrink-0 mt-0.5">
        <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="sr-only" />
        <div
          className={`w-9 h-5 rounded-full transition-colors ${checked ? "bg-violet-600" : "bg-gray-200"}`}
        />
        <div
          className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white shadow-sm transition-transform ${checked ? "translate-x-4" : ""}`}
        />
      </div>
      <div>
        <div className="text-sm text-gray-700 group-hover:text-gray-900 font-medium">{label}</div>
        {hint && <div className="text-[11px] text-gray-400 mt-0.5 leading-relaxed">{hint}</div>}
      </div>
    </label>
  );
}

function VoicePreviewButton({ voiceId, provider, language, agentId }: {
  voiceId: string; provider: string; language: string; agentId: string | null;
}) {
  const [loading, setLoading] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const onPlay = async () => {
    setLoading(true);
    try {
      audioRef.current?.pause();
      const r = await fetch(apiUrl("/agents/sample-voice"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ voice_id: voiceId, provider, language, ...(agentId ? { agent_id: agentId } : {}) }),
      });
      if (!r.ok) throw new Error(await r.text());
      const blob = await r.blob();
      const url = URL.createObjectURL(blob);
      const a = new Audio(url);
      audioRef.current = a;
      a.onended = () => URL.revokeObjectURL(url);
      await a.play();
    } catch (e) { console.error("voice sample failed", e); }
    finally { setLoading(false); }
  };
  return (
    <button
      type="button" onClick={onPlay} disabled={loading || !voiceId}
      className="px-3 py-2.5 rounded-xl bg-gray-50 border border-gray-200 text-sm text-gray-600 hover:bg-gray-100 disabled:opacity-50 flex items-center gap-1.5 shrink-0 font-medium"
    >
      {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Play className="w-3.5 h-3.5" />}
      Preview
    </button>
  );
}

function ApiKeyOnboarding({ provider, agentId, onSaved }: {
  provider: "elevenlabs" | "cartesia"; agentId: string | null;
  onSaved: (provider: "elevenlabs" | "cartesia", masked: string) => void;
}) {
  const docsUrl = provider === "elevenlabs" ? "https://elevenlabs.io/app/settings/api-keys" : "https://play.cartesia.ai/keys";
  const secretName = provider === "elevenlabs" ? "ELEVENLABS_API_KEY" : "CARTESIA_API_KEY";
  const [pasted, setPasted] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);
  const onCopy = async () => {
    try { await navigator.clipboard.writeText(secretName); setCopied(true); setTimeout(() => setCopied(false), 1500); } catch {}
  };
  const onSave = async () => {
    if (!agentId) { setError("Save the assistant first, then paste the key."); return; }
    if (pasted.trim().length < 10) { setError("That doesn't look like a valid key."); return; }
    setSaving(true); setError("");
    try {
      await apiSend(`/agents/${agentId}/provider-key`, "POST", { provider, api_key: pasted.trim() });
      onSaved(provider, "***"); setPasted("");
    } catch (e: any) { setError(e?.message || "Failed to save key"); }
    finally { setSaving(false); }
  };
  return (
    <div className="p-4 rounded-xl bg-amber-50 border border-amber-200 space-y-3">
      <div className="flex items-start gap-2.5 text-amber-800">
        <AlertCircle className="w-4 h-4 mt-0.5 shrink-0 text-amber-500" />
        <div className="text-xs leading-relaxed">
          <b className="capitalize">{provider}</b> requires an API key. Paste yours below or set it as a global secret.{" "}
          <a href={docsUrl} target="_blank" rel="noreferrer" className="underline hover:text-amber-900">Get a key →</a>
        </div>
      </div>
      <div className="flex gap-2">
        <input
          type="password" value={pasted} onChange={(e) => setPasted(e.target.value)}
          placeholder={`Paste your ${provider} API key`}
          className="flex-1 px-3 py-2 bg-white border border-amber-200 rounded-lg text-xs font-mono text-gray-800 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-amber-400/30 focus:border-amber-400"
        />
        <button
          type="button" onClick={onSave} disabled={saving || !pasted}
          className="px-3 py-2 rounded-lg bg-amber-500 hover:bg-amber-400 text-white font-semibold text-xs disabled:opacity-50 flex items-center gap-1.5"
        >
          {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <KeyRound className="w-3.5 h-3.5" />}
          Save
        </button>
      </div>
      {error && <div className="text-red-600 text-xs">{error}</div>}
      <details className="text-xs text-amber-700">
        <summary className="cursor-pointer hover:text-amber-900 font-medium">Use a global env var instead</summary>
        <div className="mt-2 flex items-center gap-2">
          <code className="px-2 py-1 rounded bg-amber-100 text-amber-800 font-mono">{secretName}</code>
          <button type="button" onClick={onCopy} className="p-1.5 rounded bg-amber-100 hover:bg-amber-200 text-amber-700">
            {copied ? <CheckCircle className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
          </button>
        </div>
      </details>
    </div>
  );
}
