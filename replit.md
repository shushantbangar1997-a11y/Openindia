# Rapid X AI

Synthflow-style outbound voice agent platform. Create AI agents (prompt + voice + greeting), dispatch them to phone numbers via SIP, watch the live transcript, or test them in your browser without a phone call.

## Architecture

- **`artifacts/rapid-x`** — React + Vite frontend (Tailwind v4, wouter routing, lucide-react). Pages:
  - `/` — Dispatch (single + bulk), each with an Agent dropdown.
  - `/agents` — CRUD for agents (name, system prompt, opening line, voice, language, "wait for user first" toggle) + **Test in browser** modal that connects directly to the agent worker via `livekit-client`.
  - `/calls` — Live call history with status pills + per-call transcript that streams in.
- **`artifacts/api-server`** — Express backend on `/api`:
  - `GET/POST/PATCH/DELETE /agents[/:id]` — agent CRUD (JSON-file store).
  - `POST /agents/:id/test-token` — mints a LiveKit AccessToken so the browser can join an isolated test room with the agent's metadata baked in.
  - `POST /dispatch`, `POST /queue` — dial via the Vobiz SIP trunk; accept `agentId` and embed the chosen agent's prompt/voice/greeting/language into room metadata.
  - `GET /calls`, `GET /calls/:id` — call history + transcript.
  - `POST /calls/by-room/:room/events|transcript` — internal callbacks the agent worker uses to record `answered/ended/failed` and conversation turns.
- **`services/rapid-x-agent`** — Python LiveKit worker. Connects, **waits for the callee to join before starting the AgentSession** (this fix removed the "AgentSession isn't running" crash that was producing silent calls), reads per-call config (`user_prompt`, `greeting`, `voice_id`, `language`, `wait_for_user_first`, `mode`) from `room.metadata`, runs Deepgram STT + Groq LLM + Deepgram TTS + Silero VAD, and posts call lifecycle + transcript turns back to the api-server via `INTERNAL_API_URL` (default `http://localhost:8080`).
- **`artifacts/rapid-x-promo`** — Animated promo video (video-js).

## Storage

`artifacts/api-server/data/store.json` — single JSON file with `{ agents, calls }`. Auto-seeds a "Friendly Assistant" agent on first boot. Gives us per-agent prompts and full call history without a database dependency.

## Required secrets

- `LIVEKIT_URL`, `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET`
- `VOBIZ_SIP_TRUNK_ID`
- `GROQ_API_KEY` (free LLM — llama-3.3-70b-versatile via OpenAI-compat endpoint)
- `DEEPGRAM_API_KEY` (STT `nova-2` + TTS Aura voices, free $200 credit)

## Notes

- API base URL in the frontend is computed from `import.meta.env.BASE_URL` via `src/lib/api.ts`.
- Agent worker registers with no `agent_name` so it auto-accepts every room (single-tenant).
- Agent's internal healthcheck HTTP server binds to `AGENT_HTTP_PORT` (default `8765`) to avoid colliding with mockup-sandbox on 8081.
- Voices: Deepgram Aura models (e.g. `aura-asteria-en`). Full list in `artifacts/rapid-x/src/lib/voices.ts`.
- Browser-test mode reuses the same worker — the test room metadata sets `mode: "browser-test"` and the worker treats the browser participant identical to a SIP callee.
