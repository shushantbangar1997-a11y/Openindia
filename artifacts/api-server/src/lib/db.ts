import { promises as fs } from "node:fs";
import path from "node:path";
import { randomBytes } from "node:crypto";
import {
  DEFAULT_LANGUAGE_ID,
  DEFAULT_VOICE_ID,
  getLanguage,
  type TtsProvider,
} from "./voices";

export type InterruptionSensitivity = "low" | "medium" | "high";

export type ConversationStage = {
  id: string;
  name: string;
  goal: string;
  instructions: string;
};

export type ToolParameter = {
  name: string;
  type: "string" | "number" | "boolean";
  description: string;
  required: boolean;
};

export type AgentTool = {
  id: string;
  name: string;
  description: string;
  webhook_url: string;
  parameters_schema: ToolParameter[];
  builtin?: "save_lead" | "end_call";
};

export type LeadData = {
  name?: string;
  email?: string;
  phone?: string;
  company?: string;
  notes?: string;
};

export type Agent = {
  id: string;
  name: string;
  system_prompt: string;
  greeting: string;
  tts_provider: TtsProvider;
  voice_id: string;
  language: string;
  auto_detect_language: boolean;
  speaking_speed: number; // 0.8 - 1.3
  fillers_enabled: boolean;
  custom_fillers: string[]; // overrides built-in language pack when non-empty
  // Per-agent override for premium-provider API keys. Pasted from the UI
  // and shipped to the worker via room metadata. Redacted in API responses.
  provider_api_keys: { elevenlabs?: string; cartesia?: string };
  interruption_sensitivity: InterruptionSensitivity;
  wait_for_user_first: boolean;
  inbound_enabled: boolean;
  inbound_auto_greet: boolean;
  template_id: string | null;
  // Script flow: ordered conversation stages that guide the agent
  conversation_stages: ConversationStage[];
  // Live actions the agent can invoke during calls
  tools: AgentTool[];
  created_at: string;
  updated_at: string;
};

export type TranscriptTurn = {
  role: "user" | "assistant";
  text: string;
  ts: string;
};

export type CallOutcome = "completed" | "no-answer" | "voicemail" | "escalated";
export type CallSentiment = "positive" | "neutral" | "negative";

export type CallRecord = {
  id: string;
  agent_id: string | null;
  agent_name: string | null;
  phone_number: string;
  room_name: string;
  status: "ringing" | "answered" | "ended" | "failed";
  direction: "inbound" | "outbound";
  started_at: string;
  answered_at: string | null;
  ended_at: string | null;
  end_reason: string | null;
  transcript: TranscriptTurn[];
  // Collected during call via save_lead tool
  lead_data?: LeadData;
  // AI-generated after call ends
  summary?: string;
  outcome?: CallOutcome;
  sentiment?: CallSentiment;
};

export type GlobalSettings = {
  elevenlabs_api_key?: string;
  cartesia_api_key?: string;
  gemini_api_key?: string;
  llm_provider?: "groq" | "gemini";
};

export type KnowledgeDoc = {
  id: string;
  agent_id: string;
  title: string;
  content: string;  // populated at read time from per-doc file on disk
  size: number;
  source_type: "text" | "url" | "file";
  source_url?: string;
  created_at: string;
};

// Metadata stored in JSON (content omitted — lives in a separate file).
type KnowledgeDocMeta = Omit<KnowledgeDoc, "content">;

type Store = {
  agents: Agent[];
  calls: CallRecord[];
  settings?: GlobalSettings;
  knowledge_docs?: KnowledgeDocMeta[];
};

const DATA_DIR = path.resolve(process.cwd(), "data");
const STORE_PATH = path.join(DATA_DIR, "store.runtime.json");
const SEED_PATH = path.join(DATA_DIR, "store.seed.json");
const DOCS_DIR = path.join(DATA_DIR, "docs");

function docContentPath(agentId: string, docId: string): string {
  return path.join(DOCS_DIR, agentId, `${docId}.txt`);
}

async function writeDocContent(agentId: string, docId: string, content: string): Promise<void> {
  const p = docContentPath(agentId, docId);
  await fs.mkdir(path.dirname(p), { recursive: true });
  await fs.writeFile(p, content, "utf-8");
}

async function readDocContent(agentId: string, docId: string): Promise<string> {
  try {
    return await fs.readFile(docContentPath(agentId, docId), "utf-8");
  } catch {
    return "";
  }
}

async function removeDocContent(agentId: string, docId: string): Promise<void> {
  try {
    await fs.unlink(docContentPath(agentId, docId));
  } catch {
    // file may not exist — ignore
  }
}

