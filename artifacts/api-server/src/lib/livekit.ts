// @ts-ignore - livekit-server-sdk types
import { RoomServiceClient, SipClient } from "livekit-server-sdk";
import { createHmac } from "node:crypto";

const LIVEKIT_URL = process.env["LIVEKIT_URL"];
const LIVEKIT_API_KEY = process.env["LIVEKIT_API_KEY"];
const LIVEKIT_API_SECRET = process.env["LIVEKIT_API_SECRET"];

export function isLivekitConfigured(): boolean {
  return Boolean(LIVEKIT_URL && LIVEKIT_API_KEY && LIVEKIT_API_SECRET);
}

let _roomService: RoomServiceClient | null = null;
let _sipClient: SipClient | null = null;

export function getRoomService(): RoomServiceClient {
  if (!isLivekitConfigured()) {
    throw new Error("Missing LiveKit credentials");
  }
  if (!_roomService) {
    _roomService = new RoomServiceClient(
      LIVEKIT_URL!,
      LIVEKIT_API_KEY!,
      LIVEKIT_API_SECRET!,
    );
  }
  return _roomService;
}

/**
 * Generate a deterministic per-agent inbound webhook token derived from the
 * LiveKit API secret. Callers embed this as `?t=<token>` in the webhook URL
 * so we can reject requests from unknown sources without storing any extra state.
 */
export function generateInboundToken(agentId: string): string {
  const secret = LIVEKIT_API_SECRET || "fallback-dev-secret";
  return createHmac("sha256", secret).update(agentId).digest("hex").slice(0, 24);
}

export function getSipClient(): SipClient {
  if (!isLivekitConfigured()) {
    throw new Error("Missing LiveKit credentials");
  }
  if (!_sipClient) {
    _sipClient = new SipClient(
      LIVEKIT_URL!,
      LIVEKIT_API_KEY!,
      LIVEKIT_API_SECRET!,
    );
  }
  return _sipClient;
}
