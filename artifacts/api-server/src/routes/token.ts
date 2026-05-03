import { Router, type IRouter } from "express";
// @ts-ignore - livekit-server-sdk types
import { AccessToken } from "livekit-server-sdk";
import {
  getRoomService,
  isLivekitConfigured,
} from "../lib/livekit";
import { getAgent, createCall, newId } from "../lib/db";

const router: IRouter = Router();

// Mints a LiveKit access token for a browser tester to talk directly to an
// agent worker (no phone call). Creates a fresh room with the agent's
// metadata so the worker auto-joins and uses the right prompt/voice.
router.post("/agents/:id/test-token", async (req, res) => {
  try {
    if (!isLivekitConfigured()) {
      res
        .status(500)
        .json({ error: "LiveKit credentials are not configured" });
      return;
    }

    const agent = await getAgent(String(req.params["id"]));
    if (!agent) {
      res.status(404).json({ error: "Agent not found" });
      return;
    }

    const roomName = `test-${agent.id.slice(-6)}-${newId("r").slice(-6)}`;
    const identity = `tester-${newId("u").slice(-6)}`;

    const metadata = JSON.stringify({
      mode: "browser-test",
      agent_id: agent.id,
      agent_name: agent.name,
      user_prompt: agent.system_prompt,
      greeting: agent.greeting,
      voice_id: agent.voice_id,
      language: agent.language,
      wait_for_user_first: agent.wait_for_user_first,
    });

    await getRoomService().createRoom({
      name: roomName,
      metadata,
      emptyTimeout: 60 * 5,
    });

    // Log this as a call so transcripts show up too.
    await createCall({
      agent_id: agent.id,
      agent_name: agent.name,
      phone_number: "(browser test)",
      room_name: roomName,
      started_at: new Date().toISOString(),
      status: "ringing",
    });

    const at = new AccessToken(
      process.env["LIVEKIT_API_KEY"]!,
      process.env["LIVEKIT_API_SECRET"]!,
      { identity, ttl: 60 * 30 },
    );
    at.addGrant({
      room: roomName,
      roomJoin: true,
      canPublish: true,
      canSubscribe: true,
      canPublishData: true,
    });
    const token = await at.toJwt();

    res.json({
      token,
      url: process.env["LIVEKIT_URL"],
      roomName,
      identity,
    });
  } catch (e: any) {
    req.log.error({ err: e }, "Error minting test token");
    res.status(500).json({ error: e?.message || "Internal Server Error" });
  }
});

export default router;
