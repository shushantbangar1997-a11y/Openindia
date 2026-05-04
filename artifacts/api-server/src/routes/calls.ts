import { Router, type IRouter, type RequestHandler } from "express";
import {
  appendTranscript,
  getCall,
  listCalls,
  updateCallByRoom,
} from "../lib/db";
import { summariseCall } from "../lib/summarize";

const router: IRouter = Router();

const list: RequestHandler = async (_req, res) => {
  const calls = await listCalls();
  res.json({ calls });
};

const stats: RequestHandler = async (_req, res) => {
  const calls = await listCalls(10_000);
  const total = calls.length;
  const answered = calls.filter((c) => c.answered_at !== null).length;
  const active_now = calls.filter(
    (c) => c.status === "ringing" || c.status === "answered",
  ).length;

  const durations = calls
    .filter((c) => c.answered_at !== null && c.ended_at !== null)
    .map(
      (c) =>
        new Date(c.ended_at!).getTime() - new Date(c.answered_at!).getTime(),
    );
  const avg_duration_ms =
    durations.length > 0
      ? Math.round(durations.reduce((a, b) => a + b, 0) / durations.length)
      : 0;

  res.json({ total, answered, avg_duration_ms, active_now });
};

const getOne: RequestHandler = async (req, res) => {
  const c = await getCall(String(req.params["id"]));
  if (!c) {
    res.status(404).json({ error: "Call not found" });
    return;
  }
  res.json({ call: c });
};

const events: RequestHandler = async (req, res) => {
  const room = String(req.params["room"]);
  const { type, reason, ts } = req.body ?? {};
  const when = (typeof ts === "string" && ts) || new Date().toISOString();

  if (type === "answered") {
    const c = await updateCallByRoom(room, {
      status: "answered",
      answered_at: when,
    });
    if (!c) {
      res.status(404).json({ error: "Unknown room" });
      return;
    }
    res.json({ call: c });
    return;
  }

  if (type === "ended" || type === "failed") {
    const c = await updateCallByRoom(room, {
      status: type === "ended" ? "ended" : "failed",
      ended_at: when,
      end_reason: reason ?? null,
    });
    if (!c) {
      res.status(404).json({ error: "Unknown room" });
      return;
    }
    res.json({ call: c });

    // Fire-and-forget AI summary for all ended calls (summariseCall handles
    // empty transcripts with a no-answer fallback, so no transcript gate here).
    if (type === "ended" && !c.summary) {
      setImmediate(async () => {
        try {
          const result = await summariseCall(c);
          if (result) {
            await updateCallByRoom(room, {
              summary: result.summary,
              outcome: result.outcome,
              sentiment: result.sentiment,
            });
          }
        } catch {
          // non-fatal — call record persists without summary
        }
      });
    }
    return;
  }

  res.status(400).json({ error: "Unknown event type" });
};

const transcript: RequestHandler = async (req, res) => {
  const room = String(req.params["room"]);
  const { role, text, ts } = req.body ?? {};
  if ((role !== "user" && role !== "assistant") || typeof text !== "string") {
    res.status(400).json({ error: "role and text are required" });
    return;
  }
  const c = await appendTranscript(room, {
    role,
    text,
    ts: (typeof ts === "string" && ts) || new Date().toISOString(),
  });
  if (!c) {
    res.status(404).json({ error: "Unknown room" });
    return;
  }
  res.json({ ok: true });
};

// Stats must be registered before the /:id wildcard to avoid being swallowed.
router.get("/calls", list);
router.get("/calls/stats", stats);
router.get("/calls/:id", getOne);
router.post("/calls/by-room/:room/events", events);
router.post("/calls/by-room/:room/transcript", transcript);

export default router;
