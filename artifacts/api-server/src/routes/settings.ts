import { Router, type IRouter, type RequestHandler } from "express";
import { getSettings, updateSettings, type GlobalSettings } from "../lib/db";

const router: IRouter = Router();

function redactSettings(s: GlobalSettings): Record<string, unknown> {
  return {
    elevenlabs_api_key: s.elevenlabs_api_key ? "***" : null,
    cartesia_api_key: s.cartesia_api_key ? "***" : null,
  };
}

const getOne: RequestHandler = async (_req, res) => {
  const s = await getSettings();
  res.json({ settings: redactSettings(s) });
};

const patch: RequestHandler = async (req, res) => {
  const { elevenlabs_api_key, cartesia_api_key } = (req.body ?? {}) as {
    elevenlabs_api_key?: string | null;
    cartesia_api_key?: string | null;
  };
  const patch: Partial<GlobalSettings> = {};
  if (elevenlabs_api_key !== undefined) {
    const trimmed = typeof elevenlabs_api_key === "string" ? elevenlabs_api_key.trim() : "";
    if (elevenlabs_api_key === null || elevenlabs_api_key === "") {
      patch.elevenlabs_api_key = undefined;
    } else if (trimmed.length >= 10 && trimmed.length <= 300) {
      patch.elevenlabs_api_key = trimmed;
    } else {
      res.status(400).json({ error: "elevenlabs_api_key looks invalid" });
      return;
    }
  }
  if (cartesia_api_key !== undefined) {
    const trimmed = typeof cartesia_api_key === "string" ? cartesia_api_key.trim() : "";
    if (cartesia_api_key === null || cartesia_api_key === "") {
      patch.cartesia_api_key = undefined;
    } else if (trimmed.length >= 10 && trimmed.length <= 300) {
      patch.cartesia_api_key = trimmed;
    } else {
      res.status(400).json({ error: "cartesia_api_key looks invalid" });
      return;
    }
  }
  const updated = await updateSettings(patch);
  res.json({ settings: redactSettings(updated) });
};

router.get("/settings", getOne);
router.patch("/settings", patch);

export default router;
