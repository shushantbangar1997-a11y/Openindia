import { Router, type IRouter, type RequestHandler } from "express";
import multer from "multer";
import {
  createKnowledgeDoc,
  deleteKnowledgeDoc,
  getAgent,
  getAgentKnowledgeText,
  listKnowledgeDocs,
  type KnowledgeDoc,
} from "../lib/db";

const router: IRouter = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 2 * 1024 * 1024 } });

function stripHtml(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/\s{2,}/g, " ")
    .trim();
}

async function scrapeUrl(url: string): Promise<{ title: string; content: string }> {
  const r = await fetch(url, {
    headers: { "User-Agent": "Mozilla/5.0 (compatible; RapidXBot/1.0)" },
    signal: AbortSignal.timeout(10_000),
  });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  const html = await r.text();
  const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
  const rawTitle = titleMatch ? titleMatch[1]!.trim() : new URL(url).hostname;
  const content = stripHtml(html).slice(0, 8000);
  return { title: rawTitle.slice(0, 120), content };
}

const listDocs: RequestHandler = async (req, res) => {
  const agentId = String(req.params["id"]);
  const agent = await getAgent(agentId);
  if (!agent) { res.status(404).json({ error: "Agent not found" }); return; }
  const docs = await listKnowledgeDocs(agentId);
  res.json({ docs });
};

const addText: RequestHandler = async (req, res) => {
  const agentId = String(req.params["id"]);
  const agent = await getAgent(agentId);
  if (!agent) { res.status(404).json({ error: "Agent not found" }); return; }
  const { title, content } = (req.body ?? {}) as { title?: string; content?: string };
  if (!title || !String(title).trim()) { res.status(400).json({ error: "title required" }); return; }
  if (!content || !String(content).trim()) { res.status(400).json({ error: "content required" }); return; }
  const doc = await createKnowledgeDoc({
    agent_id: agentId,
    title: String(title).trim().slice(0, 120),
    content: String(content).trim().slice(0, 8000),
    source_type: "text",
  });
  res.status(201).json({ doc });
};

const addUrl: RequestHandler = async (req, res) => {
  const agentId = String(req.params["id"]);
  const agent = await getAgent(agentId);
  if (!agent) { res.status(404).json({ error: "Agent not found" }); return; }
  const { url } = (req.body ?? {}) as { url?: string };
  if (!url || !String(url).trim()) { res.status(400).json({ error: "url required" }); return; }
  let parsedUrl: URL;
  try { parsedUrl = new URL(String(url).trim()); } catch { res.status(400).json({ error: "Invalid URL" }); return; }
  if (!["http:", "https:"].includes(parsedUrl.protocol)) { res.status(400).json({ error: "Only http/https URLs allowed" }); return; }
  try {
    const { title, content } = await scrapeUrl(parsedUrl.href);
    const doc = await createKnowledgeDoc({
      agent_id: agentId,
      title,
      content,
      source_type: "url",
      source_url: parsedUrl.href,
    });
    res.status(201).json({ doc });
  } catch (e: any) {
    res.status(502).json({ error: `Could not fetch URL: ${e?.message || e}` });
  }
};

const addFile: RequestHandler = async (req, res) => {
  const agentId = String(req.params["id"]);
  const agent = await getAgent(agentId);
  if (!agent) { res.status(404).json({ error: "Agent not found" }); return; }
  const file = (req as any).file as Express.Multer.File | undefined;
  if (!file) { res.status(400).json({ error: "No file uploaded" }); return; }
  const name = file.originalname ?? "upload";
  const ext = name.split(".").pop()?.toLowerCase() ?? "";
  if (!["txt", "md", "csv"].includes(ext)) {
    res.status(415).json({ error: "Supported formats: .txt, .md, .csv" });
    return;
  }
  const content = file.buffer.toString("utf-8").slice(0, 8000);
  const title = name.replace(/\.[^.]+$/, "").slice(0, 120) || "Uploaded file";
  const doc = await createKnowledgeDoc({
    agent_id: agentId,
    title,
    content,
    source_type: "file",
  });
  res.status(201).json({ doc });
};

const removeDoc: RequestHandler = async (req, res) => {
  const agentId = String(req.params["id"]);
  const docId = String(req.params["docId"]);
  const ok = await deleteKnowledgeDoc(docId, agentId);
  if (!ok) { res.status(404).json({ error: "Document not found" }); return; }
  res.json({ success: true });
};

router.get("/agents/:id/documents", listDocs);
router.post("/agents/:id/documents/text", addText);
router.post("/agents/:id/documents/url", addUrl);
router.post("/agents/:id/documents/file", upload.single("file"), addFile);
router.delete("/agents/:id/documents/:docId", removeDoc);

// Internal endpoint — worker fetches this at call start to inject knowledge into the prompt.
// Same loopback+token guard as /api/internal/agents/:id/keys.
import { writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const INTERNAL_TOKEN = process.env["INTERNAL_API_TOKEN"] ?? "";

const internalKnowledge: RequestHandler = async (req, res) => {
  const remote = req.socket.remoteAddress ?? "";
  const isLoopback = ["127.0.0.1", "::1", "::ffff:127.0.0.1"].includes(remote);
  const token = req.header("x-internal-token") ?? "";
  if (!isLoopback || token !== INTERNAL_TOKEN) {
    res.status(403).json({ error: "forbidden" });
    return;
  }
  const agentId = String(req.params["id"]);
  const text = await getAgentKnowledgeText(agentId);
  res.json({ knowledge_text: text });
};
router.get("/internal/agents/:id/knowledge", internalKnowledge);

export default router;
