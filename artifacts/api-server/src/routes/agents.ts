import { Router, type IRouter, type RequestHandler } from "express";
import {
  createAgent,
  deleteAgent,
  getAgent,
  listAgents,
  updateAgent,
} from "../lib/db";
import { LANGUAGES, VOICES } from "../lib/voices";
import { PROMPT_TEMPLATES } from "../lib/prompt-templates";

const router: IRouter = Router();

const list: RequestHandler = async (_req, res) => {
  const agents = await listAgents();
  res.json({ agents });
};

const getOne: RequestHandler = async (req, res) => {
  const a = await getAgent(String(req.params["id"]));
  if (!a) {
    res.status(404).json({ error: "Agent not found" });
    return;
  }
  res.json({ agent: a });
};

const create: RequestHandler = async (req, res) => {
  const body = req.body ?? {};
  if (!body.name || typeof body.name !== "string") {
    res.status(400).json({ error: "name is required" });
    return;
  }
  const a = await createAgent({ ...sanitize(body), name: body.name.trim() });
  res.status(201).json({ agent: a });
};

function sanitize(body: any): any {
  const out: any = { ...body };
  if (out.tts_provider && !["deepgram", "elevenlabs", "cartesia"].includes(out.tts_provider)) {
    out.tts_provider = "deepgram";
  }
  if (out.interruption_sensitivity && !["low", "medium", "high"].includes(out.interruption_sensitivity)) {
    out.interruption_sensitivity = "medium";
  }
  if (typeof out.speaking_speed === "number") {
    out.speaking_speed = Math.max(0.8, Math.min(1.3, out.speaking_speed));
  }
  return out;
}

const patch: RequestHandler = async (req, res) => {
  const updated = await updateAgent(String(req.params["id"]), sanitize(req.body ?? {}));
  if (!updated) {
    res.status(404).json({ error: "Agent not found" });
    return;
  }
  res.json({ agent: updated });
};

const remove: RequestHandler = async (req, res) => {
  const ok = await deleteAgent(String(req.params["id"]));
  if (!ok) {
    res.status(404).json({ error: "Agent not found" });
    return;
  }
  res.json({ success: true });
};

// Catalog endpoints — let the frontend pull voices/languages/templates
// from a single source of truth that also drives the worker.
const catalog: RequestHandler = async (_req, res) => {
  const elevenlabsAvailable = Boolean(process.env["ELEVENLABS_API_KEY"]);
  const cartesiaAvailable = Boolean(process.env["CARTESIA_API_KEY"]);
  res.json({
    voices: VOICES,
    languages: LANGUAGES,
    templates: PROMPT_TEMPLATES,
    providers: {
      deepgram: { available: true, label: "Deepgram Aura (free)" },
      elevenlabs: {
        available: elevenlabsAvailable,
        label: "ElevenLabs (premium, multilingual)",
      },
      cartesia: {
        available: cartesiaAvailable,
        label: "Cartesia Sonic (premium, multilingual)",
      },
    },
  });
};

router.get("/agents", list);
router.get("/agents/catalog", catalog);
router.get("/agents/:id", getOne);
router.post("/agents", create);
router.patch("/agents/:id", patch);
router.delete("/agents/:id", remove);

export default router;
