import axios from "axios";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { logger } from "./logger";

// ── Config ────────────────────────────────────────────────────────────────

const MODEL_NAME     = "gemini-2.0-flash";
const PASS_THRESHOLD = 60;          // minimum score to auto-release payment
const MAX_CONTENT    = 8_000;       // chars sent to Gemini
const FETCH_TIMEOUT  = 12_000;      // ms

let genAI: GoogleGenerativeAI;

// ── Types ─────────────────────────────────────────────────────────────────

export interface VerificationResult {
  passed: boolean;
  score: number;       // 0–100
  reasoning: string;
  keyFindings: string[];
}

// ── Public API ────────────────────────────────────────────────────────────

/**
 * Initialise the Gemini client and verify the connection with a test prompt.
 * Throws if the API key is invalid or the model is unreachable.
 */
export async function initGemini(): Promise<void> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY not set in .env");

  genAI = new GoogleGenerativeAI(apiKey);

  // Startup probe — non-fatal: rate limits & quota errors just log a warning
  try {
    const model = genAI.getGenerativeModel({ model: MODEL_NAME });
    const result = await model.generateContent(
      'Respond with exactly: {"status":"online"}'
    );
    const raw = result.response.text().trim();
    if (!raw.includes("online")) {
      logger.warn(`Gemini startup probe unexpected response: ${raw}`);
    } else {
      logger.geminiOnline(MODEL_NAME);
    }
  } catch (err) {
    const msg = String(err);
    if (msg.includes("429") || msg.includes("quota")) {
      logger.warn(`Gemini quota/rate-limit on startup probe — proceeding anyway. Verifications will retry per-poll.`);
    } else {
      throw err; // hard failures (bad key, network) still crash early
    }
  }
}

/**
 * Core verification function.
 *
 * 1. Fetches content at deliverableUrl (handles GitHub, Google Docs, plain URLs)
 * 2. Sends milestone requirement + content to Gemini for structured evaluation
 * 3. Returns a pass/fail verdict with score and reasoning
 */
export async function verifyMilestone(
  jobId: number,
  milestoneId: number,
  milestoneDescription: string,
  deliverableUrl: string
): Promise<VerificationResult> {
  logger.info(
    `Verifying Job #${jobId} · Milestone #${milestoneId}: "${milestoneDescription.slice(0, 60)}…"`
  );
  logger.info(`Deliverable: ${deliverableUrl}`);

  // ── Step 1: Fetch content ────────────────────────────────────────────────
  let content: string;
  try {
    content = await fetchContent(deliverableUrl);
    logger.info(`Fetched ${content.length} chars from deliverable`);
  } catch (err) {
    logger.error("Could not fetch deliverable URL", err);
    // Unreachable deliverable = automatic rejection
    return {
      passed: false,
      score: 0,
      reasoning: `Deliverable URL could not be fetched: ${String(err)}`,
      keyFindings: ["URL unreachable or returned an error"],
    };
  }

  // ── Step 2: Call Gemini ──────────────────────────────────────────────────
  const prompt = buildPrompt(milestoneDescription, deliverableUrl, content);

  let raw: string;
  try {
    const model  = genAI.getGenerativeModel({ model: MODEL_NAME });
    const result = await model.generateContent(prompt);
    raw = result.response.text();
  } catch (err) {
    throw new Error(`Gemini API call failed: ${String(err)}`);
  }

  // ── Step 3: Parse response ───────────────────────────────────────────────
  let parsed: {
    passed: boolean;
    score: number;
    reasoning: string;
    keyFindings: string[];
  };

  try {
    parsed = parseGeminiJson(raw);
  } catch (err) {
    logger.warn(`Could not parse Gemini JSON, using fallback. Raw: ${raw.slice(0, 200)}`);
    parsed = {
      passed:      false,
      score:       0,
      reasoning:   "Verification service returned an unparseable response.",
      keyFindings: [],
    };
  }

  // Score is the ground truth for payment release
  const passed = parsed.passed && parsed.score >= PASS_THRESHOLD;

  return {
    passed,
    score:       parsed.score,
    reasoning:   parsed.reasoning,
    keyFindings: parsed.keyFindings ?? [],
  };
}

// ── Content fetching ──────────────────────────────────────────────────────

