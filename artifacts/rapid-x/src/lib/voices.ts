export type VoiceOption = { id: string; label: string };

// Deepgram Aura voices — all on Deepgram's free tier.
export const VOICES: VoiceOption[] = [
  { id: "aura-asteria-en", label: "Asteria — Female (US)" },
  { id: "aura-luna-en", label: "Luna — Female (US)" },
  { id: "aura-stella-en", label: "Stella — Female (US)" },
  { id: "aura-athena-en", label: "Athena — Female (UK)" },
  { id: "aura-hera-en", label: "Hera — Female (US)" },
  { id: "aura-orion-en", label: "Orion — Male (US)" },
  { id: "aura-arcas-en", label: "Arcas — Male (US)" },
  { id: "aura-perseus-en", label: "Perseus — Male (US)" },
  { id: "aura-angus-en", label: "Angus — Male (Irish)" },
  { id: "aura-orpheus-en", label: "Orpheus — Male (US)" },
  { id: "aura-helios-en", label: "Helios — Male (UK)" },
  { id: "aura-zeus-en", label: "Zeus — Male (US)" },
];

export const LANGUAGES: VoiceOption[] = [
  { id: "en", label: "English" },
  { id: "en-US", label: "English (US)" },
  { id: "en-GB", label: "English (UK)" },
  { id: "en-IN", label: "English (India)" },
  { id: "es", label: "Spanish" },
  { id: "fr", label: "French" },
  { id: "de", label: "German" },
];
