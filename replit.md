# Rapid X AI

Synthflow-style outbound voice agent platform. Build agents that sound like real humans, dispatch them to phone numbers via SIP, watch the live transcript, or test them live in the browser without a phone call.

## Architecture

- **`artifacts/rapid-x`** — React + Vite frontend (Tailwind v4, wouter routing, lucide-react). Pages:
  - `/` — Dispatch (single + bulk) with an Agent dropdown.
  - `/agents` — Agent CRUD with a tabbed editor: **Persona** (name, prompt, opening line, prompt template picker), **Voice** (language, TTS provider, voice, speaking speed), **Behavior** (filler words, interruption sensitivity, wait-for-user-first). Includes a **Test in browser** modal that connects directly to the agent worker via `livekit-client`.
  - `/calls` — Live call history with status pills + per-call transcript that streams in.
- **`artifacts/api-server`** — Express backend on `/api`:
  - `GET/POST/PATCH/DELETE /agents[/:id]` — agent CRUD (JSON-file store, server-side sanitization on writes).
  - `GET /agents/catalog` — single source of truth for the frontend: voices, languages (with the Deepgram STT model/language for each), prompt templates, and provider availability flags (driven by which API keys are present in env).
  - `POST /agents/:id/test-token` — mints a LiveKit AccessToken so the browser can join an isolated test room with the agent's metadata baked in.
  - `POST /dispatch`, `POST /queue` — dial via the Vobiz SIP trunk; both call `buildAgentMetadata()` which embeds the agent's full config (provider, voice, language, STT model, speed, fillers, sensitivity, prompt, greeting) into the LiveKit room metadata.
  - `GET /calls`, `GET /calls/:id` — call history + transcript.
  - `POST /calls/by-room/:room/events|transcript` — internal callbacks the agent worker uses to record `answered/ended/failed` and conversation turns.
- **`services/rapid-x-agent`** — Python LiveKit worker. Waits for the callee to join before starting `AgentSession`, then:
  - Picks a TTS provider (Deepgram Aura / Aura-2, ElevenLabs Multilingual v2, or Cartesia Sonic-2). Premium providers gracefully fall back to Deepgram if the plugin or API key is missing.
  - Picks a Deepgram STT model from the room metadata (catalog-driven; no client-side guessing).
  - Maps interruption sensitivity (low/medium/high) to `min_endpointing_delay` of 600/350/180 ms on `AgentSession`.
  - Plays a short conversational filler (`mm-hmm`, `right`, `okay` — localized into 11 languages) on `user_input_transcribed` final, eliminating dead air while the LLM generates.
  - Speaks the literal opening line via `session.say()` so the user gets exactly the greeting they wrote (instead of an LLM paraphrase).
  - Streams transcript turns + lifecycle events back to the api-server via `INTERNAL_API_URL` (default `http://localhost:8080`).
- **`artifacts/rapid-x-promo`** — Animated promo video (video-js).

## Agent configuration model

Each agent (`artifacts/api-server/src/lib/db.ts → Agent`):
- `name`, `system_prompt`, `greeting`
- `tts_provider`: `"deepgram" | "elevenlabs" | "cartesia"`
- `voice_id`: provider-specific
- `language`: BCP-47-ish (`en-US`, `es`, `hi`, `ja`, …) — 20 languages in the catalog
- `speaking_speed`: 0.8 – 1.3
- `fillers_enabled`: bool
- `interruption_sensitivity`: `"low" | "medium" | "high"`
- `wait_for_user_first`: bool
- `template_id`: which prompt scaffold was chosen (for UI hint only)

Old agent records (pre-v2) auto-migrate to the new schema via `migrateAgent()` in `db.ts`.

## Voice catalog

- `artifacts/api-server/src/lib/voices.ts` — canonical list of voices, languages, and provider availability. The frontend mirror in `artifacts/rapid-x/src/lib/voices.ts` is just a fallback for first paint; the real catalog is fetched at runtime from `/api/agents/catalog`.
- Languages: 20, each tagged with the Deepgram STT model + language code that supports it (English uses nova-3 for quality; everything else uses nova-2).
- Providers: Deepgram (12 Aura/Aura-2 voices, English only, free), ElevenLabs (12 Multilingual v2 voices, 29 languages, premium), Cartesia (6 Sonic-2 voices, 15+ languages, premium).

## Prompt templates

`artifacts/api-server/src/lib/prompt-templates.ts` ships 5 Synthflow-style "talks like a human" scaffolds (Appointment booking, Cold sales, Customer support, Survey, Virtual receptionist) plus Blank. Each includes a strict ground-rules block: contractions, no markdown, never reveal you're an AI, natural number reading, etc. One-click apply on the Persona tab; the user can edit afterward.

## Storage

`artifacts/api-server/data/store.json` — single JSON file with `{ agents, calls }`. Auto-seeds a "Friendly Assistant" agent on first boot.

## Required secrets

- `LIVEKIT_URL`, `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET`
- `VOBIZ_SIP_TRUNK_ID`
- `GROQ_API_KEY` (free LLM — llama-3.3-70b-versatile via OpenAI-compat endpoint)
- `DEEPGRAM_API_KEY` (STT + Aura TTS, free $200 credit)

## Optional secrets (premium voices)

- `ELEVENLABS_API_KEY` — unlocks Multilingual v2 voices in 29 languages
- `CARTESIA_API_KEY` — unlocks Sonic-2 voices in 15+ languages

When a premium key is missing, the UI shows an amber "needs API key" hint and the worker silently falls back to Deepgram so calls keep working.

## Notes

- API base URL in the frontend is computed from `import.meta.env.BASE_URL` via `src/lib/api.ts`.
- Agent worker registers with no `agent_name` so it auto-accepts every room (single-tenant).
- Agent worker's healthcheck HTTP server binds to `AGENT_HTTP_PORT` (default `8765`).
- Browser-test mode reuses the same worker — the test room metadata sets `mode: "browser-test"` and the worker treats the browser participant identical to a SIP callee.
- The silent-on-pickup bug history: was caused by an expired `DEEPGRAM_API_KEY` returning 401 on the STT websocket, which crashed the audio recognition pipeline before the greeting could play. Fixed by refreshing the key. Worker startup ordering was also hardened: callee join → session.start → literal `session.say(greeting)` so the opening line is always exactly what the user wrote.
