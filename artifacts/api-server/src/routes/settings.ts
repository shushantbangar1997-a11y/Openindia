import { Router, type IRouter, type RequestHandler } from "express";
import { getSettings, updateSettings, type GlobalSettings } from "../lib/db";

const router: IRouter = Router();

function redactSettings(s: GlobalSettings): Record<string, unknown> {
  return {
    elevenlabs_api_key: s.elevenlabs_api_key ? "***" : null,
    cartesia_api_key: s.cartesia_api_key ? "***" : null,
    gemini_api_key: s.gemini_api_key ? "***" : null,
    llm_provider: s.llm_provider ?? "groq",
  };
}

function sanitizeKey(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

const getOne: RequestHandler = async (_req, res) => {
  const s = await getSettings();
  res.json({ settings: redactSettings(s) });
};

const patch: RequestHandler = async (req, res) => {
  const body = (req.body ?? {}) as {
    elevenlabs_api_key?: string | null;
    cartesia_api_key?: string | null;
    gemini_api_key?: string | null;
    llm_provider?: string | null;
  };
  const p: Partial<GlobalSettings> = {};

  for (const field of ["elevenlabs_api_key", "cartesia_api_key", "gemini_api_key"] as const) {
    const raw = body[field];
    if (raw === undefined) continue;
    const trimmed = sanitizeKey(raw);
    if (raw === null || raw === "") {
      p[field] = undefined;
    } else if (trimmed.length >= 10 && trimmed.length <= 300) {
      p[field] = trimmed;
    } else {
      res.status(400).json({ error: `${field} looks invalid` });
      return;
    }
  }

  if (body.llm_provider !== undefined) {
    if (body.llm_provider === null || body.llm_provider === "groq") {
      p.llm_provider = "groq";
    } else if (body.llm_provider === "gemini") {
      p.llm_provider = "gemini";
    } else {
      res.status(400).json({ error: "llm_provider must be 'groq' or 'gemini'" });
      return;
    }
  }

  const updated = await updateSettings(p);
  res.json({ settings: redactSettings(updated) });
};

router.get("/settings", getOne);
router.patch("/settings", patch);

export default router;
