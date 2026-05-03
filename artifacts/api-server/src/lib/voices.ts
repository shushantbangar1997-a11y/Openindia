// Canonical voice + language catalog. Shared shape with the frontend
// (artifacts/rapid-x/src/lib/voices.ts is a mirror) and the Python worker
// (services/rapid-x-agent/voices.py mirrors the same provider/voice IDs).

export type TtsProvider = "deepgram" | "elevenlabs" | "cartesia";

export type Voice = {
  id: string;
  label: string;
  provider: TtsProvider;
  language: string; // BCP-47-ish; "en-US", "es", "hi", etc.
  gender: "female" | "male" | "neutral";
  premium: boolean; // true → requires user-supplied API key
};

export type Language = {
  id: string;
  label: string;
  // Deepgram STT model + language code that supports this language.
  // "multi" model handles many languages; falls back to nova-2 for English.
  stt_model: string;
  stt_language: string;
};

export const LANGUAGES: Language[] = [
  { id: "en-US", label: "English (US)", stt_model: "nova-3", stt_language: "en-US" },
  { id: "en-GB", label: "English (UK)", stt_model: "nova-2", stt_language: "en-GB" },
  { id: "en-IN", label: "English (India)", stt_model: "nova-2", stt_language: "en-IN" },
  { id: "en-AU", label: "English (Australia)", stt_model: "nova-2", stt_language: "en-AU" },
  { id: "es", label: "Spanish", stt_model: "nova-2", stt_language: "es" },
  { id: "fr", label: "French", stt_model: "nova-2", stt_language: "fr" },
  { id: "de", label: "German", stt_model: "nova-2", stt_language: "de" },
  { id: "it", label: "Italian", stt_model: "nova-2", stt_language: "it" },
  { id: "pt-BR", label: "Portuguese (Brazil)", stt_model: "nova-2", stt_language: "pt-BR" },
  { id: "nl", label: "Dutch", stt_model: "nova-2", stt_language: "nl" },
  { id: "pl", label: "Polish", stt_model: "nova-2", stt_language: "pl" },
  { id: "ru", label: "Russian", stt_model: "nova-2", stt_language: "ru" },
  { id: "tr", label: "Turkish", stt_model: "nova-2", stt_language: "tr" },
  { id: "hi", label: "Hindi", stt_model: "nova-2", stt_language: "hi" },
  { id: "ja", label: "Japanese", stt_model: "nova-2", stt_language: "ja" },
  { id: "zh", label: "Mandarin Chinese", stt_model: "nova-2", stt_language: "zh" },
  { id: "ko", label: "Korean", stt_model: "nova-2", stt_language: "ko" },
  { id: "ar", label: "Arabic", stt_model: "nova-2", stt_language: "multi" },
  { id: "id", label: "Indonesian", stt_model: "nova-2", stt_language: "id" },
  { id: "vi", label: "Vietnamese", stt_model: "nova-2", stt_language: "vi" },
];