async function fetchContent(url: string): Promise<string> {
  const normalised = normaliseUrl(url);

  const response = await axios.get<string>(normalised, {
    timeout:          FETCH_TIMEOUT,
    responseType:     "text",
    maxContentLength: 2_000_000, // 2 MB cap before we slice
    headers: {
      "User-Agent": "HERMES-Verification-Agent/1.0",
      Accept: "text/plain, text/html, */*",
    },
    // Don't throw on 4xx/5xx — we'll handle it
    validateStatus: () => true,
  });

  if (response.status >= 400) {
    throw new Error(`HTTP ${response.status} from ${normalised}`);
  }

  let text: string =
    typeof response.data === "string" ? response.data : JSON.stringify(response.data);

  // Strip HTML tags for webpage responses (keep text nodes)
  const contentType = (response.headers["content-type"] ?? "") as string;
  if (contentType.includes("text/html")) {
    text = stripHtml(text);
  }

  return text.slice(0, MAX_CONTENT);
}

/**
 * Convert common URL patterns to their raw-text equivalents:
 * - GitHub file blobs → raw.githubusercontent.com
 * - Google Docs → plain-text export
 * - Google Sheets → CSV export
 */
function normaliseUrl(url: string): string {
  // GitHub blob → raw content
  if (url.includes("github.com") && url.includes("/blob/")) {
    return url
      .replace("github.com", "raw.githubusercontent.com")
      .replace("/blob/", "/");
  }

  // GitHub repo root → README (try main branch)
  if (/github\.com\/[^/]+\/[^/]+\/?$/.test(url)) {
    const base = url.replace(/\/?$/, "");
    const parts = base.replace("https://github.com/", "").split("/");
    if (parts.length === 2) {
      return `https://raw.githubusercontent.com/${parts[0]}/${parts[1]}/main/README.md`;
    }
  }

  // Google Docs
  const docsId = url.match(/docs\.google\.com\/document\/d\/([^/?]+)/)?.[1];
  if (docsId) {
    return `https://docs.google.com/document/d/${docsId}/export?format=txt`;
  }

  // Google Sheets
  const sheetsId = url.match(/docs\.google\.com\/spreadsheets\/d\/([^/?]+)/)?.[1];
  if (sheetsId) {
    return `https://docs.google.com/spreadsheets/d/${sheetsId}/export?format=csv`;
  }

  return url;
}

function stripHtml(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi,  " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g,  " ")
    .replace(/&amp;/g,   "&")
    .replace(/&lt;/g,    "<")
    .replace(/&gt;/g,    ">")
    .replace(/\s+/g,     " ")
    .trim();
}

// ── Gemini prompt ─────────────────────────────────────────────────────────

function buildPrompt(
  description: string,
  url: string,
  content: string
): string {
  return `You are a strict but fair work verifier for a freelance payment escrow platform called HERMES.

Milestone requirement:
"""
${description}
"""

Deliverable URL submitted: ${url}

Content fetched from the deliverable:
"""
${content}
"""

Evaluate whether the submitted work satisfactorily completes the milestone requirement.
Be strict but fair. The work must clearly demonstrate completion of what was asked.
A score below ${PASS_THRESHOLD} means the milestone fails and payment is withheld.
Consider: completeness, quality, relevance to the requirement, and evidence of real work.

Respond with ONLY valid JSON — no markdown, no commentary, just the object:
{
  "passed": true or false,
  "score": integer between 0 and 100,
  "reasoning": "one concise paragraph, max 80 words, explaining your verdict",
  "keyFindings": ["finding 1", "finding 2", "finding 3"]
}`;
}

// ── JSON parsing ──────────────────────────────────────────────────────────

function parseGeminiJson(raw: string): {
  passed: boolean;
  score: number;
  reasoning: string;
  keyFindings: string[];
} {
  // Strip markdown code fences if Gemini wraps it
  const stripped = raw
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/```\s*$/i, "")
    .trim();

  // Extract the first JSON object found in the response
  const match = stripped.match(/\{[\s\S]*\}/);
  if (!match) throw new Error("No JSON object in Gemini response");

  const obj = JSON.parse(match[0]);

  if (typeof obj.passed !== "boolean") throw new Error("Missing 'passed' field");
  if (typeof obj.score !== "number")   throw new Error("Missing 'score' field");

  return {
    passed:      Boolean(obj.passed),
    score:       Math.max(0, Math.min(100, Number(obj.score))),
    reasoning:   String(obj.reasoning ?? ""),
    keyFindings: Array.isArray(obj.keyFindings)
      ? obj.keyFindings.map(String)
      : [],
  };
}
