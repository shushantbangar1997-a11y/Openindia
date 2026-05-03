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

export type Agent = {
  id: string;
  name: string;
  system_prompt: string;
  greeting: string;
  tts_provider: TtsProvider;
  voice_id: string;
  language: string;
  speaking_speed: number; // 0.8 - 1.3
  fillers_enabled: boolean;
  interruption_sensitivity: InterruptionSensitivity;
  wait_for_user_first: boolean;
  template_id: string | null;
  created_at: string;
  updated_at: string;
};

export type TranscriptTurn = {
  role: "user" | "assistant";
  text: string;
  ts: string;
};

export type CallRecord = {
  id: string;
  agent_id: string | null;
  agent_name: string | null;
  phone_number: string;
  room_name: string;
  status: "ringing" | "answered" | "ended" | "failed";
  started_at: string;
  answered_at: string | null;
  ended_at: string | null;
  end_reason: string | null;
  transcript: TranscriptTurn[];
};

type Store = {
  agents: Agent[];
  calls: CallRecord[];
};

const DATA_DIR = path.resolve(process.cwd(), "data");
const STORE_PATH = path.join(DATA_DIR, "store.json");

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
    speaking_speed: typeof input.speaking_speed === "number" ? input.speaking_speed : 1.0,
    fillers_enabled: input.fillers_enabled ?? true,
    interruption_sensitivity: input.interruption_sensitivity ?? "medium",
    wait_for_user_first: Boolean(input.wait_for_user_first),
    template_id: input.template_id ?? null,
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
    speaking_speed: typeof a.speaking_speed === "number" ? a.speaking_speed : 1.0,
    fillers_enabled: a.fillers_enabled ?? true,
    interruption_sensitivity: (a.interruption_sensitivity as InterruptionSensitivity) ?? "medium",
    wait_for_user_first: Boolean(a.wait_for_user_first),
    template_id: a.template_id ?? null,
    created_at: a.created_at ?? nowIso(),
    updated_at: a.updated_at ?? nowIso(),
  };
}

async function load(): Promise<Store> {
  if (cache) return cache;
  try {
    const raw = await fs.readFile(STORE_PATH, "utf8");
    const parsed = JSON.parse(raw) as Store;
    cache = {
      agents: Array.isArray(parsed.agents) ? parsed.agents.map(migrateAgent) : [],
      calls: Array.isArray(parsed.calls) ? parsed.calls : [],
    };
  } catch {
    cache = { agents: [], calls: [] };
  }
  if (cache.agents.length === 0) {
    cache.agents.push(defaultAgent());
    await persist();
  } else {
    // Persist any migrations.
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
    "id" | "transcript" | "answered_at" | "ended_at" | "end_reason" | "status"
  > & { status?: CallRecord["status"] },
): Promise<CallRecord> {
  const s = await load();
  const c: CallRecord = {
    id: newId("call"),
    agent_id: input.agent_id,
    agent_name: input.agent_name,
    phone_number: input.phone_number,
    room_name: input.room_name,
    status: input.status ?? "ringing",
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
  // Resolve catalog-driven STT model/language so the worker doesn't have to
  // re-derive them — single source of truth lives in voices.ts.
  const lang = getLanguage(agent.language);
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
    stt_model: lang?.stt_model ?? "nova-3",
    stt_language: lang?.stt_language ?? agent.language,
    speaking_speed: agent.speaking_speed,
    fillers_enabled: agent.fillers_enabled,
    interruption_sensitivity: agent.interruption_sensitivity,
    wait_for_user_first: agent.wait_for_user_first,
  });
}