// Curated voice catalog. Deepgram = free (uses your existing key).
// ElevenLabs / Cartesia = premium, gated by API key.
export const VOICES: Voice[] = [
  // ── Deepgram Aura-2 (best quality on Deepgram, English) ──
  { id: "aura-2-thalia-en", label: "Thalia — Warm Female (US)", provider: "deepgram", language: "en-US", gender: "female", premium: false },
  { id: "aura-2-andromeda-en", label: "Andromeda — Friendly Female (US)", provider: "deepgram", language: "en-US", gender: "female", premium: false },
  { id: "aura-2-luna-en", label: "Luna — Soft Female (US)", provider: "deepgram", language: "en-US", gender: "female", premium: false },
  { id: "aura-2-helena-en", label: "Helena — Confident Female (US)", provider: "deepgram", language: "en-US", gender: "female", premium: false },
  { id: "aura-2-apollo-en", label: "Apollo — Smooth Male (US)", provider: "deepgram", language: "en-US", gender: "male", premium: false },
  { id: "aura-2-orion-en", label: "Orion — Mature Male (US)", provider: "deepgram", language: "en-US", gender: "male", premium: false },
  { id: "aura-2-arcas-en", label: "Arcas — Casual Male (US)", provider: "deepgram", language: "en-US", gender: "male", premium: false },
  { id: "aura-2-athena-en", label: "Athena — Calm Female (UK)", provider: "deepgram", language: "en-GB", gender: "female", premium: false },
  { id: "aura-2-helios-en", label: "Helios — Authoritative Male (UK)", provider: "deepgram", language: "en-GB", gender: "male", premium: false },
  // Aura v1 fallbacks
  { id: "aura-asteria-en", label: "Asteria — Bright Female (US)", provider: "deepgram", language: "en-US", gender: "female", premium: false },
  { id: "aura-angus-en", label: "Angus — Warm Male (Irish)", provider: "deepgram", language: "en-GB", gender: "male", premium: false },

  // ── ElevenLabs (Multilingual v2 — 29 languages, premium quality) ──
  // Voice IDs are real ElevenLabs IDs; the model defaults to eleven_multilingual_v2.
  { id: "EXAVITQu4vr4xnSDxMaL", label: "Sarah — Soft Female (Multilingual)", provider: "elevenlabs", language: "*", gender: "female", premium: true },
  { id: "21m00Tcm4TlvDq8ikWAM", label: "Rachel — Calm Female (Multilingual)", provider: "elevenlabs", language: "*", gender: "female", premium: true },
  { id: "AZnzlk1XvdvUeBnXmlld", label: "Domi — Strong Female (Multilingual)", provider: "elevenlabs", language: "*", gender: "female", premium: true },
  { id: "MF3mGyEYCl7XYWbV9V6O", label: "Elli — Young Female (Multilingual)", provider: "elevenlabs", language: "*", gender: "female", premium: true },
  { id: "ThT5KcBeYPX3keUQqHPh", label: "Dorothy — British Female (Multilingual)", provider: "elevenlabs", language: "*", gender: "female", premium: true },
  { id: "XrExE9yKIg1WjnnlVkGX", label: "Matilda — Friendly Female (Multilingual)", provider: "elevenlabs", language: "*", gender: "female", premium: true },
  { id: "pNInz6obpgDQGcFmaJgB", label: "Adam — Deep Male (Multilingual)", provider: "elevenlabs", language: "*", gender: "male", premium: true },
  { id: "ErXwobaYiN019PkySvjV", label: "Antoni — Well-rounded Male (Multilingual)", provider: "elevenlabs", language: "*", gender: "male", premium: true },
  { id: "VR6AewLTigWG4xSOukaG", label: "Arnold — Crisp Male (Multilingual)", provider: "elevenlabs", language: "*", gender: "male", premium: true },
  { id: "TxGEqnHWrfWFTfGW9XjX", label: "Josh — Young Male (Multilingual)", provider: "elevenlabs", language: "*", gender: "male", premium: true },
  { id: "yoZ06aMxZJJ28mfd3POQ", label: "Sam — Raspy Male (Multilingual)", provider: "elevenlabs", language: "*", gender: "male", premium: true },
  { id: "ODq5zmih8GrVes37Dizd", label: "Patrick — Mature Male (Multilingual)", provider: "elevenlabs", language: "*", gender: "male", premium: true },

  // ── Cartesia Sonic-2 (low-latency multilingual) ──
  { id: "a0e99841-438c-4a64-b679-ae501e7d6091", label: "Barbershop Man — Friendly Male", provider: "cartesia", language: "*", gender: "male", premium: true },
  { id: "79a125e8-cd45-4c13-8a67-188112f4dd22", label: "British Lady — Refined Female", provider: "cartesia", language: "*", gender: "female", premium: true },
  { id: "a167e0f3-df7e-4d52-a9c3-f949145efdab", label: "Customer Support Man — Calm Male", provider: "cartesia", language: "*", gender: "male", premium: true },
  { id: "248be419-c632-4f23-adf1-5324ed7dbf1d", label: "Customer Support Lady — Warm Female", provider: "cartesia", language: "*", gender: "female", premium: true },
  { id: "421b3369-f63f-4b03-8980-37a44df1d4e8", label: "Friendly Receptionist — Polished Female", provider: "cartesia", language: "*", gender: "female", premium: true },
  { id: "729651dc-c6c3-4ee5-97fa-350da1f88600", label: "Newsman — Authoritative Male", provider: "cartesia", language: "*", gender: "male", premium: true },
];

// Voices marked language: "*" support all 29 ElevenLabs / 15 Cartesia languages.
// They render in whatever language the agent is configured for.
export function voicesFor(provider: TtsProvider, language: string): Voice[] {
  return VOICES.filter(
    (v) =>
      v.provider === provider &&
      (v.language === language || v.language === "*" || (v.language === "en-US" && language.startsWith("en"))),
  );
}

export function getVoice(id: string): Voice | undefined {
  return VOICES.find((v) => v.id === id);
}

export function getLanguage(id: string): Language | undefined {
  return LANGUAGES.find((l) => l.id === id);
}

export const DEFAULT_VOICE_ID = "aura-2-thalia-en";
export const DEFAULT_LANGUAGE_ID = "en-US";
