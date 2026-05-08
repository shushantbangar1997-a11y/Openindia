import { Router, type IRouter, type RequestHandler } from "express";
import {
  appendTranscript,
  getCall,
  listCalls,
  updateCallByRoom,
  updateCallLeadData,
  type LeadData,
} from "../lib/db";
import { summariseCall } from "../lib/summarize";
import { getInternalToken } from "../lib/internal-token";

// Lightweight in-memory guard: tracks rooms whose summary job is in flight.
const _summarising = new Set<string>();

const router: IRouter = Router();

const list: RequestHandler = async (_req, res) => {
  const calls = await listCalls();
  res.json({ calls });
};

const stats: RequestHandler = async (_req, res) => {
  const calls = await listCalls(Number.MAX_SAFE_INTEGER);
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

    if ((type === "ended" || type === "failed") && !c.summary && !_summarising.has(room)) {
      _summarising.add(room);
      setImmediate(async () => {
        try {
          const callToSummarise = (await getCall(c.id)) ?? c;
          const result = await summariseCall(callToSummarise);
          if (result) {
            await updateCallByRoom(room, {
              summary: result.summary,
              outcome: result.outcome,
              sentiment: result.sentiment,
            });
          } else {
            await updateCallByRoom(room, {
              summary: "Summary unavailable.",
              outcome: c.answered_at ? "completed" : "no-answer",
              sentiment: "neutral",
            });
          }
        } catch {
          try {
            await updateCallByRoom(room, {
              summary: "Summary unavailable.",
              outcome: c.answered_at ? "completed" : "no-answer",
              sentiment: "neutral",
            });
          } catch {
            // truly non-fatal
          }
        } finally {
          _summarising.delete(room);
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

// Internal callback from the agent worker: saves caller contact info.
// Requires loopback source IP + shared x-internal-token (same guard as /internal/agents).
const lead: RequestHandler = async (req, res) => {
  const remote = req.socket.remoteAddress ?? "";
  const isLoopback = ["127.0.0.1", "::1", "::ffff:127.0.0.1"].includes(remote);
  const token = req.header("x-internal-token") ?? "";
  if (!isLoopback || token !== getInternalToken()) {
    res.status(403).json({ error: "forbidden" });
    return;
  }
  const room = String(req.params["room"]);
  const body = (req.body ?? {}) as Record<string, unknown>;
  const data: LeadData = {};
  if (typeof body["name"] === "string" && body["name"].trim()) {
    data.name = body["name"].trim().slice(0, 200);
  }
  if (typeof body["email"] === "string" && body["email"].trim()) {
    data.email = body["email"].trim().slice(0, 200);
  }
  if (typeof body["phone"] === "string" && body["phone"].trim()) {
    data.phone = body["phone"].trim().slice(0, 50);
  }
  if (typeof body["company"] === "string" && body["company"].trim()) {
    data.company = body["company"].trim().slice(0, 200);
  }
  if (typeof body["notes"] === "string" && body["notes"].trim()) {
    data.notes = body["notes"].trim().slice(0, 2000);
  }
  if (Object.keys(data).length === 0) {
    res.status(400).json({ error: "No lead fields provided" });
    return;
  }
  const c = await updateCallLeadData(room, data);
  if (!c) {
    res.status(404).json({ error: "Unknown room" });
    return;
  }
  res.json({ ok: true, lead_data: c.lead_data });
};

// Stats must be registered before /:id wildcard.
router.get("/calls", list);
router.get("/calls/stats", stats);
router.get("/calls/:id", getOne);
router.post("/calls/by-room/:room/events", events);
router.post("/calls/by-room/:room/transcript", transcript);
router.post("/calls/by-room/:room/lead", lead);

export default router;
