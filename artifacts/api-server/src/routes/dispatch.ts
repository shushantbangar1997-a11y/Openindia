import { Router, type IRouter } from "express";
import { getSipClient, isLivekitConfigured } from "../lib/livekit";

const router: IRouter = Router();

router.post("/dispatch", async (req, res) => {
  try {
    const { phoneNumber, prompt, modelProvider, voice } = req.body ?? {};

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

    const roomName = `call-${String(phoneNumber).replace(/\+/g, "")}-${Math.floor(
      Math.random() * 10000,
    )}`;
    const participantIdentity = `sip_${phoneNumber}`;

    req.log.info(
      { phoneNumber, roomName, trunkId },
      "Dispatching call",
    );

    const metadata = JSON.stringify({
      phone_number: phoneNumber,
      user_prompt: prompt || "",
      model_provider: modelProvider || "openai",
      voice_id: voice || "alloy",
    });

    // @ts-ignore - createSipParticipant signature
    const info = await getSipClient().createSipParticipant(
      trunkId,
      phoneNumber,
      roomName,
      {
        participantIdentity,
        participantName: "Customer",
        roomMetadata: metadata,
      },
    );

    return res.json({
      success: true,
      roomName,
      dispatchId: info.sipCallId,
    });
  } catch (error: any) {
    req.log.error({ err: error }, "Error dispatching call");
    return res
      .status(500)
      .json({ error: error?.message || "Internal Server Error" });
  }
});

export default router;
