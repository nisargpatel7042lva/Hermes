import axios from "axios";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { logger } from "./logger";

// ── Config ────────────────────────────────────────────────────────────────

const MODEL_NAME         = "gemini-2.5-flash";
export const PASS_THRESHOLD = 60;   // minimum score to auto-release payment
const MAX_CONTENT        = 8_000;   // chars sent to Gemini — enough for full README, code, docs
const FETCH_TIMEOUT      = 8_000;   // ms
const MIN_CONTENT_CHARS  = 150;     // below this the deliverable is uninspectable → auto-reject

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

  // ── Step 1b: Minimum-content gate ───────────────────────────────────────
  if (content.trim().length < MIN_CONTENT_CHARS) {
    logger.warn(`Content too sparse (${content.trim().length} chars) — auto-rejecting`);
    return {
      passed:      false,
      score:       0,
      reasoning:   `The submitted URL returned only ${content.trim().length} characters of readable content — not enough to verify any work. Make sure your link is publicly accessible and contains your actual deliverable.`,
      keyFindings: ["Content too sparse to evaluate"],
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
 * GitHub repo roots: fetch README (multi-branch fallback) + file tree.
 * The file tree makes it hard to pass off an unrelated repo as relevant work.
 */
async function fetchGithubRepo(owner: string, repo: string): Promise<string> {
  const branches = ["main", "master", "develop"];
  const readmes  = ["README.md", "readme.md", "README.rst", "README.txt"];

  let readmeText = "";
  let usedBranch = "";

  outer: for (const branch of branches) {
    for (const readme of readmes) {
      const rawUrl = `https://raw.githubusercontent.com/${owner}/${repo}/${branch}/${readme}`;
      try {
        const res = await axios.get<string>(rawUrl, {
          timeout:        FETCH_TIMEOUT,
          responseType:   "text",
          validateStatus: () => true,
          headers:        { "User-Agent": "HERMES-Verification-Agent/1.0" },
        });
        if (res.status === 200 && res.data) {
          readmeText  = typeof res.data === "string" ? res.data : JSON.stringify(res.data);
          usedBranch  = branch;
          logger.info(`  GitHub → ${branch}/${readme} (${readmeText.length} chars)`);
          break outer;
        }
      } catch { /* try next */ }
    }
  }

  if (!readmeText) {
    throw new Error(
      `GitHub repo ${owner}/${repo}: no README found on main/master/develop branches`
    );
  }

  // Fetch the file tree — gives Gemini structural evidence of what's actually in the repo
  const fileTree = await fetchGithubFileTree(owner, repo, usedBranch);

  // README first (most descriptive), file tree after
  const combined = (readmeText + (fileTree ? `\n\n${fileTree}` : "")).slice(0, MAX_CONTENT);
  logger.info(`  Combined content: ${combined.length} chars`);
  logger.info(`  Content preview: ${combined.slice(0, 120).replace(/\n/g, " ")}…`);
  return combined;
}

/**
 * Fetch the flat file listing for a repo via the GitHub Trees API.
 * Returns a formatted string like "REPO FILE STRUCTURE:\n  src/index.ts\n  ..."
 * Falls back silently to "" on any error (unauthenticated rate limit, private repo, etc.).
 */
async function fetchGithubFileTree(owner: string, repo: string, branch: string): Promise<string> {
  try {
    const apiUrl = `https://api.github.com/repos/${owner}/${repo}/git/trees/${branch}?recursive=1`;
    const res = await axios.get(apiUrl, {
      timeout:        FETCH_TIMEOUT,
      validateStatus: () => true,
      headers: {
        "User-Agent": "HERMES-Verification-Agent/1.0",
        Accept:       "application/vnd.github.v3+json",
      },
    });

    if (res.status !== 200 || !Array.isArray(res.data?.tree)) return "";

    const files = (res.data.tree as { type: string; path: string }[])
      .filter(f => f.type === "blob")
      .map(f => `  ${f.path}`)
      .slice(0, 80)          // cap at 80 files to stay within MAX_CONTENT
      .join("\n");

    return `REPO FILE STRUCTURE (${owner}/${repo} · ${branch} branch):\n${files}`;
  } catch {
    return "";
  }
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
  return `You are a strict but fair payment verifier for a freelance escrow on Avalanche blockchain. USDC is released only when you can cite real evidence that the submitted work satisfies the milestone.

═══════════════════════════════════════
MILESTONE REQUIREMENT
═══════════════════════════════════════
${description}

═══════════════════════════════════════
SUBMITTED DELIVERABLE
URL: ${url}
FETCHED CONTENT:
---
${content}
---
═══════════════════════════════════════

VERIFICATION PROCESS — follow every step:

STEP 1 · REQUIREMENT BREAKDOWN
Read the milestone requirement and list every concrete, measurable outcome it demands.
Examples: "a deployed smart contract", "REST API with /login endpoint", "dashboard showing X metric".
Be specific — vague requirements like "good code" do not count.

STEP 2 · EVIDENCE CHECK
For each requirement you identified, search the fetched content for direct evidence.
- For a GitHub repo, the README and file structure tell you what the repo actually contains.
- For a deployed app, the extracted page text shows what features are visible.
- For each requirement: either quote the specific evidence you found, or write "NOT FOUND".
- Do NOT infer or assume work was done. Only what is explicitly present counts.

STEP 3 · RELEVANCE CHECK
Ask: is this deliverable related to this milestone at all, or is it from a different project / topic?
If the content is clearly unrelated (e.g. a random website, a different project, unrelated GitHub repo),
the score MUST be ≤ 15 regardless of content quality.

STEP 4 · SCORING
Count how many requirements have real evidence vs. how many are NOT FOUND:
  All evidenced          → 85–100
  Most evidenced         → 65–84
  About half evidenced   → 45–64
  Few evidenced          → 20–44
  None / unrelated       → 0–19

A score ≥ ${PASS_THRESHOLD} releases USDC to the freelancer.
Be rigorous: a high score requires citing evidence, not guessing.

Reply with ONLY valid JSON — absolutely no text outside the JSON object:
{
  "passed": true | false,
  "score": <integer 0–100>,
  "reasoning": "<Your findings from steps 1–4: list the requirements, state the evidence found or NOT FOUND for each, note relevance, explain the score>"
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
