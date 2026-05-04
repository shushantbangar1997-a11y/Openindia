import type { CallRecord, CallOutcome, CallSentiment } from "./db";

const GROQ_API_URL = "https://api.groq.com/openai/v1/chat/completions";
const MODEL = "llama-3.1-8b-instant";

type SummaryResult = {
  summary: string;
  outcome: CallOutcome;
  sentiment: CallSentiment;
};

export async function summariseCall(call: CallRecord): Promise<SummaryResult | null> {
  const apiKey = process.env["GROQ_API_KEY"];
  if (!apiKey) return null;
  if (!call.transcript || call.transcript.length === 0) {
    return {
      summary: "No conversation was recorded for this call.",
      outcome: call.answered_at ? "completed" : "no-answer",
      sentiment: "neutral",
    };
  }

  const transcriptText = call.transcript
    .map((t) => `${t.role === "assistant" ? "Agent" : "Caller"}: ${t.text}`)
    .join("\n");

  const prompt = `You are an AI analyst reviewing a completed phone call transcript. Respond ONLY with a JSON object, no markdown, no extra text.

Transcript:
${transcriptText.slice(0, 6000)}

Reply with exactly this JSON shape:
{
  "summary": "<2-3 sentence summary of what happened and the call outcome>",
  "outcome": "<one of: completed | no-answer | voicemail | escalated>",
  "sentiment": "<one of: positive | neutral | negative>"
}

Rules:
- "completed" = conversation finished naturally
- "no-answer" = caller never responded / call was very short
- "voicemail" = agent left a voicemail
- "escalated" = caller asked to speak to a human / issue unresolved
- sentiment = overall caller sentiment during the call`;

  try {
    const res = await fetch(GROQ_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: MODEL,
        messages: [{ role: "user", content: prompt }],
        temperature: 0.2,
        max_tokens: 300,
      }),
      signal: AbortSignal.timeout(20_000),
    });

    if (!res.ok) return null;
    const data = (await res.json()) as { choices?: { message?: { content?: string } }[] };
    const raw = data.choices?.[0]?.message?.content ?? "";
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return null;
    const parsed = JSON.parse(jsonMatch[0]) as {
      summary?: string;
      outcome?: string;
      sentiment?: string;
    };

    const OUTCOMES: CallOutcome[] = ["completed", "no-answer", "voicemail", "escalated"];
    const SENTIMENTS: CallSentiment[] = ["positive", "neutral", "negative"];

    return {
      summary: typeof parsed.summary === "string" ? parsed.summary.trim() : "Summary unavailable.",
      outcome: OUTCOMES.includes(parsed.outcome as CallOutcome)
        ? (parsed.outcome as CallOutcome)
        : "completed",
      sentiment: SENTIMENTS.includes(parsed.sentiment as CallSentiment)
        ? (parsed.sentiment as CallSentiment)
        : "neutral",
    };
  } catch {
    return null;
  }
}
