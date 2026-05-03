import { Router, type IRouter } from "express";
import {
  getRoomService,
  getSipClient,
  isLivekitConfigured,
} from "../lib/livekit";
import { buildAgentMetadata, createCall, getAgent, listAgents } from "../lib/db";

const router: IRouter = Router();

router.post("/queue", async (req, res) => {
  try {
    const { numbers, prompt, agentId } = req.body ?? {};

    if (!numbers || !Array.isArray(numbers) || numbers.length === 0) {
      return res
        .status(400)
        .json({ error: "List of phone numbers is required" });
    }

    if (!isLivekitConfigured()) {
      return res
        .status(500)
        .json({ error: "LiveKit credentials are not configured" });
    }

    const trunkId = process.env["VOBIZ_SIP_TRUNK_ID"];
    if (!trunkId) {
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

    const roomService = getRoomService();
    const sipClient = getSipClient();
    const results: Array<Record<string, unknown>> = [];

    for (const phoneNumber of numbers) {
      try {
        const roomName = `call-${String(phoneNumber).replace(/\+/g, "")}-${Math.floor(
          Math.random() * 10000,
        )}`;
        const participantIdentity = `sip_${phoneNumber}`;

        const metadata = buildAgentMetadata(agent, {
          phone_number: String(phoneNumber),
          per_call_prompt: prompt,
        });

        await roomService.createRoom({
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
        const info = await sipClient.createSipParticipant(
          trunkId,
          phoneNumber,
          roomName,
          {
            participantIdentity,
            participantName: "Customer",
          },
        );

        results.push({
          phoneNumber,
          status: "dispatched",
          id: info.sipCallId,
        });

        await new Promise((r) => setTimeout(r, 200));
      } catch (e: any) {
        req.log.error({ err: e, phoneNumber }, "Failed to dispatch number");
        results.push({
          phoneNumber,
          status: "failed",
          error: e?.message,
        });
      }
    }

    return res.json({
      success: true,
      message: `Processed ${numbers.length} numbers`,
      results,
      agentId: agent.id,
    });
  } catch (error: any) {
    req.log.error({ err: error }, "Queue error");
    return res
      .status(500)
      .json({ error: error?.message || "Internal Server Error" });
  }
});

export default router;
