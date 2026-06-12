import * as path from "path";
import * as dotenv from "dotenv";
// __dirname = Hermes/agent/src — so ../../.env = Hermes/.env
dotenv.config({ path: path.resolve(__dirname, "../../.env") });

import { ethers } from "ethers";
import { logger }        from "./logger";
import { ContractCaller, SubmittedMilestone } from "./contractCaller";
import { initGemini, verifyMilestone }        from "./verifier";
import { startX402Server }                    from "./x402Server";
import { verifyViax402 }                      from "./x402Client";

// ── Config ────────────────────────────────────────────────────────────────────

const POLL_INTERVAL_MS  = 5_000;   // 5 seconds
const SCAN_DEPTH_BLOCKS = 2_000;   // Fuji public RPC cap: 2048 blocks/getLogs call

// ── State ─────────────────────────────────────────────────────────────────────

// Tracks milestones currently being processed to prevent double-execution
const inFlight  = new Set<string>();
// Tracks milestones we've already finished (persists for session lifetime)
const completed = new Set<string>();

function milestoneKey(jobId: number, milestoneId: number): string {
  return `${jobId}-${milestoneId}`;
}

// ── Core pipeline ─────────────────────────────────────────────────────────────

/**
 * Full verification → payment pipeline for one milestone submission.
 *
 * Verification goes through the x402 server (pay-per-call AI verification).
 * Falls back to direct Gemini call if x402 server is unavailable.
 */
async function processSubmission(
  caller: ContractCaller,
  milestone: SubmittedMilestone
): Promise<void> {
  const key = milestoneKey(milestone.jobId, milestone.milestoneId);

  if (inFlight.has(key) || completed.has(key)) return;
  inFlight.add(key);

  try {
    logger.info(
      `Pipeline start — Job #${milestone.jobId} · Milestone #${milestone.milestoneId}`
    );
    logger.info(`Deliverable: ${milestone.deliverableUrl}`);

    // ── 0. Sequential enforcement ──────────────────────────────────────────
    if (milestone.milestoneId > 0) {
      const prereqsDone = await caller.arePreviousMilestonesReleased(
        milestone.jobId,
        milestone.milestoneId
      );
      if (!prereqsDone) {
        logger.warn(
          `Sequential hold — Job #${milestone.jobId} · Milestone #${milestone.milestoneId} ` +
          `cannot be verified until all previous milestones are released. Will retry next poll.`
        );
        inFlight.delete(key); // allow retry when prerequisites clear
        return;
      }
    }

    // ── 1. AI verification via x402 ────────────────────────────────────────
    let result;
    try {
      result = await verifyViax402(
        milestone.jobId,
        milestone.milestoneId,
        milestone.description,
        milestone.deliverableUrl
      );
    } catch (x402Err: any) {
      // If x402 server is unreachable, fall back to direct Gemini call
      if (
        String(x402Err).includes("not running") ||
        String(x402Err).includes("ECONNREFUSED")
      ) {
        logger.warn("x402 server unreachable — falling back to direct verification");
        try {
          result = await verifyMilestone(
            milestone.jobId,
            milestone.milestoneId,
            milestone.description,
            milestone.deliverableUrl
          );
        } catch (geminiErr) {
          logger.error("Direct Gemini verification also failed — will retry next poll", geminiErr);
          inFlight.delete(key);
          return;
        }
      } else {
        // Non-connection errors (bad payment, Gemini failure inside server) — retry next poll
        logger.error("x402 verification failed — will retry next poll", x402Err);
        inFlight.delete(key);
        return;
      }
    }

    logger.verdict(
      milestone.jobId,
      milestone.milestoneId,
      result.passed,
      result.score,
      result.reasoning,
      result.keyFindings
    );

    const amountUsdc    = ethers.formatUnits(milestone.amountRaw, 6);
    const reasonSnippet = result.reasoning.slice(0, 200);

    // ── 2. On-chain action ─────────────────────────────────────────────────
    // Reputation is updated automatically by the escrow contract on release/reject
    if (result.passed) {
      const txHash = await caller.releaseMilestonePayment(
        milestone.jobId,
        milestone.milestoneId
      );
      logger.release(milestone.jobId, milestone.milestoneId, amountUsdc, txHash);
    } else {
      const txHash = await caller.rejectMilestoneSubmission(
        milestone.jobId,
        milestone.milestoneId
      );
      logger.reject(
        milestone.jobId,
        milestone.milestoneId,
        txHash,
        result.reasoning
      );
    }

    completed.add(key);
  } catch (err) {
    logger.error(
      `Pipeline failed for ${key} — will not retry this session`,
      err
    );
    completed.add(key); // prevent retry loops on hard failures
  } finally {
    inFlight.delete(key);
  }
}

