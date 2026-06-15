import axios from "axios";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { logger } from "./logger";

// ── Config ────────────────────────────────────────────────────────────────

const MODEL_NAME     = "gemini-2.5-flash";
export const PASS_THRESHOLD = 60;   // minimum score to auto-release payment
const MAX_CONTENT    = 8_000;       // chars sent to Gemini — enough for full README, code, docs
const FETCH_TIMEOUT  = 8_000;       // ms

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
    if (msg.includes("429") || msg.includes("quota") || msg.includes("503") || msg.includes("Service Unavailable") || msg.includes("high demand")) {
      logger.warn(`Gemini transient error on startup probe — proceeding anyway. Verifications will retry per-poll.`);
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

  // ── Step 2: Call Gemini (with rate-limit retry) ──────────────────────────
  const prompt = buildPrompt(milestoneDescription, deliverableUrl, content);
  const raw = await callGeminiWithRetry(prompt);

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

  // Score is the sole ground truth — ignore the boolean if score says otherwise
  const passed = parsed.score >= PASS_THRESHOLD;

  return {
    passed,
    score:       parsed.score,
    reasoning:   parsed.reasoning,
    keyFindings: [],
  };
}

// ── Gemini call with rate-limit retry ────────────────────────────────────

async function callGeminiWithRetry(prompt: string, maxAttempts = 4): Promise<string> {
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const model  = genAI.getGenerativeModel({ model: MODEL_NAME });
      const result = await model.generateContent(prompt);
      return result.response.text();
    } catch (err: any) {
      const msg = String(err);
      const isRateLimit   = msg.includes("429") || msg.includes("quota") || msg.includes("RESOURCE_EXHAUSTED");
      const isOverloaded  = msg.includes("503") || msg.includes("Service Unavailable") || msg.includes("high demand");

      if ((isRateLimit || isOverloaded) && attempt < maxAttempts) {
        let waitSec: number;
        if (isRateLimit) {
          // Parse the suggested retry delay from the error body, default 65s
          const match = msg.match(/"retryDelay":"(\d+)s"/);
          waitSec = match ? Math.min(parseInt(match[1]) + 2, 120) : 65;
          logger.warn(`Gemini rate-limited — waiting ${waitSec}s then retrying (${attempt}/${maxAttempts - 1})…`);
        } else {
          // 503 overload — shorter exponential backoff: 10s, 20s, 40s
          waitSec = 10 * Math.pow(2, attempt - 1);
          logger.warn(`Gemini overloaded (503) — waiting ${waitSec}s then retrying (${attempt}/${maxAttempts - 1})…`);
        }
        await new Promise(r => setTimeout(r, waitSec * 1_000));
        continue;
      }

      throw new Error(`Gemini API call failed: ${msg}`);
    }
  }
  throw new Error("Gemini: max retries exceeded");
}

// ── Content fetching ──────────────────────────────────────────────────────

async function fetchContent(url: string): Promise<string> {
  // GitHub repo roots need special multi-fallback handling
  const ghRepo = parseGithubRepo(url);
  if (ghRepo) {
    return fetchGithubRepo(ghRepo.owner, ghRepo.repo);
  }

  const normalised = normaliseUrl(url);
  logger.info(`  Fetch → ${normalised}`);

  const response = await axios.get<string>(normalised, {
    timeout:          FETCH_TIMEOUT,
    responseType:     "text",
    maxContentLength: 2_000_000,
    headers: {
      "User-Agent": "HERMES-Verification-Agent/1.0",
      Accept: "text/plain, text/html, */*",
    },
    validateStatus: () => true,
  });

  const ct = String(response.headers["content-type"] ?? "").split(";")[0];
  logger.info(`  Status ${response.status} · type: ${ct}`);

  if (response.status >= 400) {
    throw new Error(`HTTP ${response.status} from ${normalised}`);
  }

  let text: string =
    typeof response.data === "string" ? response.data : JSON.stringify(response.data);

  const contentType = (response.headers["content-type"] ?? "") as string;
  if (contentType.includes("text/html")) {
    text = extractHtmlText(text);
  }

  const sliced = text.slice(0, MAX_CONTENT);
  logger.info(`  Content preview: ${sliced.slice(0, 120).replace(/\n/g, " ")}…`);
  return sliced;
}

/**
 * GitHub repo roots need branch + filename fallbacks.
 * Tries main/master × README.md/readme.md before giving up.
 */