let cache: Store | null = null;
let writeChain: Promise<void> = Promise.resolve();

function nowIso() {
  return new Date().toISOString();
}

export function newId(prefix: string): string {
  return `${prefix}_${randomBytes(8).toString("hex")}`;
}

function withDefaults(input: Partial<Agent> & { name: string }): Omit<Agent, "id" | "created_at" | "updated_at"> {
  return {
    name: input.name,
    system_prompt: input.system_prompt ?? "",
    greeting: input.greeting ?? "",
    tts_provider: input.tts_provider ?? "deepgram",
    voice_id: input.voice_id ?? DEFAULT_VOICE_ID,
    language: input.language ?? DEFAULT_LANGUAGE_ID,
    auto_detect_language: Boolean(input.auto_detect_language),
    speaking_speed: typeof input.speaking_speed === "number" ? input.speaking_speed : 1.0,
    fillers_enabled: input.fillers_enabled ?? true,
    custom_fillers: Array.isArray(input.custom_fillers) ? input.custom_fillers : [],
    provider_api_keys:
      input.provider_api_keys && typeof input.provider_api_keys === "object"
        ? input.provider_api_keys
        : {},
    interruption_sensitivity: input.interruption_sensitivity ?? "medium",
    wait_for_user_first: Boolean(input.wait_for_user_first),
    inbound_enabled: Boolean(input.inbound_enabled),
    inbound_auto_greet: Boolean(input.inbound_auto_greet),
    template_id: input.template_id ?? null,
    conversation_stages: Array.isArray(input.conversation_stages) ? input.conversation_stages : [],
    tools: Array.isArray(input.tools) ? input.tools : [],
  };
}

function defaultAgent(): Agent {
  const base = withDefaults({
    name: "Friendly Assistant",
    system_prompt:
      "You are a friendly, concise voice assistant calling on behalf of Rapid X AI. Keep replies short (1-2 sentences). Use contractions and a casual, human tone. End the call warmly when the caller says goodbye.",
    greeting:
      "Hey, thanks for picking up — I'm calling from Rapid X. How are you doing today?",
  });
  return {
    id: newId("agt"),
    ...base,
    created_at: nowIso(),
    updated_at: nowIso(),
  };
}

// Migrate older call records to add missing fields.
function migrateCall(c: any): CallRecord {
  return {
    ...c,
    direction: (c.direction === "inbound" || c.direction === "outbound") ? c.direction : "outbound",
    lead_data: c.lead_data ?? undefined,
    summary: c.summary,
    outcome: c.outcome,
    sentiment: c.sentiment,
  };
}

// Migrate older agent records that don't have all fields yet.
function migrateAgent(a: any): Agent {
  return {
    id: a.id,
    name: a.name ?? "Untitled Agent",
    system_prompt: a.system_prompt ?? "",
    greeting: a.greeting ?? "",
    tts_provider: (a.tts_provider as TtsProvider) ?? "deepgram",
    voice_id: a.voice_id ?? DEFAULT_VOICE_ID,
    language: a.language ?? DEFAULT_LANGUAGE_ID,
    auto_detect_language: Boolean(a.auto_detect_language),
    speaking_speed: typeof a.speaking_speed === "number" ? a.speaking_speed : 1.0,
    fillers_enabled: a.fillers_enabled ?? true,
    custom_fillers: Array.isArray(a.custom_fillers) ? a.custom_fillers : [],
    provider_api_keys:
      a.provider_api_keys && typeof a.provider_api_keys === "object"
        ? a.provider_api_keys
        : {},
    interruption_sensitivity: (a.interruption_sensitivity as InterruptionSensitivity) ?? "medium",
    wait_for_user_first: Boolean(a.wait_for_user_first),
    inbound_enabled: Boolean(a.inbound_enabled),
    inbound_auto_greet: Boolean(a.inbound_auto_greet),
    template_id: a.template_id ?? null,
    conversation_stages: Array.isArray(a.conversation_stages) ? a.conversation_stages : [],
    tools: Array.isArray(a.tools) ? a.tools : [],
    created_at: a.created_at ?? nowIso(),
    updated_at: a.updated_at ?? nowIso(),
  };
}

