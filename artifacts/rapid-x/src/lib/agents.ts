import { useQuery } from "@tanstack/react-query";
import { apiGet } from "./api";
import type { Catalog, TtsProvider, Voice } from "./voices";

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
  speaking_speed: number;
  fillers_enabled: boolean;
  custom_fillers: string[];
  provider_api_keys: { elevenlabs?: string; cartesia?: string };
  interruption_sensitivity: "low" | "medium" | "high";
  wait_for_user_first: boolean;
  inbound_enabled: boolean;
  inbound_auto_greet: boolean;
  inbound_token?: string;
  template_id: string | null;
  conversation_stages: ConversationStage[];
  tools: AgentTool[];
  created_at: string;
  updated_at: string;
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
  transcript: { role: "user" | "assistant"; text: string; ts: string }[];
  lead_data?: LeadData;
  summary?: string;
  outcome?: CallOutcome;
  sentiment?: CallSentiment;
};

export type CallStats = {
  total: number;
  answered: number;
  avg_duration_ms: number;
  active_now: number;
};

export type GlobalSettings = {
  elevenlabs_api_key: string | null;
  cartesia_api_key: string | null;
};

export function useAgents() {
  return useQuery({
    queryKey: ["agents"],
    queryFn: () => apiGet<{ agents: Agent[] }>("/agents"),
  });
}

export function useSettings() {
  return useQuery({
    queryKey: ["settings"],
    queryFn: () => apiGet<{ settings: GlobalSettings }>("/settings").then((d) => d.settings),
    staleTime: 30_000,
  });
}

export function useElevenLabsVoices(enabled: boolean, agentElevenLabsKey?: string) {
  return useQuery({
    queryKey: ["elevenlabs-voices", agentElevenLabsKey ?? "global"],
    enabled,
    queryFn: async () => {
      const headers: Record<string, string> = {};
      if (agentElevenLabsKey && agentElevenLabsKey !== "***") {
        headers["x-agent-elevenlabs-key"] = agentElevenLabsKey;
      }
      return apiGet<{ voices: Voice[] }>("/elevenlabs/voices", Object.keys(headers).length ? headers : undefined);
    },
    staleTime: 2 * 60 * 1000,
    retry: false,
  });
}

export function useCatalog() {
  return useQuery({
    queryKey: ["agents", "catalog"],
    queryFn: () => apiGet<Catalog>("/agents/catalog"),
    staleTime: 5 * 60 * 1000,
  });
}

export type KnowledgeDoc = {
  id: string;
  agent_id: string;
  title: string;
  content: string;
  size: number;
  source_type: "text" | "url" | "file";
  source_url?: string;
  created_at: string;
};

export function useKnowledgeDocs(agentId: string | null) {
  return useQuery({
    enabled: Boolean(agentId),
    queryKey: ["knowledge-docs", agentId],
    queryFn: () => apiGet<{ docs: KnowledgeDoc[] }>(`/agents/${agentId}/documents`).then((d) => d.docs),
    staleTime: 10_000,
  });
}

export function useCalls(intervalMs = 4000) {
  return useQuery({
    queryKey: ["calls"],
    queryFn: () => apiGet<{ calls: CallRecord[] }>("/calls"),
    refetchInterval: intervalMs,
  });
}

export function useCall(id: string | null, intervalMs = 3000) {
  return useQuery({
    enabled: Boolean(id),
    queryKey: ["call", id],
    queryFn: () => apiGet<{ call: CallRecord }>(`/calls/${id}`),
    refetchInterval: intervalMs,
  });
}

export function useCallStats(intervalMs = 10_000) {
  return useQuery({
    queryKey: ["call-stats"],
    queryFn: () => apiGet<CallStats>("/calls/stats"),
    refetchInterval: intervalMs,
    staleTime: 5_000,
  });
}

export function useInboundAgents() {
  return useQuery({
    queryKey: ["agents", "inbound"],
    queryFn: () =>
      apiGet<{ agents: Agent[] }>("/agents").then((d) =>
        d.agents.filter((a) => a.inbound_enabled),
      ),
    staleTime: 10_000,
  });
}
