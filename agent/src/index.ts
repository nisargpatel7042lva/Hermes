import * as path from "path";
import * as dotenv from "dotenv";
// __dirname = Hermes/agent/src — so ../../.env = Hermes/.env
dotenv.config({ path: path.resolve(__dirname, "../../.env") });

import { ethers } from "ethers";
import { logger }        from "./logger";
import { ContractCaller, SubmittedMilestone } from "./contractCaller";
import { initGemini, verifyMilestone }        from "./verifier";

// ── Config ────────────────────────────────────────────────────────────────

const POLL_INTERVAL_MS = 5_000;   // 5 seconds
const SCAN_DEPTH_BLOCKS = 2_000;  // Fuji public RPC cap: 2048 blocks/getLogs call

// ── State ─────────────────────────────────────────────────────────────────

// Tracks milestones currently being processed to prevent double-execution
const inFlight  = new Set<string>();
// Tracks milestones we've already finished (persists for session lifetime)
const completed = new Set<string>();

function milestoneKey(jobId: number, milestoneId: number): string {
  return `${jobId}-${milestoneId}`;
}

// ── Core pipeline ─────────────────────────────────────────────────────────

/**
 * Full verification → payment pipeline for one milestone submission.
 * Idempotent: ignores milestones already in-flight or completed this session.
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

    // ── 1. AI verification ─────────────────────────────────────────────────
    let result;
    try {
      result = await verifyMilestone(
        milestone.jobId,
        milestone.milestoneId,
        milestone.description,
        milestone.deliverableUrl
      );
    } catch (err) {
      // Gemini failure: skip this cycle, retry on next poll
      logger.error("Gemini verification failed — will retry next poll", err);
      inFlight.delete(key);
      return;
    }

    logger.verdict(
      milestone.jobId,
      milestone.milestoneId,
      result.passed,
      result.score,
      result.reasoning,
      result.keyFindings
    );

    const amountUsdc = ethers.formatUnits(milestone.amountRaw, 6);
    const reasonSnippet = result.reasoning.slice(0, 200);

    // ── 2. On-chain action ─────────────────────────────────────────────────
    if (result.passed) {
      const txHash = await caller.releaseMilestonePayment(
        milestone.jobId,
        milestone.milestoneId
      );
      logger.release(milestone.jobId, milestone.milestoneId, amountUsdc, txHash);

      // Fire-and-forget: reputation update must not delay payment
      caller.updateAgentReputation(
        milestone.erc8004FreelancerId,
        milestone.jobId,
        milestone.milestoneId,
        true,
        `Verified by HERMES. Score ${result.score}/100. ${reasonSnippet}`
      ).catch(err => logger.warn("Reputation update failed: " + String(err)));
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

      caller.updateAgentReputation(
        milestone.erc8004FreelancerId,
        milestone.jobId,
        milestone.milestoneId,
        false,
        `Rejected by HERMES. Score ${result.score}/100. ${reasonSnippet}`
      ).catch(err => logger.warn("Reputation update failed: " + String(err)));
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

// ── Polling loop ──────────────────────────────────────────────────────────

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

// ── Entry point ───────────────────────────────────────────────────────────

async function main(): Promise<void> {
  logger.banner();

  // ── 1. Connect to chain & contracts ───────────────────────────────────────
  let caller: ContractCaller;
  try {
    caller = new ContractCaller();
    const network = await caller.getNetwork();
    logger.success(`Connected — ${network.name} (chainId ${network.chainId})`);
  } catch (err) {
    logger.error("Failed to initialise contract caller", err);
    process.exit(1);
  }

  // ── 2. Verify Gemini connection ───────────────────────────────────────────
  try {
    await initGemini();
  } catch (err) {
    logger.error("Gemini connection failed", err);
    process.exit(1);
  }

  // ── 3. Initial scan — catch any submissions that landed before we started ─
  const latestBlock = await caller.getLatestBlock();
  const scanFrom    = Math.max(0, latestBlock - SCAN_DEPTH_BLOCKS);

  logger.info(`Running initial scan from block ${scanFrom}…`);
  let nextPollBlock = await runPollCycle(caller, scanFrom);

  // ── 4. Polling loop — Fuji public RPC doesn't support persistent eth_newFilter
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

// ── Graceful shutdown ──────────────────────────────────────────────────────

process.on("SIGINT",  () => { logger.info("Shutting down — HERMES rests."); process.exit(0); });
process.on("SIGTERM", () => { logger.info("Shutting down — HERMES rests."); process.exit(0); });

process.on("unhandledRejection", (reason) => {
  logger.error("Unhandled promise rejection", reason);
});

main().catch((err) => {
  logger.error("Fatal startup error", err);
  process.exit(1);
});
