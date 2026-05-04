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
 * Dual-mode inbound webhook endpoint:
 *
 * ── Mode A: LiveKit SIP Dispatch Webhook ─────────────────────────────────────
 * When a LiveKit SIP dispatch rule (type: "webhook") is configured, LiveKit
 * POSTs here when an inbound SIP call arrives. Body contains:
 *   { call_id, from, to, trunk_id }  (LiveKit SIP dispatch format)
 * We respond with:
 *   { room_name, participant_identity, participant_name }
 * LiveKit then creates/joins the room and bridges the caller's audio in
 * automatically. No createSipParticipant call is needed on our side.
 *
 * ── Mode B: Generic SIP provider webhook ─────────────────────────────────────
 * For providers that POST to a custom URL (Twilio, Vonage, etc.) the body
 * uses their field names:
 *   { From, To, CallSid, ... }
 * We create the room so the LiveKit worker joins, then respond with JSON
 * acknowledging the call. Configure your SIP trunk's dispatch rule to route
 * the inbound SIP leg to the LiveKit SIP gateway separately.
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
    // Pre-create the room with our metadata so the worker gets its instructions
    // before any participant joins. For LiveKit dispatch, LiveKit will join the
    // pre-existing room. For generic SIP, the worker joins when dispatched.
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
