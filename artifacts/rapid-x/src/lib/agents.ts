import { useQuery } from "@tanstack/react-query";
import { apiGet } from "./api";
import type { Catalog, TtsProvider } from "./voices";

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
  interruption_sensitivity: "low" | "medium" | "high";
  wait_for_user_first: boolean;
  template_id: string | null;
  created_at: string;
  updated_at: string;
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
  transcript: { role: "user" | "assistant"; text: string; ts: string }[];
};

export function useAgents() {
  return useQuery({
    queryKey: ["agents"],
    queryFn: () => apiGet<{ agents: Agent[] }>("/agents"),
  });
}

export function useCatalog() {
  return useQuery({
    queryKey: ["agents", "catalog"],
    queryFn: () => apiGet<Catalog>("/agents/catalog"),
    staleTime: 5 * 60 * 1000,
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
