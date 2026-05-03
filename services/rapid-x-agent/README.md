# Rapid X Agent

Long-running Python worker that joins LiveKit rooms created by the dashboard
and runs the AI voice conversation.

## Stack
- LiveKit Agents (Python)
- Deepgram STT (`nova-2`) + TTS (`aura-asteria-en`)
- Groq LLM (`llama-3.3-70b-versatile`) via OpenAI-compatible endpoint
- Silero VAD + LiveKit BVC noise cancellation

## How a call flows
1. Dashboard `Initiate Call` → `POST /api/dispatch`
2. Express creates a LiveKit room with metadata `{phone_number, user_prompt, ...}`
3. Express tells the SIP trunk to dial the number → LiveKit auto-joins them
4. This worker (registered with no `agent_name`) auto-accepts the new room
5. Worker reads `user_prompt` from room metadata, greets, and starts conversing

## Env vars (Replit secrets)
- `LIVEKIT_URL`, `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET`
- `GROQ_API_KEY` (free at console.groq.com)
- `DEEPGRAM_API_KEY` (free $200 credit at console.deepgram.com)

## Run
```
python agent.py dev   # development with reload
python agent.py start # production
```
