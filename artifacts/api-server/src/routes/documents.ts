import { Router, type IRouter, type RequestHandler, type Request } from "express";
import multer from "multer";
import { lookup as dnsLookup } from "node:dns/promises";
import {
  createKnowledgeDoc,
  deleteKnowledgeDoc,
  getAgent,
  listKnowledgeDocs,
} from "../lib/db";

// Extend Express Request to include multer's file field.
type MulterRequest = Request & { file?: Express.Multer.File };

const router: IRouter = Router();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
});

// ── SSRF guard ─────────────────────────────────────────────────────────────
async function assertNotPrivateHost(host: string): Promise<void> {
  const check = async (family: 4 | 6): Promise<void> => {
    let addr: string;
    try {
      const r = await dnsLookup(host, { family });
      addr = r.address;
    } catch {
      return;
    }
    if (family === 6) {
      if (addr === "::1") throw new Error("Private address blocked");
      if (/^(fc|fd|fe80)/i.test(addr)) throw new Error("Private address blocked");
      return;
    }
    const p = addr.split(".").map(Number);
    const blocked =
      p[0] === 127 ||
      p[0] === 10 ||
      (p[0] === 172 && p[1]! >= 16 && p[1]! <= 31) ||
      (p[0] === 192 && p[1] === 168) ||
      (p[0] === 169 && p[1] === 254) ||
      p[0] === 0;
    if (blocked) throw new Error("Private address blocked");
  };
  const results = await Promise.allSettled([check(4), check(6)]);
  for (const r of results) {
    if (r.status === "rejected") throw r.reason as Error;
  }
}

// ── HTML stripping ──────────────────────────────────────────────────────────
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

// ── Text extraction helpers ─────────────────────────────────────────────────
async function extractText(buffer: Buffer, ext: string): Promise<string> {
  if (ext === "pdf") {
    try {
      // Import directly from the internal lib path to avoid pdf-parse@1.x's
      // buggy "module.parent" check that runs its own test suite on import.
      const pdfParse = require("pdf-parse/lib/pdf-parse.js") as (
        buf: Buffer,
      ) => Promise<{ text: string }>;
      const result = await pdfParse(buffer);
      return (result.text ?? "").trim();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      throw new Error(`PDF extraction failed: ${msg}`);
    }
  }
  if (ext === "docx") {
    try {
      const mammoth = await import("mammoth");
      const result = await mammoth.extractRawText({ buffer });
      return (result.value ?? "").trim();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      throw new Error(`DOCX extraction failed: ${msg}`);
    }
  }
  return buffer.toString("utf-8").trim();
}

// Safe fetch that re-validates the hostname after every redirect hop so an
// attacker cannot chain a public-facing URL to an internal redirect target.
async function safeFetch(url: string, hopsLeft = 5): Promise<Response> {
  const parsed = new URL(url);
  if (!["http:", "https:"].includes(parsed.protocol)) {
    throw new Error("Only http/https URLs allowed");
  }
  await assertNotPrivateHost(parsed.hostname);
  const r = await fetch(url, {
    headers: { "User-Agent": "Mozilla/5.0 (compatible; RapidXBot/1.0)" },
    signal: AbortSignal.timeout(10_000),
    redirect: "manual",
  });
  if (r.status >= 300 && r.status < 400) {
    if (hopsLeft <= 0) throw new Error("Too many redirects");
    const location = r.headers.get("location");
    if (!location) throw new Error("Redirect with no Location header");
    const next = new URL(location, url).href;
    return safeFetch(next, hopsLeft - 1);
  }
  return r;
}

async function scrapeUrl(rawUrl: string): Promise<{ title: string; content: string }> {
  const parsed = new URL(rawUrl);
  const r = await safeFetch(rawUrl);
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  const contentType = r.headers.get("content-type") ?? "";
  if (!contentType.includes("text/html") && !contentType.includes("text/plain")) {
    throw new Error("URL did not return an HTML or text page");
  }
  const html = await r.text();
  const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
  const rawTitle = titleMatch ? titleMatch[1]!.trim() : parsed.hostname;
  const content = stripHtml(html).slice(0, 8000);
  return { title: rawTitle.slice(0, 120), content };
}

// ── Body shape for JSON paths ────────────────────────────────────────────────
type DocBody = {
  source?: string;
  url?: string;
  title?: string;
  content?: string;
};

// ── Route handlers ──────────────────────────────────────────────────────────
function makeExcerpt(content: string, maxLen = 300): string {
  const text = content.trim();
  return text.length <= maxLen ? text : `${text.slice(0, maxLen)}…`;
}

const listDocs: RequestHandler = async (req, res) => {
  const agentId = String(req.params["id"]);
  if (!(await getAgent(agentId))) {
    res.status(404).json({ error: "Agent not found" });
    return;
  }
  const docs = await listKnowledgeDocs(agentId);
  res.json({
    docs: docs.map((d) => ({ ...d, excerpt: makeExcerpt(d.content) })),
  });
};

