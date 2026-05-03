import { promises as fs } from "node:fs";
import path from "node:path";
import { randomBytes } from "node:crypto";

export type Agent = {
  id: string;
  name: string;
  system_prompt: string;
  greeting: string;
  voice_id: string;
  language: string;
  wait_for_user_first: boolean;
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

function defaultAgent(): Agent {
  return {
    id: newId("agt"),
    name: "Friendly Assistant",
    system_prompt:
      "You are a friendly, concise AI voice assistant calling on behalf of Rapid X AI. Keep replies short (1-2 sentences). Politely confirm if the caller can hear you when they're silent. End the call warmly when they say goodbye.",
    greeting:
      "Hi! Thanks for picking up — I'm an AI assistant calling from Rapid X. How are you doing today?",
    voice_id: "aura-asteria-en",
    language: "en",
    wait_for_user_first: false,
    created_at: nowIso(),
    updated_at: nowIso(),
  };
}

async function load(): Promise<Store> {
  if (cache) return cache;
  try {
    const raw = await fs.readFile(STORE_PATH, "utf8");
    const parsed = JSON.parse(raw) as Store;
    cache = {
      agents: Array.isArray(parsed.agents) ? parsed.agents : [],
      calls: Array.isArray(parsed.calls) ? parsed.calls : [],
    };
  } catch {
    cache = { agents: [], calls: [] };
  }
  if (cache.agents.length === 0) {
    cache.agents.push(defaultAgent());
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
    name: input.name,
    system_prompt: input.system_prompt ?? "",
    greeting: input.greeting ?? "",
    voice_id: input.voice_id ?? "aura-asteria-en",
    language: input.language ?? "en",
    wait_for_user_first: Boolean(input.wait_for_user_first),
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
  const updated = {
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
