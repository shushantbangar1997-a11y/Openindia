import { Router, type IRouter, type RequestHandler } from "express";
import {
  appendTranscript,
  getCall,
  listCalls,
  updateCallByRoom,
} from "../lib/db";

const router: IRouter = Router();

const list: RequestHandler = async (_req, res) => {
  const calls = await listCalls();
  res.json({ calls });
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

router.get("/calls", list);
router.get("/calls/:id", getOne);
router.post("/calls/by-room/:room/events", events);
router.post("/calls/by-room/:room/transcript", transcript);

export default router;
