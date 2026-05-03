import { Router, type IRouter } from "express";
import {
  getRoomService,
  getSipClient,
  isLivekitConfigured,
} from "../lib/livekit";
import { buildAgentMetadata, createCall, getAgent, listAgents } from "../lib/db";

const router: IRouter = Router();

router.post("/dispatch", async (req, res) => {
  try {
    const { phoneNumber, prompt, agentId } = req.body ?? {};

    if (!phoneNumber) {
      return res.status(400).json({ error: "Phone number is required" });
    }

    if (!isLivekitConfigured()) {
      return res
        .status(500)
        .json({ error: "LiveKit credentials are not configured" });
    }

    const trunkId = process.env["VOBIZ_SIP_TRUNK_ID"];
    if (!trunkId) {
      req.log.error("VOBIZ_SIP_TRUNK_ID is missing in env");
      return res.status(500).json({ error: "SIP Trunk not configured" });
    }

    let agent = agentId ? await getAgent(agentId) : null;
    if (!agent) {
      const all = await listAgents();
      agent = all[0] ?? null;
    }
    if (!agent) {
      return res
        .status(400)
        .json({ error: "No agents configured. Create one in Agents." });
    }

    const roomName = `call-${String(phoneNumber).replace(/\+/g, "")}-${Math.floor(
      Math.random() * 10000,
    )}`;
    const participantIdentity = `sip_${phoneNumber}`;

    req.log.info(
      { phoneNumber, roomName, trunkId, agentId: agent.id },
      "Dispatching call",
    );

    const metadata = buildAgentMetadata(agent, {
      phone_number: String(phoneNumber),
      per_call_prompt: prompt,
    });

    await getRoomService().createRoom({
      name: roomName,
      metadata,
      emptyTimeout: 60 * 5,
    });

    await createCall({
      agent_id: agent.id,
      agent_name: agent.name,
      phone_number: String(phoneNumber),
      room_name: roomName,
      started_at: new Date().toISOString(),
      status: "ringing",
    });

    // @ts-ignore - createSipParticipant signature
    const info = await getSipClient().createSipParticipant(
      trunkId,
      phoneNumber,
      roomName,
      {
        participantIdentity,
        participantName: "Customer",
      },
    );

    return res.json({
      success: true,
      roomName,
      dispatchId: info.sipCallId,
      agentId: agent.id,
    });
  } catch (error: any) {
    req.log.error({ err: error }, "Error dispatching call");
    return res
      .status(500)
      .json({ error: error?.message || "Internal Server Error" });
  }
});

export default router;
