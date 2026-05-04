import { Router, type IRouter } from "express";
import {
  getRoomService,
  isLivekitConfigured,
  generateInboundToken,
} from "../lib/livekit";
import { buildAgentMetadata, createCall, getAgent } from "../lib/db";

const router: IRouter = Router();

/**
 * POST /inbound/:agentId
 *
 * LiveKit SIP dispatch webhook for inbound calls.
 *
 * Configure a LiveKit SIP dispatch rule (type: "webhook") pointing to this
 * endpoint. When an inbound SIP call arrives on the trunk, LiveKit POSTs:
 *   { call_id, from, to, trunk_id }
 *
 * This handler pre-creates a LiveKit room (with agent metadata so the worker
 * has its instructions before any participant joins) and responds with:
 *   { room_name, participant_identity, participant_name }
 *
 * LiveKit bridges the caller's SIP audio into that room automatically; no
 * further createSipParticipant call is needed.
 *
 * ── Security ─────────────────────────────────────────────────────────────────
 * All requests MUST include the per-agent HMAC token as a query parameter:
 *   POST /inbound/:agentId?t=<token>
 * where <token> is the value shown in the Assistants → Call behavior panel.
 * Requests with a missing or wrong token receive HTTP 401.
 */
router.post("/inbound/:agentId", async (req, res) => {
  try {
    const { agentId } = req.params as { agentId: string };

    // ── Token validation ──────────────────────────────────────────────────────
    const expectedToken = generateInboundToken(agentId);
    const providedToken = String((req.query["t"] ?? req.query["token"]) ?? "").trim();

    if (!providedToken || providedToken !== expectedToken) {
      req.log.warn({ agentId, hasToken: Boolean(providedToken) }, "Inbound webhook: invalid or missing token");
      return res.status(401).json({ error: "Unauthorized: missing or invalid token" });
    }

    // ── Agent lookup ──────────────────────────────────────────────────────────
    const agent = await getAgent(agentId);
    if (!agent) {
      return res.status(404).json({ error: "Agent not found" });
    }

    if (!agent.inbound_enabled) {
      return res.status(403).json({ error: "Inbound calls are not enabled for this agent" });
    }

    if (!isLivekitConfigured()) {
      return res.status(500).json({ error: "LiveKit credentials are not configured" });
    }

    const body = req.body ?? {};

    // ── Extract caller number ─────────────────────────────────────────────────
    // This endpoint is designed to be called by a LiveKit SIP dispatch rule.
    // LiveKit's dispatch webhook POSTs { call_id, from, to } on incoming SIP.
    // The caller number lives in body.from (E.164 format from LiveKit).
    const callerNumber: string = String(
      body["from"] ?? body["caller_id"] ?? body["From"] ??
      body["caller"] ?? body["CallerNumber"] ?? "unknown"
    ).replace(/\s/g, "").slice(0, 30);

    const roomName = `inbound-${String(callerNumber).replace(/\+/g, "")}-${Date.now()}`;
    const participantIdentity = `sip-${String(callerNumber).replace(/[^a-zA-Z0-9]/g, "")}-${Date.now()}`;
    const participantName = `Caller ${callerNumber}`;

    req.log.info(
      { agentId, callerNumber, roomName },
      "Inbound call webhook received",
    );

    // ── Build agent metadata ──────────────────────────────────────────────────
    // The worker reads mode:"inbound" and defaults wait_for_user_first to true
    // unless the agent has explicitly configured it otherwise. Greeting behavior
    // is also adjusted per-mode in the worker.
    const metadata = buildAgentMetadata(agent, {
      phone_number: callerNumber,
      mode: "inbound",
    });

    // ── Create LiveKit room ───────────────────────────────────────────────────
    // Pre-create the room with agent metadata so the worker receives its full
    // configuration before any participant joins. LiveKit will bridge the
    // inbound SIP caller into this room after we return its name below.
    await getRoomService().createRoom({
      name: roomName,
      metadata,
      emptyTimeout: 60 * 5,  // 5 min — clean up if nobody shows up
    });

    // ── Record the call ───────────────────────────────────────────────────────
    await createCall({
      agent_id: agent.id,
      agent_name: agent.name,
      phone_number: callerNumber,
      room_name: roomName,
      started_at: new Date().toISOString(),
      status: "ringing",
      direction: "inbound",
    });

    // ── Respond to LiveKit SIP dispatch rule ──────────────────────────────────
    // LiveKit calls this webhook when an inbound SIP call arrives on the trunk.
    // Responding with { room_name, participant_identity } tells LiveKit which
    // pre-created room to bridge the caller into, where the worker is waiting.
    return res.json({
      room_name: roomName,
      participant_identity: participantIdentity,
      participant_name: participantName,
    });

  } catch (error: any) {
    req.log.error({ err: error }, "Error handling inbound webhook");
    return res.status(500).json({ error: error?.message || "Internal Server Error" });
  }
});

export default router;
