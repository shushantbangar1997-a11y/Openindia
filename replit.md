# Rapid X AI

Outbound voice agent dispatcher dashboard. Imported from a Vercel/Next.js project (`.migration-backup/dashboard`) and ported to the Replit pnpm monorepo.

## Architecture

- **`artifacts/rapid-x`** — React + Vite frontend (was Next.js `app/` router). Two cards: `CallDispatcher` (single call) and `BulkDialer` (batch). Dark UI with Tailwind v4, lucide-react icons, Inter font.
- **`artifacts/api-server`** — Shared Express backend. Exposes `POST /api/dispatch` and `POST /api/queue`, which use `livekit-server-sdk` (`SipClient` + `RoomServiceClient`) to dial numbers via the Vobiz SIP trunk.
- **`artifacts/mockup-sandbox`** — Scaffold (unused).

## Required secrets

- `LIVEKIT_URL`, `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET`
- `VOBIZ_SIP_TRUNK_ID`

## Notes

- API base URL in the frontend is computed from `import.meta.env.BASE_URL` via `src/lib/api.ts`.
- The Python LiveKit agent in `.migration-backup/` (root) is the standalone worker that joins rooms; it's not part of this dashboard port.
