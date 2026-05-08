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
  ChevronUp,
  ChevronDown,
  Search,
  MoreHorizontal,
  Brain,
  Volume2,
  Sliders,
  TestTube2,
  Radio,
  BookOpen,
  Link,
  FileText,
  Upload,
  X,
  Globe,
  Zap,
  PlusCircle,
} from "lucide-react";
import { type Agent, type KnowledgeDoc, type ConversationStage, type AgentTool, useAgents, useCatalog, useSettings, useElevenLabsVoices, useKnowledgeDocs } from "@/lib/agents";
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
  inbound_enabled: false,
  inbound_auto_greet: false,
  template_id: null,
  conversation_stages: [],
  tools: [],
};

type Tab = "persona" | "voice" | "behavior" | "knowledge" | "actions";

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
  const [voiceSearch, setVoiceSearch] = useState("");
  const [voiceGender, setVoiceGender] = useState<"all" | "female" | "male">("all");

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

  useEffect(() => {
    setVoiceSearch("");
    setVoiceGender("all");
  }, [draft.tts_provider, draft.language]);

  const filteredVoices = useMemo(() => {
    const q = voiceSearch.trim().toLowerCase();
    return availableVoices.filter((v) => {
      if (voiceGender !== "all" && v.gender !== voiceGender) return false;
      if (q && !v.label.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [availableVoices, voiceSearch, voiceGender]);

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
                <SfTab active={tab === "actions"} onClick={() => setTab("actions")} icon={<Zap className="w-3.5 h-3.5" />} label="Actions" />
                <SfTab active={tab === "knowledge"} onClick={() => setTab("knowledge")} icon={<BookOpen className="w-3.5 h-3.5" />} label="Knowledge" />
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

                    {/* Conversation script */}
                    <SfSection title="Conversation script" subtitle="Guide the agent through structured stages. Each stage has a goal and instructions.">
                      <SfToggle
                        checked={(draft.conversation_stages ?? []).length > 0}
                        onChange={(enabled) => {
                          if (!enabled) {
                            setDraft((d) => ({ ...d, conversation_stages: [] }));
                          } else {
                            setDraft((d) => ({
                              ...d,
                              conversation_stages: [{
                                id: crypto.randomUUID(),
                                name: "Introduction",
                                goal: "Greet the caller and introduce yourself",
                                instructions: "",
                              }],
                            }));
                          }
                        }}
                        label="Enable conversation script"
                        hint="When on, the agent follows a structured flow with defined stages."
                      />
                      {(draft.conversation_stages ?? []).length > 0 && (
                        <div className="mt-3 space-y-3">
                          {(draft.conversation_stages ?? []).map((stage, idx) => (
                            <StageCard
                              key={stage.id}
                              index={idx}
                              total={(draft.conversation_stages ?? []).length}
                              stage={stage}
                              onUpdate={(updated) => setDraft((d) => ({
                                ...d,
                                conversation_stages: (d.conversation_stages ?? []).map((s, j) => j === idx ? updated : s),
                              }))}
                              onDelete={() => setDraft((d) => ({
                                ...d,
                                conversation_stages: (d.conversation_stages ?? []).filter((_, j) => j !== idx),
                              }))}
                              onMoveUp={idx === 0 ? undefined : () => setDraft((d) => {
                                const arr = [...(d.conversation_stages ?? [])];
                                [arr[idx - 1], arr[idx]] = [arr[idx]!, arr[idx - 1]!];
                                return { ...d, conversation_stages: arr };
                              })}
                              onMoveDown={idx === (draft.conversation_stages ?? []).length - 1 ? undefined : () => setDraft((d) => {
                                const arr = [...(d.conversation_stages ?? [])];
                                [arr[idx], arr[idx + 1]] = [arr[idx + 1]!, arr[idx]!];
                                return { ...d, conversation_stages: arr };
                              })}
                              onDragStart={(e) => e.dataTransfer.setData("stageIdx", String(idx))}
                              onDragOver={(e) => e.preventDefault()}
                              onDrop={(e) => {
                                e.preventDefault();
                                const from = Number(e.dataTransfer.getData("stageIdx"));
                                if (!Number.isFinite(from) || from === idx) return;
                                setDraft((d) => {
                                  const arr = [...(d.conversation_stages ?? [])];
                                  const [item] = arr.splice(from, 1);
                                  arr.splice(idx, 0, item!);
                                  return { ...d, conversation_stages: arr };
                                });
                              }}
                            />
                          ))}
                          {(draft.conversation_stages ?? []).length < 20 && (
                            <button
                              type="button"
                              onClick={() => setDraft((d) => ({
                                ...d,
                                conversation_stages: [...(d.conversation_stages ?? []), {
                                  id: crypto.randomUUID(),
                                  name: `Stage ${(d.conversation_stages ?? []).length + 1}`,
                                  goal: "",
                                  instructions: "",
                                }],
                              }))}
                              className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl border border-dashed border-gray-300 text-xs font-medium text-gray-500 hover:border-violet-400 hover:text-violet-600 transition-colors"
                            >
                              <PlusCircle className="w-3.5 h-3.5" /> Add stage
                            </button>
                          )}
                        </div>
                      )}
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
                          {!elevenLabsLoading && !elevenLabsError && availableVoices.length > 0 && (
                            <div className="space-y-2 mb-2">
                              <div className="relative">
                                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400 pointer-events-none" />
                                <input
                                  value={voiceSearch}
                                  onChange={(e) => setVoiceSearch(e.target.value)}
                                  placeholder="Search voices…"
                                  className="w-full pl-8 pr-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-xs text-gray-700 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-violet-500/20 focus:border-violet-400"
                                />
                              </div>
                              <div className="flex gap-1.5">
                                {(["all", "female", "male"] as const).map((g) => (
                                  <button
                                    key={g}
                                    type="button"
                                    onClick={() => setVoiceGender(g)}
                                    className={`px-3 py-1 rounded-lg text-xs font-medium transition-colors capitalize ${
                                      voiceGender === g
                                        ? "bg-violet-600 text-white"
                                        : "bg-gray-100 text-gray-500 hover:bg-gray-200"
                                    }`}
                                  >
                                    {g === "all" ? "All" : g === "female" ? "Female" : "Male"}
                                  </button>
                                ))}
                                {availableVoices.length > 0 && (
                                  <span className="ml-auto text-[11px] text-gray-400 self-center">
                                    {filteredVoices.length} of {availableVoices.length}
                                  </span>
                                )}
                              </div>
                              {draft.voice_id &&
                                availableVoices.find((v) => v.id === draft.voice_id) &&
                                !filteredVoices.find((v) => v.id === draft.voice_id) && (
                                  <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-amber-50 border border-amber-200 text-amber-700 text-xs">
                                    <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                                    <span>Current voice is hidden by your filters.</span>
                                    <button
                                      type="button"
                                      onClick={() => { setVoiceSearch(""); setVoiceGender("all"); }}
                                      className="ml-auto font-semibold underline hover:text-amber-900"
                                    >
                                      Clear filters
                                    </button>
                                  </div>
                                )}
                            </div>
                          )}
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
                                {filteredVoices.length === 0 ? (
                                  <option value="">No voices match your filter</option>
                                ) : (
                                  filteredVoices.map((v) => (
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

                    <SfSection
                      title="Inbound calls"
                      subtitle="Allow this agent to receive incoming calls via webhook."
                    >
                      <SfToggle
                        checked={draft.inbound_enabled}
                        onChange={(b) => setDraft({ ...draft, inbound_enabled: b })}
                        label="Enable inbound calls"
                        hint="When on, configure your SIP provider to POST to the webhook URL below on incoming calls."
                      />
                      {draft.inbound_enabled && (
                        <SfToggle
                          checked={draft.inbound_auto_greet}
                          onChange={(b) => setDraft({ ...draft, inbound_auto_greet: b })}
                          label="Auto-greet inbound callers"
                          hint="When off (default), the agent waits for the caller to speak first — recommended for most inbound flows. When on, the agent speaks first using the configured greeting."
                        />
                      )}
                      {!creating && selectedId && draft.inbound_enabled && (
                        <InboundWebhookUrl
                          agentId={selectedId}
                          token={agents.find((x) => x.id === selectedId)?.inbound_token}
                        />
                      )}
                      {!creating && selectedId && !draft.inbound_enabled && (
                        <p className="text-[11px] text-gray-400">
                          Enable inbound calls to reveal your webhook URL.
                        </p>
                      )}
                      {creating && (
                        <p className="text-[11px] text-gray-400">
                          Save this assistant first to get a webhook URL.
                        </p>
                      )}
                    </SfSection>
                  </>
                )}

                {tab === "knowledge" && (
                  <KnowledgeTab agentId={selectedId} creating={creating} />
                )}

                {tab === "actions" && (
                  <ActionsTab draft={draft} setDraft={setDraft} />
                )}

                {tab !== "knowledge" && (
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
                )}
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

function StageCard({ index, total, stage, onUpdate, onDelete, onMoveUp, onMoveDown, onDragStart, onDragOver, onDrop, initiallyExpanded }: {
  index: number;
  total: number;
  stage: ConversationStage;
  onUpdate: (s: ConversationStage) => void;
  onDelete: () => void;
  onMoveUp?: () => void;
  onMoveDown?: () => void;
  onDragStart?: (e: React.DragEvent) => void;
  onDragOver?: (e: React.DragEvent) => void;
  onDrop?: (e: React.DragEvent) => void;
  initiallyExpanded?: boolean;
}) {
  const [expanded, setExpanded] = useState(initiallyExpanded ?? false);
  return (
    <div
      draggable
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDrop={onDrop}
      className={`border rounded-xl transition-colors ${expanded ? "bg-violet-50/40 border-violet-200" : "bg-gray-50 border-gray-200"} cursor-grab active:cursor-grabbing active:opacity-60`}
    >
      {/* Collapsed header — always visible */}
      <div
        className="flex items-center gap-2 px-4 py-3 cursor-pointer select-none"
        onClick={() => setExpanded((v) => !v)}
      >
        <span className="shrink-0 w-5 h-5 rounded-full bg-violet-100 text-violet-700 text-[10px] font-bold flex items-center justify-center">
          {index + 1}
        </span>
        <span className="flex-1 text-sm font-medium text-gray-800 truncate">
          {stage.name || <span className="text-gray-400 font-normal">Untitled stage</span>}
        </span>
        {stage.goal && !expanded && (
          <span className="text-[10px] text-gray-400 truncate max-w-[180px]">{stage.goal}</span>
        )}
        <div className="flex items-center gap-0.5" onClick={(e) => e.stopPropagation()}>
          <button
            type="button"
            onClick={onMoveUp}
            disabled={index === 0}
            className="p-1.5 rounded-lg text-gray-300 hover:text-gray-600 hover:bg-gray-100 disabled:opacity-30 disabled:pointer-events-none transition-colors"
            aria-label="Move stage up"
          >
            <ChevronUp className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={onMoveDown}
            disabled={index === total - 1}
            className="p-1.5 rounded-lg text-gray-300 hover:text-gray-600 hover:bg-gray-100 disabled:opacity-30 disabled:pointer-events-none transition-colors"
            aria-label="Move stage down"
          >
            <ChevronDown className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={onDelete}
            className="p-1.5 rounded-lg text-gray-300 hover:text-red-500 hover:bg-red-50 transition-colors"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
        <ChevronDown className={`w-3.5 h-3.5 text-gray-400 shrink-0 transition-transform ${expanded ? "rotate-180" : ""}`} />
      </div>

      {/* Expanded editor */}
      {expanded && (
        <div className="px-4 pb-4 space-y-2 border-t border-violet-100">
          <div className="pt-3">
            <input
              value={stage.name}
              onChange={(e) => onUpdate({ ...stage, name: e.target.value })}
              placeholder="Stage name"
              className="w-full px-2.5 py-1.5 bg-white border border-gray-200 rounded-lg text-sm font-medium text-gray-800 placeholder:text-gray-300 focus:outline-none focus:ring-2 focus:ring-violet-500/20 focus:border-violet-400"
            />
          </div>
          <input
            value={stage.goal}
            onChange={(e) => onUpdate({ ...stage, goal: e.target.value })}
            placeholder="Goal — what should the agent achieve in this stage?"
            className="w-full px-2.5 py-1.5 bg-white border border-gray-200 rounded-lg text-xs text-gray-700 placeholder:text-gray-300 focus:outline-none focus:ring-2 focus:ring-violet-500/20 focus:border-violet-400"
          />
          <textarea
            value={stage.instructions}
            onChange={(e) => onUpdate({ ...stage, instructions: e.target.value })}
            rows={2}
            placeholder="Specific instructions for this stage (optional)"
            className="w-full px-2.5 py-1.5 bg-white border border-gray-200 rounded-lg text-xs text-gray-700 placeholder:text-gray-300 focus:outline-none focus:ring-2 focus:ring-violet-500/20 focus:border-violet-400 resize-y"
          />
        </div>
      )}
    </div>
  );
}

function ActionsTab({ draft, setDraft }: { draft: Pick<Draft, "tools">; setDraft: React.Dispatch<React.SetStateAction<Draft>> }) {
  const [showNewTool, setShowNewTool] = useState(false);
  const [newTool, setNewTool] = useState<Omit<AgentTool, "id">>({
    name: "", description: "", webhook_url: "", parameters_schema: [],
  });
  const [paramDraft, setParamDraft] = useState<{ name: string; type: "string" | "number" | "boolean"; description: string; required: boolean }>({ name: "", type: "string", description: "", required: false });

  const hasSaveLead = (draft.tools ?? []).some((t) => t.builtin === "save_lead");
  const hasEndCall = (draft.tools ?? []).some((t) => t.builtin === "end_call");

  const toggleBuiltin = (builtin: "save_lead" | "end_call", enabled: boolean) => {
    if (enabled) {
      const builtinDef: AgentTool = {
        id: crypto.randomUUID(),
        name: builtin,
        description: builtin === "save_lead"
          ? "Save the caller's contact information (name, email, phone, company, notes)"
          : "End the call when the conversation goal is achieved",
        webhook_url: "",
        parameters_schema: [],
        builtin,
      };
      setDraft((d) => ({ ...d, tools: [...(d.tools ?? []), builtinDef] }));
    } else {
      setDraft((d) => ({ ...d, tools: (d.tools ?? []).filter((t) => t.builtin !== builtin) }));
    }
  };

  const addCustomTool = () => {
    if (!newTool.name.trim()) return;
    const tool: AgentTool = {
      id: crypto.randomUUID(),
      name: newTool.name.trim().replace(/\s+/g, "_").toLowerCase(),
      description: newTool.description.trim(),
      webhook_url: newTool.webhook_url.trim(),
      parameters_schema: newTool.parameters_schema,
    };
    setDraft((d) => ({ ...d, tools: [...(d.tools ?? []), tool] }));
    setNewTool({ name: "", description: "", webhook_url: "", parameters_schema: [] });
    setParamDraft({ name: "", type: "string", description: "", required: false });
    setShowNewTool(false);
  };

  const deleteTool = (id: string) => {
    setDraft((d) => ({ ...d, tools: (d.tools ?? []).filter((t) => t.id !== id) }));
  };

  const customTools = (draft.tools ?? []).filter((t) => !t.builtin);

  return (
    <div className="space-y-6">
      {/* Built-in tools */}
      <SfSection title="Built-in actions" subtitle="Pre-built tools the agent can call during the conversation.">
        <div className="space-y-3">
          <div className="flex items-start justify-between gap-3 p-3 rounded-xl bg-gray-50 border border-gray-200">
            <div className="flex-1">
              <div className="text-sm font-semibold text-gray-800">Save lead</div>
              <div className="text-[11px] text-gray-400 mt-0.5">Saves the caller's name, email, phone, company or notes to the call record.</div>
            </div>
            <SfToggle
              checked={hasSaveLead}
              onChange={(b) => toggleBuiltin("save_lead", b)}
              label=""
            />
          </div>
          <div className="flex items-start justify-between gap-3 p-3 rounded-xl bg-gray-50 border border-gray-200">
            <div className="flex-1">
              <div className="text-sm font-semibold text-gray-800">End call</div>
              <div className="text-[11px] text-gray-400 mt-0.5">Lets the agent politely end the call when the goal is achieved or the caller says goodbye.</div>
            </div>
            <SfToggle
              checked={hasEndCall}
              onChange={(b) => toggleBuiltin("end_call", b)}
              label=""
            />
          </div>
        </div>
      </SfSection>

      {/* Custom webhook tools */}
      <SfSection title="Custom webhook tools" subtitle="Add your own tools backed by a webhook URL.">
        <div className="space-y-3">
          {customTools.length === 0 && !showNewTool && (
            <div className="py-6 text-center">
              <Zap className="w-7 h-7 text-gray-200 mx-auto mb-2" />
              <p className="text-xs text-gray-400">No custom tools yet.</p>
            </div>
          )}
          {customTools.map((tool) => (
            <div key={tool.id} className="flex items-start gap-3 p-3 rounded-xl bg-gray-50 border border-gray-200">
              <div className="flex-1 min-w-0">
                <div className="text-sm font-semibold text-gray-800">{tool.name}</div>
                {tool.description && <div className="text-[11px] text-gray-500 mt-0.5">{tool.description}</div>}
                {tool.webhook_url && (
                  <div className="text-[10px] text-gray-400 font-mono mt-1 truncate">{tool.webhook_url}</div>
                )}
                {tool.parameters_schema.length > 0 && (
                  <div className="text-[10px] text-gray-400 mt-1">
                    Params: {tool.parameters_schema.map((p) => p.name).join(", ")}
                  </div>
                )}
              </div>
              <button
                type="button"
                onClick={() => deleteTool(tool.id)}
                className="shrink-0 p-1.5 rounded-lg text-gray-300 hover:text-red-500 hover:bg-red-50 transition-colors"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          ))}

          {showNewTool && (
            <div className="p-4 rounded-xl bg-violet-50 border border-violet-200 space-y-3">
              <div className="text-xs font-semibold text-violet-700 uppercase tracking-wide">New tool</div>
              <input
                value={newTool.name}
                onChange={(e) => setNewTool((t) => ({ ...t, name: e.target.value }))}
                placeholder="Tool name (e.g. book_appointment)"
                className="w-full px-3 py-2 bg-white border border-violet-200 rounded-lg text-sm text-gray-800 placeholder:text-gray-300 focus:outline-none focus:ring-2 focus:ring-violet-500/20"
              />
              <textarea
                value={newTool.description}
                onChange={(e) => setNewTool((t) => ({ ...t, description: e.target.value }))}
                rows={2}
                placeholder="Describe what this tool does — this is what the LLM sees"
                className="w-full px-3 py-2 bg-white border border-violet-200 rounded-lg text-xs text-gray-700 placeholder:text-gray-300 focus:outline-none focus:ring-2 focus:ring-violet-500/20 resize-none"
              />
              <input
                value={newTool.webhook_url}
                onChange={(e) => setNewTool((t) => ({ ...t, webhook_url: e.target.value }))}
                placeholder="https://your-server.com/webhook"
                className="w-full px-3 py-2 bg-white border border-violet-200 rounded-lg text-xs font-mono text-gray-700 placeholder:text-gray-300 focus:outline-none focus:ring-2 focus:ring-violet-500/20"
              />
              {newTool.parameters_schema.length > 0 && (
                <div className="space-y-1.5">
                  <div className="text-[10px] font-semibold text-violet-600 uppercase tracking-wide">Parameters</div>
                  {newTool.parameters_schema.map((p, i) => (
                    <div key={i} className="flex items-center gap-2 text-xs">
                      <span className="font-mono text-gray-700 flex-1">{p.name}</span>
                      <span className="text-gray-400">{p.type}</span>
                      {p.required && <span className="text-violet-600 font-semibold text-[10px]">required</span>}
                      <button
                        type="button"
                        onClick={() => setNewTool((t) => ({ ...t, parameters_schema: t.parameters_schema.filter((_, j) => j !== i) }))}
                        className="text-gray-300 hover:text-red-500"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
              {newTool.parameters_schema.length < 10 && (
                <div className="space-y-1.5 p-3 rounded-lg border border-violet-100 bg-white">
                  <div className="text-[10px] font-semibold text-violet-600 uppercase tracking-wide mb-2">Add parameter</div>
                  <div className="flex gap-2">
                    <input
                      value={paramDraft.name}
                      onChange={(e) => setParamDraft((p) => ({ ...p, name: e.target.value }))}
                      placeholder="param_name"
                      className="flex-1 px-2.5 py-1.5 bg-gray-50 border border-violet-200 rounded-lg text-xs font-mono placeholder:text-gray-300 focus:outline-none focus:ring-1 focus:ring-violet-400"
                    />
                    <select
                      value={paramDraft.type}
                      onChange={(e) => setParamDraft((p) => ({ ...p, type: e.target.value as "string" | "number" | "boolean" }))}
                      className="px-2 py-1.5 bg-gray-50 border border-violet-200 rounded-lg text-xs focus:outline-none"
                    >
                      <option value="string">string</option>
                      <option value="number">number</option>
                      <option value="boolean">boolean</option>
                    </select>
                  </div>
                  <input
                    value={paramDraft.description ?? ""}
                    onChange={(e) => setParamDraft((p) => ({ ...p, description: e.target.value }))}
                    placeholder="Description (what this parameter is for)"
                    className="w-full px-2.5 py-1.5 bg-gray-50 border border-violet-200 rounded-lg text-xs placeholder:text-gray-300 focus:outline-none focus:ring-1 focus:ring-violet-400"
                  />
                  <div className="flex items-center justify-between">
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={paramDraft.required ?? false}
                        onChange={(e) => setParamDraft((p) => ({ ...p, required: e.target.checked }))}
                        className="w-3.5 h-3.5 rounded text-violet-600"
                      />
                      <span className="text-xs text-gray-600">Required</span>
                    </label>
                    <button
                      type="button"
                      onClick={() => {
                        if (!paramDraft.name.trim()) return;
                        setNewTool((t) => ({ ...t, parameters_schema: [...t.parameters_schema, { ...paramDraft, name: paramDraft.name.trim() }] }));
                        setParamDraft({ name: "", type: "string", description: "", required: false });
                      }}
                      disabled={!paramDraft.name.trim()}
                      className="px-2.5 py-1.5 bg-violet-600 text-white rounded-lg text-xs font-semibold hover:bg-violet-700 disabled:opacity-40"
                    >
                      + Add param
                    </button>
                  </div>
                </div>
              )}
              <div className="flex gap-2 pt-1">
                <button
                  type="button"
                  onClick={addCustomTool}
                  disabled={!newTool.name.trim()}
                  className="px-3.5 py-2 bg-violet-600 text-white rounded-lg text-xs font-semibold hover:bg-violet-700 disabled:opacity-40"
                >
                  Add tool
                </button>
                <button
                  type="button"
                  onClick={() => { setShowNewTool(false); setNewTool({ name: "", description: "", webhook_url: "", parameters_schema: [] }); }}
                  className="px-3.5 py-2 text-gray-500 hover:text-gray-700 rounded-lg text-xs font-medium border border-gray-200 hover:bg-gray-50"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}

          {!showNewTool && customTools.length < 10 && (
            <button
              type="button"
              onClick={() => setShowNewTool(true)}
              className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl border border-dashed border-gray-300 text-xs font-medium text-gray-500 hover:border-violet-400 hover:text-violet-600 transition-colors"
            >
              <PlusCircle className="w-3.5 h-3.5" /> Add webhook tool
            </button>
          )}
        </div>
      </SfSection>
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

type KbInputMode = "text" | "url" | "file";

function KnowledgeTab({ agentId, creating }: { agentId: string | null; creating: boolean }) {
  const qc = useQueryClient();
  const { data: docs, isLoading } = useKnowledgeDocs(agentId);
  const [mode, setMode] = useState<KbInputMode>("text");
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [url, setUrl] = useState("");
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState("");
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [expandedDocId, setExpandedDocId] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);

  if (creating) {
    return (
      <SfSection title="Knowledge base" subtitle="Save the assistant first to add knowledge documents.">
        <div className="py-4 text-center text-sm text-gray-400">
          <BookOpen className="w-8 h-8 text-gray-200 mx-auto mb-2" />
          Create the assistant to start adding knowledge.
        </div>
      </SfSection>
    );
  }

  const invalidate = () => qc.invalidateQueries({ queryKey: ["knowledge-docs", agentId] });

  const onAddText = async () => {
    if (!title.trim() || !content.trim()) { setError("Title and content are required."); return; }
    setAdding(true); setError("");
    try {
      await fetch(apiUrl(`/agents/${agentId}/documents/text`), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: title.trim(), content: content.trim() }),
      }).then(async (r) => { if (!r.ok) throw new Error((await r.json()).error); });
      setTitle(""); setContent("");
      await invalidate();
    } catch (e: any) { setError(e?.message || "Failed to add"); }
    finally { setAdding(false); }
  };

  const onAddUrl = async () => {
    if (!url.trim()) { setError("URL is required."); return; }
    setAdding(true); setError("");
    try {
      await fetch(apiUrl(`/agents/${agentId}/documents/url`), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: url.trim() }),
      }).then(async (r) => { if (!r.ok) throw new Error((await r.json()).error); });
      setUrl("");
      await invalidate();
    } catch (e: any) { setError(e?.message || "Failed to scrape URL"); }
    finally { setAdding(false); }
  };

  const onAddFile = async (f: File) => {
    setAdding(true); setError("");
    try {
      const form = new FormData();
      form.append("file", f);
      await fetch(apiUrl(`/agents/${agentId}/documents/file`), {
        method: "POST",
        body: form,
      }).then(async (r) => { if (!r.ok) throw new Error((await r.json()).error); });
      await invalidate();
    } catch (e: any) { setError(e?.message || "Upload failed"); }
    finally { setAdding(false); }
  };

  const onDelete = async (docId: string) => {
    setDeletingId(docId);
    try {
      await fetch(apiUrl(`/agents/${agentId}/documents/${docId}`), { method: "DELETE" });
      await invalidate();
    } finally { setDeletingId(null); }
  };

  const modeButtons: { id: KbInputMode; label: string; icon: React.ReactNode }[] = [
    { id: "text", label: "Text snippet", icon: <FileText className="w-3.5 h-3.5" /> },
    { id: "url", label: "Scrape URL", icon: <Globe className="w-3.5 h-3.5" /> },
    { id: "file", label: "Upload file", icon: <Upload className="w-3.5 h-3.5" /> },
  ];

  return (
    <div className="space-y-6 pb-8">
      <SfSection
        title="Knowledge base"
        subtitle="Documents the agent can reference to answer caller questions accurately."
      >
        <div className="flex gap-1.5 mb-4">
          {modeButtons.map((b) => (
            <button
              key={b.id}
              onClick={() => { setMode(b.id); setError(""); }}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                mode === b.id
                  ? "bg-violet-600 text-white"
                  : "bg-gray-100 text-gray-500 hover:bg-gray-200"
              }`}
            >
              {b.icon} {b.label}
            </button>
          ))}
        </div>

        {mode === "text" && (
          <div className="space-y-3">
            <SfField label="Title">
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g. Pricing FAQ, Refund Policy, Product Overview…"
                className="w-full px-3.5 py-2.5 bg-white border border-gray-200 rounded-xl text-sm text-gray-800 placeholder:text-gray-300 focus:outline-none focus:ring-2 focus:ring-violet-500/20 focus:border-violet-400"
              />
            </SfField>
            <SfField label="Content">
              <textarea
                value={content}
                onChange={(e) => setContent(e.target.value)}
                rows={8}
                placeholder="Paste or type the information you want the agent to know…"
                className="w-full px-3.5 py-3 bg-white border border-gray-200 rounded-xl text-sm text-gray-800 placeholder:text-gray-300 focus:outline-none focus:ring-2 focus:ring-violet-500/20 focus:border-violet-400 resize-y"
              />
            </SfField>
            <button
              onClick={onAddText}
              disabled={adding || !title.trim() || !content.trim()}
              className="flex items-center gap-2 px-4 py-2 bg-violet-600 hover:bg-violet-700 disabled:opacity-40 text-white text-xs font-semibold rounded-lg transition-colors"
            >
              {adding ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
              Add document
            </button>
          </div>
        )}

        {mode === "url" && (
          <div className="space-y-3">
            <SfField label="Page URL">
              <input
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="https://your-site.com/faq"
                className="w-full px-3.5 py-2.5 bg-white border border-gray-200 rounded-xl text-sm text-gray-800 placeholder:text-gray-300 focus:outline-none focus:ring-2 focus:ring-violet-500/20 focus:border-violet-400 font-mono"
              />
            </SfField>
            <p className="text-[11px] text-gray-400">
              The server will fetch and extract text from this page. Works best with simple, text-heavy pages.
            </p>
            <button
              onClick={onAddUrl}
              disabled={adding || !url.trim()}
              className="flex items-center gap-2 px-4 py-2 bg-violet-600 hover:bg-violet-700 disabled:opacity-40 text-white text-xs font-semibold rounded-lg transition-colors"
            >
              {adding ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Globe className="w-3.5 h-3.5" />}
              Scrape & add
            </button>
          </div>
        )}

        {mode === "file" && (
          <div className="space-y-3">
            <div
              onClick={() => fileRef.current?.click()}
              className="border-2 border-dashed border-gray-200 rounded-xl p-8 text-center cursor-pointer hover:border-violet-400 hover:bg-violet-50/30 transition-colors"
            >
              <Upload className="w-6 h-6 text-gray-300 mx-auto mb-2" />
              <p className="text-sm font-medium text-gray-500 mb-1">Click to upload</p>
              <p className="text-[11px] text-gray-400">Supported: .pdf, .docx, .txt, .md, .csv · Max 5 MB</p>
              {adding && (
                <div className="flex items-center justify-center gap-2 mt-3 text-xs text-violet-600">
                  <Loader2 className="w-3.5 h-3.5 animate-spin" /> Uploading…
                </div>
              )}
            </div>
            <input
              ref={fileRef}
              type="file"
              accept=".pdf,.docx,.txt,.md,.csv"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) onAddFile(f);
                e.target.value = "";
              }}
            />
          </div>
        )}

        {error && (
          <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-red-50 border border-red-200 text-red-600 text-xs">
            <AlertCircle className="w-3.5 h-3.5 shrink-0" />
            {error}
          </div>
        )}
      </SfSection>

      <SfSection title="Saved documents" subtitle={`${docs?.length ?? 0} document${(docs?.length ?? 0) === 1 ? "" : "s"} in this agent's knowledge base`}>
        {isLoading && (
          <div className="flex items-center gap-2 text-xs text-gray-400 py-2">
            <Loader2 className="w-3.5 h-3.5 animate-spin" /> Loading…
          </div>
        )}
        {!isLoading && (!docs || docs.length === 0) && (
          <div className="py-6 text-center">
            <BookOpen className="w-8 h-8 text-gray-200 mx-auto mb-2" />
            <p className="text-xs text-gray-400">No documents yet. Add your first one above.</p>
          </div>
        )}
        {docs && docs.length > 0 && (() => {
          const KB_BUDGET = 12000;
          const totalChars = docs.reduce((acc, d) => acc + (d.size ?? d.content?.length ?? 0), 0);
          const pct = Math.min(100, Math.round((totalChars / KB_BUDGET) * 100));
          const barColor = pct >= 90 ? "bg-red-500" : pct >= 70 ? "bg-amber-500" : "bg-violet-500";
          return (
          <>
          <div className="mb-3 space-y-1.5">
            <div className="flex items-center justify-between text-[11px]">
              <span className="text-gray-400 font-medium">Context usage</span>
              <span className={`font-semibold ${pct >= 90 ? "text-red-600" : pct >= 70 ? "text-amber-600" : "text-violet-600"}`}>
                {totalChars.toLocaleString()} / {KB_BUDGET.toLocaleString()} chars ({pct}%)
              </span>
            </div>
            <div className="w-full h-1.5 bg-gray-100 rounded-full overflow-hidden">
              <div className={`h-full rounded-full transition-all ${barColor}`} style={{ width: `${pct}%` }} />
            </div>
            <p className="text-[10px] text-gray-400">
              Top 3 most relevant docs are injected per turn — within a 4,000-char budget.
            </p>
          </div>
          <div className="space-y-2">
            {docs.map((doc) => {
              const sizeBytes = doc.size ?? new TextEncoder().encode(doc.content ?? "").length;
              const sizeLabel = sizeBytes >= 1024
                ? `${(sizeBytes / 1024).toFixed(1)} KB`
                : `${sizeBytes} B`;
              return (
                <div
                  key={doc.id}
                  className="flex items-start gap-3 px-3.5 py-3 rounded-xl bg-gray-50 border border-gray-200 group"
                >
                  <div className="shrink-0 mt-0.5 w-6 h-6 rounded-md bg-white border border-gray-200 flex items-center justify-center">
                    {doc.source_type === "url" ? (
                      <Globe className="w-3 h-3 text-gray-400" />
                    ) : doc.source_type === "file" ? (
                      <FileText className="w-3 h-3 text-gray-400" />
                    ) : (
                      <BookOpen className="w-3 h-3 text-gray-400" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <div className="text-sm font-medium text-gray-800 truncate flex-1">{doc.title}</div>
                      {(doc.excerpt || doc.content) && (
                        <button
                          type="button"
                          onClick={() => setExpandedDocId(expandedDocId === doc.id ? null : doc.id)}
                          className="shrink-0 flex items-center gap-1 text-[10px] text-gray-400 hover:text-violet-600 transition-colors font-medium"
                        >
                          {expandedDocId === doc.id ? (
                            <><ChevronUp className="w-3 h-3" />Hide</>
                          ) : (
                            <><ChevronDown className="w-3 h-3" />Preview</>
                          )}
                        </button>
                      )}
                    </div>
                    <div className="text-[11px] text-gray-400 mt-0.5 truncate">
                      {doc.source_type === "url" && doc.source_url ? (
                        <a href={doc.source_url} target="_blank" rel="noreferrer" className="hover:text-violet-500 underline">
                          {doc.source_url}
                        </a>
                      ) : (
                        <span className={expandedDocId === doc.id ? "hidden" : ""}>
                          {(doc.excerpt ?? doc.content).slice(0, 80)}{(doc.excerpt ?? doc.content).length > 80 ? "…" : ""}
                        </span>
                      )}
                    </div>
                    {expandedDocId === doc.id && (
                      <div className="mt-2 px-2.5 py-2 rounded-lg bg-white border border-gray-100 text-[11px] text-gray-600 leading-relaxed whitespace-pre-wrap break-words max-h-40 overflow-y-auto">
                        {doc.excerpt ?? doc.content}
                      </div>
                    )}
                    <div className="text-[10px] text-gray-300 mt-1">
                      {doc.source_type.toUpperCase()} · {new Date(doc.created_at).toLocaleDateString()} · {sizeLabel}
                    </div>
                  </div>
                  <button
                    onClick={() => onDelete(doc.id)}
                    disabled={deletingId === doc.id}
                    className="shrink-0 p-1.5 rounded-lg text-gray-300 hover:text-red-500 hover:bg-red-50 transition-colors opacity-0 group-hover:opacity-100"
                    aria-label="Delete document"
                  >
                    {deletingId === doc.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <X className="w-3.5 h-3.5" />}
                  </button>
                </div>
              );
            })}
          </div>
          </>
          );
        })()}
      </SfSection>
    </div>
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

function InboundWebhookUrl({ agentId, token }: { agentId: string; token?: string }) {
  const [copied, setCopied] = useState(false);
  const base = `${window.location.origin}${apiUrl(`/inbound/${agentId}`)}`;
  const webhookUrl = token ? `${base}?t=${token}` : base;
  const onCopy = async () => {
    try {
      await navigator.clipboard.writeText(webhookUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {}
  };
  return (
    <div className="mt-3 rounded-xl bg-blue-50 border border-blue-200 p-3.5 space-y-2">
      <div className="flex items-center gap-2 text-[11px] font-semibold text-blue-700 uppercase tracking-wide">
        <Link className="w-3.5 h-3.5" />
        Webhook URL
      </div>
      <div className="flex items-center gap-2">
        <input
          readOnly
          value={webhookUrl}
          className="flex-1 px-2.5 py-1.5 bg-white border border-blue-200 rounded-lg text-xs font-mono text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-400/30"
        />
        <button
          type="button"
          onClick={onCopy}
          className="shrink-0 flex items-center gap-1.5 px-2.5 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold rounded-lg transition-colors"
        >
          {copied ? <CheckCircle className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
          {copied ? "Copied!" : "Copy"}
        </button>
      </div>
      <p className="text-[11px] text-blue-600 leading-relaxed">
        POST this URL from your SIP provider's inbound webhook or configure it as a LiveKit SIP dispatch rule. The <code className="bg-blue-100 px-0.5 rounded">?t=</code> token authenticates the request.
      </p>
    </div>
  );
}
