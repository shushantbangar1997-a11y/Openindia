import { Router, type IRouter, type RequestHandler } from "express";
import { getSettings } from "../lib/db";
import { type Voice } from "../lib/voices";

const router: IRouter = Router();

type ElevenLabsVoice = {
  voice_id: string;
  name: string;
  category?: string;
  labels?: {
    accent?: string;
    gender?: string;
    age?: string;
    description?: string;
    use_case?: string;
  };
};

function formatLabel(v: ElevenLabsVoice): string {
  const parts: string[] = [];
  const accent = v.labels?.accent;
  const gender = v.labels?.gender;
  if (accent) parts.push(accent.charAt(0).toUpperCase() + accent.slice(1));
  if (gender) parts.push(gender.charAt(0).toUpperCase() + gender.slice(1));
  if (parts.length > 0) return `${v.name} (${parts.join(", ")})`;
  if (v.category === "cloned") return `${v.name} (Cloned)`;
  return v.name;
}

function toVoice(v: ElevenLabsVoice): Voice {
  const gender = v.labels?.gender?.toLowerCase();
  return {
    id: v.voice_id,
    label: formatLabel(v),
    provider: "elevenlabs",
    language: "*",
    gender: gender === "female" ? "female" : gender === "male" ? "male" : "neutral",
    premium: true,
  };
}

const listVoices: RequestHandler = async (req, res) => {
  const agentKeyHeader = req.header("x-agent-elevenlabs-key");
  const settings = await getSettings();
  const key = agentKeyHeader || settings.elevenlabs_api_key || process.env["ELEVENLABS_API_KEY"];
  if (!key) {
    res.status(401).json({ error: "No ElevenLabs API key configured" });
    return;
  }
  try {
    const r = await fetch("https://api.elevenlabs.io/v1/voices?show_legacy=false", {
      headers: { "xi-api-key": key },
    });
    if (!r.ok) {
      const body = await r.text().catch(() => "");
      res.status(r.status).json({ error: `ElevenLabs API error: ${r.status}`, detail: body });
      return;
    }
    const data = (await r.json()) as { voices: ElevenLabsVoice[] };
    const voices: Voice[] = (data.voices ?? []).map(toVoice);
    res.json({ voices });
  } catch (e: any) {
    res.status(500).json({ error: e?.message || "Failed to fetch ElevenLabs voices" });
  }
};

router.get("/elevenlabs/voices", listVoices);

export default router;
