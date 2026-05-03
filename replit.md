# Rapid X AI

Outbound voice agent dispatcher dashboard. Imported from a Vercel/Next.js project (`.migration-backup/dashboard`) and ported to the Replit pnpm monorepo.

## Architecture

- **`artifacts/rapid-x`** — React + Vite frontend (was Next.js `app/` router). Two cards: `CallDispatcher` (single call) and `BulkDialer` (batch). Dark UI with Tailwind v4, lucide-react icons, Inter font.
- **`artifacts/api-server`** — Shared Express backend. Exposes `POST /api/dispatch` and `POST /api/queue`, which use `livekit-server-sdk` (`SipClient` + `RoomServiceClient`) to dial numbers via the Vobiz SIP trunk.
- **`artifacts/mockup-sandbox`** — Scaffold (unused).
- **`artifacts/rapid-x-promo`** — Animated promo video (video-js).
- **`services/rapid-x-agent`** — Python LiveKit agent worker. Auto-joins any room created by `/api/dispatch` and runs the AI conversation (Deepgram STT + Groq LLM + Deepgram TTS + Silero VAD). Reads `user_prompt` from room metadata. Run via the `Rapid X Agent` workflow.

## Required secrets

- `LIVEKIT_URL`, `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET`
- `VOBIZ_SIP_TRUNK_ID`
- `GROQ_API_KEY` — free LLM (llama-3.3-70b-versatile via OpenAI-compat endpoint)
- `DEEPGRAM_API_KEY` — STT (`nova-2`) + TTS (`aura-asteria-en`), free $200 credit

## Notes

- API base URL in the frontend is computed from `import.meta.env.BASE_URL` via `src/lib/api.ts`.
- Agent worker registers with no `agent_name`, so it auto-accepts any new room. Single-tenant for now.
- Agent's internal healthcheck HTTP server binds to `AGENT_HTTP_PORT` (default `8765`) to avoid colliding with mockup-sandbox on 8081.
