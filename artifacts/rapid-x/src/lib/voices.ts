// Mirror of artifacts/api-server/src/lib/voices.ts. The frontend pulls the
// authoritative catalog from /api/agents/catalog at runtime; these constants
// are only the static fallback used before the catalog loads.

export type TtsProvider = "deepgram" | "elevenlabs" | "cartesia";

export type Voice = {
  id: string;
  label: string;
  provider: TtsProvider;
  language: string;
  gender: "female" | "male" | "neutral";
  premium: boolean;
};

export type Language = {
  id: string;
  label: string;
  stt_model: string;
  stt_language: string;
};

export type PromptTemplate = {
  id: string;
  label: string;
  description: string;
  system_prompt: string;
  greeting: string;
};

export type Catalog = {
  voices: Voice[];
  languages: Language[];
  templates: PromptTemplate[];
  providers: Record<TtsProvider, { available: boolean; label: string }>;
};

export const DEFAULT_VOICE_ID = "aura-2-thalia-en";
export const DEFAULT_LANGUAGE_ID = "en-US";

// Minimal fallback so the page renders before the catalog fetch resolves.
export const FALLBACK_CATALOG: Catalog = {
  voices: [
    {
      id: DEFAULT_VOICE_ID,
      label: "Thalia — Warm Female (US)",
      provider: "deepgram",
      language: "en-US",
      gender: "female",
      premium: false,
    },
  ],
  languages: [
    { id: "en-US", label: "English (US)", stt_model: "nova-3", stt_language: "en-US" },
  ],
  templates: [
    { id: "blank", label: "Blank", description: "Start from scratch.", system_prompt: "", greeting: "" },
  ],
  providers: {
    deepgram: { available: true, label: "Deepgram Aura (free)" },
    elevenlabs: { available: false, label: "ElevenLabs (premium)" },
    cartesia: { available: false, label: "Cartesia Sonic (premium)" },
  },
};

export function voicesFor(catalog: Catalog, provider: TtsProvider, language: string): Voice[] {
  return catalog.voices.filter(
    (v) =>
      v.provider === provider &&
      (v.language === language ||
        v.language === "*" ||
        (v.language === "en-US" && language.startsWith("en"))),
  );
}
