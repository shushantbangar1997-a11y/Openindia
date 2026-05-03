import { Router, type IRouter, type RequestHandler } from "express";
import {
  createAgent,
  deleteAgent,
  getAgent,
  listAgents,
  updateAgent,
} from "../lib/db";

const router: IRouter = Router();

const list: RequestHandler = async (_req, res) => {
  const agents = await listAgents();
  res.json({ agents });
};

const getOne: RequestHandler = async (req, res) => {
  const a = await getAgent(String(req.params["id"]));
  if (!a) {
    res.status(404).json({ error: "Agent not found" });
    return;
  }
  res.json({ agent: a });
};

const create: RequestHandler = async (req, res) => {
  const { name, system_prompt, greeting, voice_id, language, wait_for_user_first } =
    req.body ?? {};
  if (!name || typeof name !== "string") {
    res.status(400).json({ error: "name is required" });
    return;
  }
  const a = await createAgent({
    name: name.trim(),
    system_prompt: system_prompt ?? "",
    greeting: greeting ?? "",
    voice_id: voice_id ?? "aura-asteria-en",
    language: language ?? "en",
    wait_for_user_first: Boolean(wait_for_user_first),
  });
  res.status(201).json({ agent: a });
};

const patch: RequestHandler = async (req, res) => {
  const updated = await updateAgent(String(req.params["id"]), req.body ?? {});
  if (!updated) {
    res.status(404).json({ error: "Agent not found" });
    return;
  }
  res.json({ agent: updated });
};

const remove: RequestHandler = async (req, res) => {
  const ok = await deleteAgent(String(req.params["id"]));
  if (!ok) {
    res.status(404).json({ error: "Agent not found" });
    return;
  }
  res.json({ success: true });
};

router.get("/agents", list);
router.get("/agents/:id", getOne);
router.post("/agents", create);
router.patch("/agents/:id", patch);
router.delete("/agents/:id", remove);

export default router;
