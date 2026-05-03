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
  if (out.custom_fillers !== undefined) {
    if (Array.isArray(out.custom_fillers)) {
      out.custom_fillers = out.custom_fillers
        .map((s: any) => String(s).trim())
        .filter((s: string) => s.length > 0 && s.length < 60)
        .slice(0, 20);
    } else {
      out.custom_fillers = [];
    }
  }
  if (out.auto_detect_language !== undefined) {
    out.auto_detect_language = Boolean(out.auto_detect_language);
  }
  return out;
}

// Voice preview — provider-aware. Routes to ElevenLabs / Cartesia / Deepgram
// based on the requested provider, so what the user hears in the editor is
// the actual voice their calls will use. Falls back to Deepgram if the
// premium provider's key is missing.
const SAMPLE_TEXT_DEFAULT =
  "Hi there — this is a quick voice sample. I can sound like this on every call.";

async function dgSample(voiceId: string, text: string): Promise<Buffer | null> {
  const key = process.env["DEEPGRAM_API_KEY"];
  if (!key) return null;
  const v = /^aura(-2)?-[a-z]+-en$/.test(voiceId) ? voiceId : "aura-2-thalia-en";
  const r = await fetch(`https://api.deepgram.com/v1/speak?model=${encodeURIComponent(v)}`, {
    method: "POST",
    headers: { "Authorization": `Token ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ text }),
  });
  if (!r.ok) return null;
  return Buffer.from(await r.arrayBuffer());
}

async function elevenSample(voiceId: string, text: string): Promise<Buffer | null> {
  const key = process.env["ELEVENLABS_API_KEY"];
  if (!key) return null;
  // Only allow alphanumeric voice IDs.
  if (!/^[A-Za-z0-9]{15,40}$/.test(voiceId)) return null;
  const r = await fetch(
    `https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(voiceId)}?output_format=mp3_44100_128`,
    {
      method: "POST",
      headers: { "xi-api-key": key, "Content-Type": "application/json", Accept: "audio/mpeg" },
      body: JSON.stringify({ text, model_id: "eleven_multilingual_v2" }),
    },
  );
  if (!r.ok) return null;
  return Buffer.from(await r.arrayBuffer());
}

async function cartesiaSample(voiceId: string, text: string, language: string): Promise<Buffer | null> {
  const key = process.env["CARTESIA_API_KEY"];
  if (!key) return null;
  // UUID-ish voice id.
  if (!/^[a-f0-9-]{20,40}$/i.test(voiceId)) return null;
  const lang = (language || "en").split("-")[0].toLowerCase();
  const r = await fetch("https://api.cartesia.ai/tts/bytes", {
    method: "POST",
    headers: {
      "X-API-Key": key,
      "Cartesia-Version": "2024-06-10",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model_id: "sonic-2",
      transcript: text,
      voice: { mode: "id", id: voiceId },
      output_format: { container: "mp3", encoding: "mp3", sample_rate: 44100 },
      language: lang,
    }),
  });
  if (!r.ok) return null;
  return Buffer.from(await r.arrayBuffer());
}

const sampleVoice: RequestHandler = async (req, res) => {
  const { voice_id, text, provider, language } = (req.body ?? {}) as {
    voice_id?: string;
    text?: string;
    provider?: string;
    language?: string;
  };
  const sampleText = (text || SAMPLE_TEXT_DEFAULT).slice(0, 200);
  if (!voice_id) {
    res.status(400).json({ error: "voice_id required" });
    return;
  }
  let buf: Buffer | null = null;
  try {
    if (provider === "elevenlabs") {
      buf = await elevenSample(voice_id, sampleText);
    } else if (provider === "cartesia") {
      buf = await cartesiaSample(voice_id, sampleText, language || "en");
    } else {
      buf = await dgSample(voice_id, sampleText);
    }
    // Fallback to Deepgram so the user always hears *something* when the
    // premium key isn't configured (with a default English voice).
    if (!buf) {
      buf = await dgSample("aura-2-thalia-en", sampleText);
    }
    if (!buf) {
      res.status(500).json({ error: "Could not generate sample" });
      return;
    }
    res.set("Content-Type", "audio/mpeg");
    res.set("Cache-Control", "public, max-age=3600");
    res.send(buf);
  } catch (e: any) {
    res.status(500).json({ error: e?.message || "sample failed" });
  }
};

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
router.post("/agents/sample-voice", sampleVoice);
router.get("/agents/:id", getOne);
router.post("/agents", create);
router.patch("/agents/:id", patch);
router.delete("/agents/:id", remove);

export default router;