async function load(): Promise<Store> {
  if (cache) return cache;
  let raw: string | null = null;
  for (const p of [STORE_PATH, SEED_PATH]) {
    try {
      raw = await fs.readFile(p, "utf8");
      break;
    } catch {
      /* try next */
    }
  }
  if (raw) {
    try {
      const parsed = JSON.parse(raw) as Store;
      cache = {
        agents: Array.isArray(parsed.agents) ? parsed.agents.map(migrateAgent) : [],
        calls: Array.isArray(parsed.calls) ? parsed.calls.map(migrateCall) : [],
        settings: parsed.settings ?? undefined,
        knowledge_docs: Array.isArray(parsed.knowledge_docs) ? parsed.knowledge_docs : [],
      };
    } catch {
      cache = { agents: [], calls: [], knowledge_docs: [] };
    }
  } else {
    cache = { agents: [], calls: [], knowledge_docs: [] };
  }
  if (cache.agents.length === 0) {
    cache.agents.push(defaultAgent());
    await persist();
  } else {
    await persist();
  }
  return cache;
}

async function persist(): Promise<void> {
  if (!cache) return;
  const data = JSON.stringify(cache, null, 2);
  writeChain = writeChain
    .then(async () => {
      await fs.mkdir(DATA_DIR, { recursive: true });
      await fs.writeFile(STORE_PATH, data, "utf8");
    })
    .catch(() => {});
  await writeChain;
}

// ── Global Settings ─────────────────────────────────────
export async function getSettings(): Promise<GlobalSettings> {
  const s = await load();
  return s.settings ?? {};
}

export async function updateSettings(patch: Partial<GlobalSettings>): Promise<GlobalSettings> {
  const s = await load();
  s.settings = { ...(s.settings ?? {}), ...patch };
  cache = s;
  await persist();
  return s.settings;
}

// ── Agents ──────────────────────────────────────────────
export async function listAgents(): Promise<Agent[]> {
  const s = await load();
  return [...s.agents].sort((a, b) =>
    a.created_at < b.created_at ? -1 : 1,
  );
}

export async function getAgent(id: string): Promise<Agent | null> {
  const s = await load();
  return s.agents.find((a) => a.id === id) ?? null;
}

export async function createAgent(
  input: Partial<Agent> & { name: string },
): Promise<Agent> {
  const s = await load();
  const a: Agent = {
    id: newId("agt"),
    ...withDefaults(input),
    created_at: nowIso(),
    updated_at: nowIso(),
  };
  s.agents.push(a);
  await persist();
  return a;
}

export async function updateAgent(
  id: string,
  patch: Partial<Agent>,
): Promise<Agent | null> {
  const s = await load();
  const idx = s.agents.findIndex((a) => a.id === id);
  if (idx === -1) return null;
  const updated: Agent = {
    ...s.agents[idx]!,
    ...patch,
    id,
    created_at: s.agents[idx]!.created_at,
    updated_at: nowIso(),
  };
  s.agents[idx] = updated;
  await persist();
  return updated;
}

export async function deleteAgent(id: string): Promise<boolean> {
  const s = await load();
  const before = s.agents.length;
  s.agents = s.agents.filter((a) => a.id !== id);
  if (s.agents.length === before) return false;
  await persist();
  return true;
}

// ── Calls ───────────────────────────────────────────────
export async function listCalls(limit = 200): Promise<CallRecord[]> {
  const s = await load();
  return [...s.calls]
    .sort((a, b) => (a.started_at < b.started_at ? 1 : -1))
    .slice(0, limit);
}

export async function getCall(id: string): Promise<CallRecord | null> {
  const s = await load();
  return s.calls.find((c) => c.id === id) ?? null;
}

export async function createCall(
  input: Omit<
    CallRecord,
    "id" | "transcript" | "answered_at" | "ended_at" | "end_reason" | "status" | "direction"
  > & { status?: CallRecord["status"]; direction?: CallRecord["direction"] },
): Promise<CallRecord> {
  const s = await load();
  const c: CallRecord = {
    id: newId("call"),
    agent_id: input.agent_id,
    agent_name: input.agent_name,
    phone_number: input.phone_number,
    room_name: input.room_name,
    status: input.status ?? "ringing",
    direction: input.direction ?? "outbound",
    started_at: input.started_at,
    answered_at: null,
    ended_at: null,
    end_reason: null,
    transcript: [],
  };
  s.calls.push(c);
  await persist();
  return c;
}

export async function updateCallByRoom(
  roomName: string,
  patch: Partial<CallRecord>,
): Promise<CallRecord | null> {
  const s = await load();
  const idx = s.calls.findIndex((c) => c.room_name === roomName);
  if (idx === -1) return null;
  s.calls[idx] = { ...s.calls[idx]!, ...patch, room_name: roomName };
  await persist();
  return s.calls[idx]!;
}

