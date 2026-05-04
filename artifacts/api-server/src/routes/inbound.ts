import { Router, type IRouter } from "express";
import {
  getRoomService,
  isLivekitConfigured,
} from "../lib/livekit";
import { buildAgentMetadata, createCall, getAgent } from "../lib/db";

const router: IRouter = Router();

/**
 * POST /inbound/:agentId
 *
 * Webhook endpoint for inbound SIP calls. Configure this URL in your SIP
 * provider's portal so calls to your DID are routed to this agent.
 *
 * Request body (sent by most SIP providers):
 *   { From, To, CallSid, ... }  (field names vary by provider)
 *
 * Creates a LiveKit room tagged with mode:"inbound" and records the call
 * with direction:"inbound". The LiveKit worker joins automatically.
 *
 * Returns JSON so the caller can confirm routing.
 */
router.post("/inbound/:agentId", async (req, res) => {
  try {
    const { agentId } = req.params as { agentId: string };

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

    // Extract caller phone number from common SIP provider field names.
    const body = req.body ?? {};
    const callerNumber: string =
      String(body["From"] ?? body["from"] ?? body["caller"] ?? body["CallerNumber"] ?? "unknown")
        .replace(/\s/g, "")
        .slice(0, 30);

    const roomName = `inbound-${String(callerNumber).replace(/\+/g, "")}-${Date.now()}`;

    req.log.info(
      { agentId, callerNumber, roomName },
      "Inbound call webhook received",
    );

    const metadata = buildAgentMetadata(agent, {
      phone_number: callerNumber,
      mode: "inbound",
    });

    await getRoomService().createRoom({
      name: roomName,
      metadata,
      emptyTimeout: 60 * 5,
    });

    await createCall({
      agent_id: agent.id,
      agent_name: agent.name,
      phone_number: callerNumber,
      room_name: roomName,
      started_at: new Date().toISOString(),
      status: "ringing",
      direction: "inbound",
    });

    return res.json({
      success: true,
      roomName,
      agentId: agent.id,
    });
  } catch (error: any) {
    req.log.error({ err: error }, "Error handling inbound webhook");
    return res.status(500).json({ error: error?.message || "Internal Server Error" });
  }
});

export default router;
