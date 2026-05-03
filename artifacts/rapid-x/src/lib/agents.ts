import { useQuery } from "@tanstack/react-query";
import { apiGet } from "./api";

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