export async function updateCallLeadData(
  roomName: string,
  lead: LeadData,
): Promise<CallRecord | null> {
  const s = await load();
  const idx = s.calls.findIndex((c) => c.room_name === roomName);
  if (idx === -1) return null;
  // Merge incoming lead fields with any existing lead_data
  s.calls[idx]!.lead_data = { ...(s.calls[idx]!.lead_data ?? {}), ...lead };
  await persist();
  return s.calls[idx]!;
}

export async function appendTranscript(
  roomName: string,
  turn: TranscriptTurn,
): Promise<CallRecord | null> {
  const s = await load();
  const idx = s.calls.findIndex((c) => c.room_name === roomName);
  if (idx === -1) return null;
  s.calls[idx]!.transcript.push(turn);
  await persist();
  return s.calls[idx]!;
}

// Build the JSON metadata blob attached to a LiveKit room so the worker
// knows exactly how to behave for this call.
export function buildAgentMetadata(
  agent: Agent,
  extra: { mode?: string; phone_number?: string; per_call_prompt?: string } = {},
): string {
  const combinedPrompt = [agent.system_prompt, extra.per_call_prompt]
    .filter((p) => p && String(p).trim())
    .join("\n\n## Per-call context\n");
  const lang = getLanguage(agent.language);
  const stt_model = agent.auto_detect_language ? "nova-3" : (lang?.stt_model ?? "nova-3");
  const stt_language = agent.auto_detect_language
    ? "multi"
    : (lang?.stt_language ?? agent.language);
  return JSON.stringify({
    ...(extra.mode ? { mode: extra.mode } : {}),
    ...(extra.phone_number ? { phone_number: extra.phone_number } : {}),
    agent_id: agent.id,
    agent_name: agent.name,
    user_prompt: combinedPrompt,
    greeting: agent.greeting,
    tts_provider: agent.tts_provider,
    voice_id: agent.voice_id,
    language: agent.language,
    auto_detect_language: agent.auto_detect_language,
    stt_model,
    stt_language,
    speaking_speed: agent.speaking_speed,
    fillers_enabled: agent.fillers_enabled,
    custom_fillers: agent.custom_fillers,
    interruption_sensitivity: agent.interruption_sensitivity,
    wait_for_user_first: agent.wait_for_user_first,
    inbound_auto_greet: agent.inbound_auto_greet,
    // Script and tools are passed so the worker can inject them
    conversation_stages: agent.conversation_stages,
    tools: agent.tools,
  });
}

// ── Knowledge Docs ──────────────────────────────────────
export async function listKnowledgeDocs(agentId: string): Promise<KnowledgeDoc[]> {
  const s = await load();
  const metas = (s.knowledge_docs ?? [])
    .filter((d) => d.agent_id === agentId)
    .sort((a, b) => (a.created_at < b.created_at ? 1 : -1));
  return Promise.all(
    metas.map(async (m) => ({
      ...m,
      content: await readDocContent(agentId, m.id),
    })),
  );
}

export async function createKnowledgeDoc(
  input: Omit<KnowledgeDoc, "id" | "created_at"> & { size?: number },
): Promise<KnowledgeDoc> {
  const s = await load();
  const id = newId("kdoc");
  const { content, ...rest } = input;
  const meta: KnowledgeDocMeta = { id, ...rest, created_at: nowIso() };
  if (!s.knowledge_docs) s.knowledge_docs = [];
  s.knowledge_docs.push(meta);
  await Promise.all([writeDocContent(input.agent_id, id, content), persist()]);
  return { ...meta, content };
}

export async function deleteKnowledgeDoc(id: string, agentId: string): Promise<boolean> {
  const s = await load();
  if (!s.knowledge_docs) return false;
  const before = s.knowledge_docs.length;
  s.knowledge_docs = s.knowledge_docs.filter((d) => !(d.id === id && d.agent_id === agentId));
  if (s.knowledge_docs.length === before) return false;
  await Promise.all([persist(), removeDocContent(agentId, id)]);
  return true;
}

export async function getAgentKnowledgeText(agentId: string): Promise<string> {
  const docs = await listKnowledgeDocs(agentId);
  if (docs.length === 0) return "";
  return docs
    .map((d) => `### ${d.title}\n${d.content.slice(0, 4_000)}`)
    .join("\n\n---\n\n");
}

// Strip secrets before returning agents over the HTTP API.
export function redactAgent(a: Agent): Agent {
  const keys = a.provider_api_keys ?? {};
  const masked: { elevenlabs?: string; cartesia?: string } = {};
  if (keys.elevenlabs) masked.elevenlabs = "***";
  if (keys.cartesia) masked.cartesia = "***";
  return { ...a, provider_api_keys: masked };
}