async function handleAddDoc(
  req: MulterRequest,
  res: Parameters<RequestHandler>[1],
  bodyOverrides: Partial<DocBody> = {},
): Promise<void> {
  const agentId = String(req.params["id"]);
  if (!(await getAgent(agentId))) {
    res.status(404).json({ error: "Agent not found" });
    return;
  }

  const file = req.file;

  if (file) {
    const name = file.originalname ?? "upload";
    const ext = name.split(".").pop()?.toLowerCase() ?? "";
    const allowed = ["txt", "md", "csv", "pdf", "docx"];
    if (!allowed.includes(ext)) {
      res.status(415).json({ error: `Supported formats: ${allowed.join(", ")}` });
      return;
    }
    try {
      const content = (await extractText(file.buffer, ext)).slice(0, 16_000);
      const title = name.replace(/\.[^.]+$/, "").slice(0, 120) || "Uploaded file";
      const doc = await createKnowledgeDoc({
        agent_id: agentId,
        title,
        content,
        size: file.size,
        source_type: "file",
      });
      res.status(201).json({ doc });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Extraction failed";
      res.status(422).json({ error: msg });
    }
    return;
  }

  const rawBody = (req.body ?? {}) as DocBody;
  const body: DocBody = { ...rawBody, ...bodyOverrides };
  const { source, url, title: bodyTitle, content: bodyContent } = body;

  if (source === "url" || (url && !bodyContent)) {
    const rawUrl = String(url ?? "").trim();
    if (!rawUrl) {
      res.status(400).json({ error: "url required" });
      return;
    }
    let parsedUrl: URL;
    try {
      parsedUrl = new URL(rawUrl);
    } catch {
      res.status(400).json({ error: "Invalid URL" });
      return;
    }
    if (!["http:", "https:"].includes(parsedUrl.protocol)) {
      res.status(400).json({ error: "Only http/https URLs allowed" });
      return;
    }
    try {
      const { title, content } = await scrapeUrl(parsedUrl.href);
      const doc = await createKnowledgeDoc({
        agent_id: agentId,
        title,
        content,
        size: Buffer.byteLength(content, "utf-8"),
        source_type: "url",
        source_url: parsedUrl.href,
      });
      res.status(201).json({ doc });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      res.status(502).json({ error: `Could not fetch URL: ${msg}` });
    }
    return;
  }

  if (!bodyTitle || !String(bodyTitle).trim()) {
    res.status(400).json({ error: "title required" });
    return;
  }
  if (!bodyContent || !String(bodyContent).trim()) {
    res.status(400).json({ error: "content required" });
    return;
  }
  const content = String(bodyContent).trim().slice(0, 16_000);
  const doc = await createKnowledgeDoc({
    agent_id: agentId,
    title: String(bodyTitle).trim().slice(0, 120),
    content,
    size: Buffer.byteLength(content, "utf-8"),
    source_type: "text",
  });
  res.status(201).json({ doc });
}

const addDoc: RequestHandler = (req, res) =>
  handleAddDoc(req as MulterRequest, res);

const addTextAlias: RequestHandler = (req, res) =>
  handleAddDoc(req as MulterRequest, res, { source: "text" });

const addUrlAlias: RequestHandler = (req, res) =>
  handleAddDoc(req as MulterRequest, res, { source: "url" });

const removeDoc: RequestHandler = async (req, res) => {
  const ok = await deleteKnowledgeDoc(
    String(req.params["docId"]),
    String(req.params["id"]),
  );
  if (!ok) {
    res.status(404).json({ error: "Document not found" });
    return;
  }
  res.json({ success: true });
};

router.get("/agents/:id/documents", listDocs);
router.post("/agents/:id/documents", upload.single("file"), addDoc);
router.post("/agents/:id/documents/text", addTextAlias);
router.post("/agents/:id/documents/url", addUrlAlias);
router.post("/agents/:id/documents/file", upload.single("file"), addDoc);
router.delete("/agents/:id/documents/:docId", removeDoc);

// ── Internal knowledge endpoint ─────────────────────────────────────────────
// Returns all docs as structured JSON for per-turn relevance scoring in the worker.
import { getInternalToken } from "../lib/internal-token";

const internalKnowledge: RequestHandler = async (req, res) => {
  const remote = req.socket.remoteAddress ?? "";
  const isLoopback = ["127.0.0.1", "::1", "::ffff:127.0.0.1"].includes(remote);
  const token = req.header("x-internal-token") ?? "";
  if (!isLoopback || token !== getInternalToken()) {
    res.status(403).json({ error: "forbidden" });
    return;
  }
  const agentId = String(req.params["id"]);
  const docs = await listKnowledgeDocs(agentId);
  res.json({
    docs: docs.map((d) => ({ id: d.id, title: d.title, content: d.content })),
  });
};
router.get("/internal/agents/:id/knowledge", internalKnowledge);

export default router;
