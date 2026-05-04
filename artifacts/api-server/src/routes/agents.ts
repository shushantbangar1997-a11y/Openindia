import { Router, type IRouter, type RequestHandler } from "express";
import {
  createAgent,
  deleteAgent,
  getAgent,
  listAgents,
  redactAgent,
  updateAgent,
  getSettings,
  type Agent,
} from "../lib/db";
import { LANGUAGES, VOICES } from "../lib/voices";
import { PROMPT_TEMPLATES } from "../lib/prompt-templates";
import { generateInboundToken } from "../lib/livekit";

function withInboundToken(a: Agent) {
  return { ...redactAgent(a), inbound_token: generateInboundToken(a.id) };
}

const router: IRouter = Router();

const list: RequestHandler = async (_req, res) => {
  const agents = await listAgents();
  res.json({ agents: agents.map(withInboundToken) });
};

const getOne: RequestHandler = async (req, res) => {
  const a = await getAgent(String(req.params["id"]));
  if (!a) {
    res.status(404).json({ error: "Agent not found" });
    return;
  }
  res.json({ agent: withInboundToken(a) });
};

const create: RequestHandler = async (req, res) => {
  const body = req.body ?? {};
  if (!body.name || typeof body.name !== "string") {
    res.status(400).json({ error: "name is required" });
    return;
  }
  const a = await createAgent({ ...sanitize(body), name: body.name.trim() });
  res.status(201).json({ agent: withInboundToken(a) });
};

// One-time provider-key paste flow. Lets users paste a key in the editor
// without juggling Replit Secrets. Stored on the agent record (file store
// is local to the user's environment) and redacted in all GET responses.
const setProviderKey: RequestHandler = async (req, res) => {
  const id = String(req.params["id"]);
  const { provider, api_key } = (req.body ?? {}) as {
    provider?: string;
    api_key?: string;
  };
  if (!provider || !["elevenlabs", "cartesia"].includes(provider)) {
    res.status(400).json({ error: "provider must be 'elevenlabs' or 'cartesia'" });
    return;
  }
  const key = String(api_key ?? "").trim();
  if (!key || key.length < 10 || key.length > 200) {
    res.status(400).json({ error: "api_key looks invalid" });
    return;
  }
  const existing = await getAgent(id);
  if (!existing) {
    res.status(404).json({ error: "Agent not found" });
    return;
  }
  const next = { ...(existing.provider_api_keys ?? {}), [provider]: key };
  const updated = await updateAgent(id, { provider_api_keys: next });
  res.json({ agent: updated ? withInboundToken(updated) : null });
};

function sanitize(body: any): any {
  const out: any = { ...body };
  // Never let the generic update route write provider keys — must use the
  // dedicated endpoint so we can validate them.
  if ("provider_api_keys" in out) delete out.provider_api_keys;
  // inbound_token is a computed field (HMAC) — never stored in DB.
  if ("inbound_token" in out) delete out.inbound_token;
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
  if (out.inbound_enabled !== undefined) {
    out.inbound_enabled = Boolean(out.inbound_enabled);
  }
  if (out.inbound_auto_greet !== undefined) {
    out.inbound_auto_greet = Boolean(out.inbound_auto_greet);
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

async function elevenSample(voiceId: string, text: string, overrideKey?: string): Promise<Buffer | null> {
  const key = overrideKey || process.env["ELEVENLABS_API_KEY"];
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

async function cartesiaSample(voiceId: string, text: string, language: string, overrideKey?: string): Promise<Buffer | null> {
  const key = overrideKey || process.env["CARTESIA_API_KEY"];
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
  const { voice_id, text, provider, language, agent_id } = (req.body ?? {}) as {
    voice_id?: string;
    text?: string;
    provider?: string;
    language?: string;
    agent_id?: string;
  };
  const sampleText = (text || SAMPLE_TEXT_DEFAULT).slice(0, 200);
  if (!voice_id) {
    res.status(400).json({ error: "voice_id required" });
    return;
  }
  // Per-agent stored keys take precedence over global env vars so previews
  // reflect the *exact* provider/voice the user just pasted a key for.
  const globalSettings = await getSettings();
  let elevenOverride: string | undefined = globalSettings.elevenlabs_api_key;
  let cartesiaOverride: string | undefined = globalSettings.cartesia_api_key;
  if (agent_id) {
    const a = await getAgent(String(agent_id));
    if (a?.provider_api_keys?.elevenlabs) elevenOverride = a.provider_api_keys.elevenlabs;
    if (a?.provider_api_keys?.cartesia) cartesiaOverride = a.provider_api_keys.cartesia;
  }
  let buf: Buffer | null = null;
  try {
    if (provider === "elevenlabs") {
      buf = await elevenSample(voice_id, sampleText, elevenOverride);
    } else if (provider === "cartesia") {
      buf = await cartesiaSample(voice_id, sampleText, language || "en", cartesiaOverride);
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
  res.json({ agent: withInboundToken(updated) });
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
  const settings = await getSettings();
  const elevenlabsAvailable = Boolean(settings.elevenlabs_api_key || process.env["ELEVENLABS_API_KEY"]);
  const cartesiaAvailable = Boolean(settings.cartesia_api_key || process.env["CARTESIA_API_KEY"]);
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
router.post("/agents/:id/provider-key", setProviderKey);
router.delete("/agents/:id", remove);

// Internal-only: returns unredacted provider API keys for an agent.
// Defense-in-depth: requires BOTH a loopback source IP AND a shared secret
// header (INTERNAL_API_TOKEN) so a misconfigured proxy alone can't leak
// keys. The worker reads the same token at job start.
import { getInternalToken } from "../lib/internal-token";

// Ensure token is initialised and written to disk at startup time.
getInternalToken();

const internalKeys: RequestHandler = async (req, res) => {
  const remote = req.socket.remoteAddress ?? "";
  const isLoopback = ["127.0.0.1", "::1", "::ffff:127.0.0.1"].includes(remote);
  const token = req.header("x-internal-token") ?? "";
  if (!isLoopback || token !== getInternalToken()) {
    res.status(403).json({ error: "forbidden" });
    return;
  }
  const a = await getAgent(String(req.params["id"]));
  if (!a) {
    res.status(404).json({ error: "Agent not found" });
    return;
  }
  // Merge global settings keys as fallback for agent-level keys.
  const globalSettings = await getSettings();
  const merged = {
    elevenlabs: a.provider_api_keys?.elevenlabs || globalSettings.elevenlabs_api_key,
    cartesia: a.provider_api_keys?.cartesia || globalSettings.cartesia_api_key,
  };
  res.json({ provider_api_keys: merged });
};
router.get("/internal/agents/:id/keys", internalKeys);

export default router;