// ── Polling loop ──────────────────────────────────────────────────────────────

async function runPollCycle(caller: ContractCaller, fromBlock: number): Promise<number> {
  const latestBlock = await caller.getLatestBlock();

  const submissions = await caller.getSubmittedMilestones(fromBlock);

  if (submissions.length === 0) {
    logger.poll(`No pending submissions found (checked up to block ${latestBlock})`);
  } else {
    logger.info(`Found ${submissions.length} pending submission(s) — processing…`);
    await Promise.allSettled(
      submissions.map((m) => processSubmission(caller, m))
    );
  }

  return latestBlock + 1; // next poll starts from the next unscanned block
}

// ── Entry point ───────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  logger.banner();

  // ── 1. Start x402 verification server ────────────────────────────────────
  try {
    await startX402Server();
  } catch (err) {
    logger.error("x402 server failed to start — will use direct Gemini fallback", err);
  }

  // ── 1b. Keep-alive self-ping (Render free tier) ──────────────────────────
  const renderUrl = process.env.RENDER_EXTERNAL_URL;
  if (renderUrl) {
    setInterval(async () => {
      try {
        const res = await fetch(`${renderUrl}/health`);
        logger.info(`Keep-alive ping → ${res.status}`);
      } catch { /* ignore — GitHub Actions cron is the primary keep-alive */ }
    }, 9 * 60 * 1_000); // every 9 minutes
    logger.info(`Keep-alive enabled → ${renderUrl}/health`);
  }

  // ── 2. Connect to chain & contracts ──────────────────────────────────────
  let caller: ContractCaller;
  try {
    caller = new ContractCaller();
    const network = await caller.getNetwork();
    logger.success(`Connected — ${network.name} (chainId ${network.chainId})`);
  } catch (err) {
    logger.error("Failed to initialise contract caller", err);
    process.exit(1);
  }

  // ── 3. Verify Gemini connection ───────────────────────────────────────────
  try {
    await initGemini();
  } catch (err) {
    logger.error("Gemini connection failed", err);
    process.exit(1);
  }

  // ── 4. State scan — catch any Submitted milestones regardless of age ─────
  logger.info("Scanning current on-chain state for pending submissions…");
  try {
    const stateMilestones = await caller.getSubmittedMilestonesByState();
    if (stateMilestones.length > 0) {
      logger.info(`Found ${stateMilestones.length} submitted milestone(s) in state — processing…`);
      await Promise.allSettled(stateMilestones.map(m => processSubmission(caller, m)));
    } else {
      logger.info("No pending submissions in current state.");
    }
  } catch (err) {
    logger.error("State scan failed — continuing with event scan", err);
  }

  // ── 5. Event scan — catch any submissions since last known block ──────────
  const latestBlock = await caller.getLatestBlock();
  const scanFrom    = Math.max(0, latestBlock - SCAN_DEPTH_BLOCKS);

  logger.info(`Running event scan from block ${scanFrom}…`);
  let nextPollBlock = await runPollCycle(caller, scanFrom);

  // ── 6. Polling loop ───────────────────────────────────────────────────────
  logger.info(`Polling every ${POLL_INTERVAL_MS / 1000}s for new submissions…`);
  console.log();

  const tick = async () => {
    try {
      nextPollBlock = await runPollCycle(caller, nextPollBlock);
    } catch (err) {
      logger.error("Poll cycle error", err);
    } finally {
      setTimeout(tick, POLL_INTERVAL_MS);
    }
  };

  setTimeout(tick, POLL_INTERVAL_MS);
}

// ── Graceful shutdown ─────────────────────────────────────────────────────────

process.on("SIGINT",  () => { logger.info("Shutting down — HERMES rests."); process.exit(0); });
process.on("SIGTERM", () => { logger.info("Shutting down — HERMES rests."); process.exit(0); });

process.on("unhandledRejection", (reason) => {
  logger.error("Unhandled promise rejection", reason);
});

main().catch((err) => {
  logger.error("Fatal startup error", err);
  process.exit(1);
});