async function fetchGithubRepo(owner: string, repo: string): Promise<string> {
  const branches  = ["main", "master", "develop"];
  const readmes   = ["README.md", "readme.md", "README.rst", "README.txt"];

  for (const branch of branches) {
    for (const readme of readmes) {
      const rawUrl = `https://raw.githubusercontent.com/${owner}/${repo}/${branch}/${readme}`;
      try {
        const res = await axios.get<string>(rawUrl, {
          timeout:          FETCH_TIMEOUT,
          responseType:     "text",
          validateStatus:   () => true,
          headers:          { "User-Agent": "HERMES-Verification-Agent/1.0" },
        });
        if (res.status === 200 && res.data) {
          const text = (typeof res.data === "string" ? res.data : JSON.stringify(res.data))
            .slice(0, MAX_CONTENT);
          logger.info(`  GitHub → ${branch}/${readme} (${text.length} chars)`);
          logger.info(`  Content preview: ${text.slice(0, 120).replace(/\n/g, " ")}…`);
          return text;
        }
      } catch { /* try next */ }
    }
  }

  throw new Error(
    `GitHub repo ${owner}/${repo}: no README found on main/master/develop branches`
  );
}

/** Returns {owner, repo} if the URL is a GitHub repo root, null otherwise. */
function parseGithubRepo(url: string): { owner: string; repo: string } | null {
  // Match github.com/owner/repo  (not a blob, tree, issues, PR, etc.)
  const m = url.match(/^https?:\/\/github\.com\/([^/]+)\/([^/?#]+)\/?$/);
  if (!m) return null;
  return { owner: m[1], repo: m[2].replace(/\.git$/, "") };
}

/**
 * Convert common URL patterns to their raw-text equivalents.
 * GitHub repo roots are handled separately by fetchGithubRepo().
 */
function normaliseUrl(url: string): string {
  // GitHub blob → raw content
  if (url.includes("github.com") && url.includes("/blob/")) {
    return url
      .replace("github.com", "raw.githubusercontent.com")
      .replace("/blob/", "/");
  }

  // GitHub gist
  if (url.includes("gist.github.com")) {
    return url; // gist pages render as HTML — handled by extractHtmlText
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

/**
 * Extract readable text from HTML.
 * Prioritises <main>, <article>, <section> content over navigation/footer noise.
 */
function extractHtmlText(html: string): string {
  // Remove noise blocks entirely
  let cleaned = html
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<nav[\s\S]*?<\/nav>/gi, "")
    .replace(/<footer[\s\S]*?<\/footer>/gi, "")
    .replace(/<header[\s\S]*?<\/header>/gi, "");

  // Try to isolate the main content block
  const mainMatch =
    cleaned.match(/<main[\s\S]*?<\/main>/i) ??
    cleaned.match(/<article[\s\S]*?<\/article>/i) ??
    cleaned.match(/<section[\s\S]*?<\/section>/i) ??
    cleaned.match(/<div[^>]+(?:id|class)=["'][^"']*(content|main|app|root|body)[^"']*["'][\s\S]*?<\/div>/i);

  const source = mainMatch ? mainMatch[0] : cleaned;

  return source
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g,  " ")
    .replace(/&amp;/g,   "&")
    .replace(/&lt;/g,    "<")
    .replace(/&gt;/g,    ">")
    .replace(/&#\d+;/g,  " ")
    .replace(/\s+/g,     " ")
    .trim();
}

// ── Gemini prompt ─────────────────────────────────────────────────────────

function buildPrompt(
  description: string,
  url: string,
  content: string
): string {
  return `You are a technical verifier for a freelance payment escrow. Your job is to judge whether the submitted work genuinely satisfies the milestone requirement and decide if USDC should be released.

MILESTONE REQUIREMENT:
${description}

SUBMITTED DELIVERABLE URL: ${url}
CONTENT FETCHED FROM DELIVERABLE:
---
${content}
---

IMPORTANT CONTEXT:
- The content above was automatically fetched from the submitted URL. For web apps it may be extracted HTML text; for GitHub repos it is the README. Judge the work based on what is present, not what is absent from the extracted text alone.
- If the URL is a deployed web app or live demo, its existence and the features visible in the extracted text are valid evidence of completion.
- Only score 0 if the URL is completely broken, the content is entirely empty, or the work is obviously unrelated to the requirement.

SCORING RUBRIC (0–100):
85–100 — Fully complete. Deliverable clearly satisfies the requirement.
65–84  — Mostly complete. Core requirement is met with minor gaps.
45–64  — Partially complete. Meaningful progress but significant parts are missing.
20–44  — Incomplete. Work started but does not satisfy the core requirement.
0–19   — Completely unrelated, empty, or inaccessible.

A score ≥ ${PASS_THRESHOLD} releases payment. Be fair — do not penalise work for limitations of automated text extraction from live apps.

Reply with ONLY valid JSON — no markdown, no text outside the JSON:
{
  "passed": true | false,
  "score": <integer 0-100>,
  "reasoning": "<3-5 sentences: describe what you found in the deliverable, how it relates to the requirement, and exactly what meets or falls short of the standard>"
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
    keyFindings: [],
  };
}
