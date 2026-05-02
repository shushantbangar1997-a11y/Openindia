// @ts-ignore - livekit-server-sdk types
import { RoomServiceClient, SipClient } from "livekit-server-sdk";

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
