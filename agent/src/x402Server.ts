/**
 * HERMES x402 Verification Server
 *
 * An HTTP server that puts AI milestone verification behind the x402 payment
 * protocol. Any agent with USDC on Avalanche Fuji can call POST /verify,
 * pay 0.10 USDC, and receive a Gemini-powered pass/fail verdict.
 *
 * Protocol flow:
 *   1. POST /verify (no payment)   → 402 + X-Payment-Required header
 *   2. Agent pays USDC on-chain
 *   3. POST /verify + X-Payment    → 200 + verdict + X-Payment-Response header
 */

import express, { Request, Response, NextFunction } from "express";
import cors from "cors";
import { ethers } from "ethers";
import { verifyMilestone } from "./verifier";
import { logger } from "./logger";

// ── Config ────────────────────────────────────────────────────────────────────

export const X402_PORT      = Number(process.env.X402_PORT ?? 3001);
const PRICE_USDC            = parseFloat(process.env.X402_PRICE_USDC ?? "0.10");
const PRICE_RAW             = BigInt(Math.round(PRICE_USDC * 1_000_000)); // 6 decimals
const RPC                   = process.env.FUJI_RPC_URL ?? "https://api.avax-test.network/ext/bc/C/rpc";
const USDC_ADDRESS          = "0x5425890298aed601595a70AB815c96711a31Bc65";
const CHAIN_ID              = "eip155:43113"; // Avalanche Fuji

// Address that receives verification fees.
// Priority: X402_PAY_TO env var → derived from PRIVATE_KEY
export function getPayToAddress(): string {
  if (process.env.X402_PAY_TO) return process.env.X402_PAY_TO;
  const pk = process.env.PRIVATE_KEY;
  if (!pk) throw new Error("PRIVATE_KEY not set and X402_PAY_TO not set");
  const key = pk.startsWith("0x") ? pk : `0x${pk}`;
  return new ethers.Wallet(key).address;
}

const USDC_ABI = [
  "event Transfer(address indexed from, address indexed to, uint256 value)",
];

// In-memory set of used transfer tx hashes to prevent payment replay
const usedTxHashes = new Set<string>();

// ── Activity log (shown on frontend) ─────────────────────────────────────────

export interface ActivityEvent {
  id:          string;
  jobId:       number;
  milestoneId: number;
  stage:       "payment_received" | "verifying" | "verdict";
  passed?:     boolean;
  score?:      number;
  reasoning?:  string;
  paymentTx?:  string;
  paidFrom?:   string;
  paidAmount:  string;
  timestamp:   number;
}

const activityLog: ActivityEvent[] = [];
const MAX_ACTIVITY = 20;

export function logActivity(event: ActivityEvent): void {
  activityLog.unshift(event); // newest first
  if (activityLog.length > MAX_ACTIVITY) activityLog.pop();
}

// ── Payment requirements builder ──────────────────────────────────────────────

function buildPaymentRequired(resource: string, payTo: string) {
  return {
    x402Version:       1,
    scheme:            "exact",
    network:           CHAIN_ID,
    maxAmountRequired: PRICE_RAW.toString(),
    resource,
    description:       `HERMES AI milestone verification — ${PRICE_USDC} USDC per call`,
    mimeType:          "application/json",
    payTo,
    maxTimeoutSeconds: 300,
    asset:             USDC_ADDRESS,
    extra:             { name: "USD Coin", decimals: 6 },
  };
}

// ── On-chain payment verifier ─────────────────────────────────────────────────

async function verifyPaymentOnChain(
  fromAddress: string,
  payTo: string,
  txHash?: string
): Promise<{ valid: boolean; foundTxHash: string | null }> {
  try {
    const provider = new ethers.JsonRpcProvider(RPC);
    const usdc     = new ethers.Contract(USDC_ADDRESS, USDC_ABI, provider);

    const latest = await provider.getBlockNumber();
    const from   = Math.max(0, latest - 500); // last ~40 minutes on Fuji

    // If caller provided a specific tx hash, verify it directly
    if (txHash) {
      const receipt = await provider.getTransactionReceipt(txHash);
      if (!receipt) return { valid: false, foundTxHash: null };

      const filter = usdc.filters.Transfer(fromAddress, payTo);
      const events = await usdc.queryFilter(filter, receipt.blockNumber, receipt.blockNumber);
      const match  = events.find(
        (e: any) => e.transactionHash === txHash && BigInt(e.args?.value ?? 0) >= PRICE_RAW
      );

      if (!match) return { valid: false, foundTxHash: null };
      if (usedTxHashes.has(txHash)) {
        logger.warn(`x402: replay attempt detected — tx ${txHash.slice(0, 14)}… already used`);
        return { valid: false, foundTxHash: null };
      }

      usedTxHashes.add(txHash);
      return { valid: true, foundTxHash: txHash };
    }

    // Otherwise scan recent blocks for any qualifying transfer
    const filter = usdc.filters.Transfer(fromAddress, payTo);
    const events = await usdc.queryFilter(filter, from, latest);

    for (const e of events as any[]) {
      const value = BigInt(e.args?.value ?? 0);
      if (value >= PRICE_RAW && !usedTxHashes.has(e.transactionHash)) {
        usedTxHashes.add(e.transactionHash);
        return { valid: true, foundTxHash: e.transactionHash };
      }
    }

    return { valid: false, foundTxHash: null };
  } catch (err) {
    logger.error("x402: on-chain payment check failed", err);
    return { valid: false, foundTxHash: null };
  }
}

// ── Request body type ─────────────────────────────────────────────────────────

interface VerifyBody {
  jobId:                number;
  milestoneId:          number;
  milestoneDescription: string;
  deliverableUrl:       string;
}

// ── x402 middleware ───────────────────────────────────────────────────────────

function makeX402Gate(payTo: string) {
  return async function x402Gate(req: Request, res: Response, next: NextFunction) {
    const paymentHeader = req.headers["x-payment"] as string | undefined;

    if (!paymentHeader) {
      const requirements = buildPaymentRequired(
        `http://localhost:${X402_PORT}${req.path}`,
        payTo
      );
      const encoded = Buffer.from(JSON.stringify(requirements)).toString("base64");
      logger.info(`x402: 402 issued for ${req.path} — ${PRICE_USDC} USDC required`);

      return res
        .status(402)
        .header("X-Payment-Required", encoded)
        .json({
          error:       "Payment Required",
          x402Version: 1,
          message:     `This endpoint costs ${PRICE_USDC} USDC per call on Avalanche Fuji.`,
          payTo,
          asset:       USDC_ADDRESS,
          amount:      PRICE_RAW.toString(),
          network:     CHAIN_ID,
          details:     requirements,
        });
    }

    // Decode payment proof
    let proof: any;
    try {
      proof = JSON.parse(Buffer.from(paymentHeader, "base64").toString("utf8"));
    } catch {
      return res.status(400).json({ error: "Invalid X-Payment header — expected base64-encoded JSON" });
    }

    // Extract payer address + optional tx hash from proof
    const fromAddress: string | undefined =
      proof?.payload?.authorization?.from ??
      proof?.from ??
      proof?.payer;

    const txHash: string | undefined =
      proof?.payload?.txHash ??
      proof?.txHash;

    if (!fromAddress || !ethers.isAddress(fromAddress)) {
      return res.status(400).json({
        error: "X-Payment proof must include a valid `from` address",
        expected: "{ from: '0x...', txHash: '0x...' }",
      });
    }

    logger.info(`x402: verifying payment from ${fromAddress.slice(0, 10)}…`);
    const { valid, foundTxHash } = await verifyPaymentOnChain(
      fromAddress.toLowerCase(),
      payTo.toLowerCase(),
      txHash
    );

    if (!valid) {
      const requirements = buildPaymentRequired(
        `http://localhost:${X402_PORT}${req.path}`,
        payTo
      );
      return res
        .status(402)
        .header("X-Payment-Required", Buffer.from(JSON.stringify(requirements)).toString("base64"))
        .json({
          error:   "Payment Not Verified",
          message: `Could not find a USDC transfer of ≥${PRICE_USDC} USDC from ${fromAddress} to ${payTo} in recent blocks.`,
          tip:     "Ensure your transfer is confirmed on Fuji before retrying.",
        });
    }

    logger.success(`x402: payment verified ✓  tx ${foundTxHash?.slice(0, 14)}… from ${fromAddress.slice(0, 10)}…`);
    (req as any).payerAddress  = fromAddress;
    (req as any).paymentTxHash = foundTxHash;

    // Log payment received — visible on frontend before Gemini runs
    const body = req.body as { jobId?: number; milestoneId?: number };
    logActivity({
      id:          `${body.jobId}-${body.milestoneId}-payment-${Date.now()}`,
      jobId:       body.jobId ?? 0,
      milestoneId: body.milestoneId ?? 0,
      stage:       "payment_received",
      paymentTx:   foundTxHash ?? undefined,
      paidFrom:    fromAddress,
      paidAmount:  `${PRICE_USDC} USDC`,
      timestamp:   Date.now(),
    });

    next();
  };
}

// ── App factory ───────────────────────────────────────────────────────────────

export async function startX402Server(): Promise<void> {
  const payTo = getPayToAddress();
  const gate  = makeX402Gate(payTo);

  const app = express();
  app.use(cors());
  app.use(express.json());

  // ── GET / ───────────────────────────────────────────────────────────────────
  app.get("/", (_req, res) => {
    res.json({
      service:     "HERMES x402 Verification Server",
      protocol:    "x402 — HTTP 402 Payment Protocol",
      network:     CHAIN_ID,
      price:       `${PRICE_USDC} USDC per verification`,
      payTo,
      asset:       USDC_ADDRESS,
      endpoints: {
        "GET  /":       "this page",
        "GET  /health": "service status",
        "GET  /verify": "endpoint description",
        "POST /verify": `${PRICE_USDC} USDC — AI milestone verification (x402 gated)`,
      },
      howItWorks: [
        "1. POST /verify without X-Payment  →  402 + payment requirements",
        `2. Transfer ${PRICE_USDC} USDC to payTo address on Fuji`,
        "3. POST /verify with X-Payment: base64(proof)  →  200 + verdict",
      ],
    });
  });

  // ── GET /health ─────────────────────────────────────────────────────────────
  app.get("/health", (_req, res) => {
    res.json({
      status:    "online",
      service:   "HERMES x402 Verification Server",
      protocol:  "x402",
      price:     `${PRICE_USDC} USDC`,
      payTo,
      asset:     USDC_ADDRESS,
      network:   CHAIN_ID,
      endpoints: {
        "POST /verify": `${PRICE_USDC} USDC — AI milestone verification (x402 gated)`,
        "GET  /health": "free — service status",
        "GET  /verify": "free — endpoint description",
      },
    });
  });

  // ── GET /verify (describe endpoint, free) ───────────────────────────────────
  app.get("/verify", (_req, res) => {
    res.json({
      endpoint:    "POST /verify",
      protocol:    "x402",
      description: "AI-powered milestone verification for HERMES escrow contracts",
      price:       `${PRICE_USDC} USDC per call`,
      payTo,
      asset:       USDC_ADDRESS,
      network:     CHAIN_ID,
      body: {
        jobId:                "number — job ID from HermesEscrow",
        milestoneId:          "number — milestone index",
        milestoneDescription: "string — what the milestone requires",
        deliverableUrl:       "string — URL submitted by freelancer",
      },
      paymentFlow: [
        "1. POST /verify without X-Payment → 402 + X-Payment-Required header",
        `2. Transfer ${PRICE_USDC} USDC to ${payTo} on Fuji (chainId 43113)`,
        '3. POST /verify with X-Payment: base64({ from: "0x...", txHash: "0x..." })',
        "4. Receive verdict: { passed, score, reasoning }",
      ],
    });
  });

  // ── GET /activity (public — live x402 event feed for frontend) ────────────
  app.get("/activity", (_req, res) => {
    res.json({ events: activityLog });
  });

  // ── POST /verify (x402 gated) ───────────────────────────────────────────────
  app.post("/verify", gate, async (req: Request, res: Response) => {
    const { jobId, milestoneId, milestoneDescription, deliverableUrl } = req.body as VerifyBody;

    if (
      typeof jobId !== "number"              ||
      typeof milestoneId !== "number"        ||
      typeof milestoneDescription !== "string" ||
      typeof deliverableUrl !== "string"
    ) {
      return res.status(400).json({
        error:    "Invalid request body",
        required: {
          jobId:                "number",
          milestoneId:          "number",
          milestoneDescription: "string",
          deliverableUrl:       "string",
        },
      });
    }

    try {
      logger.info(`x402/verify: Job #${jobId} · Milestone #${milestoneId}`);

      // Log "verifying" stage
      logActivity({
        id:          `${jobId}-${milestoneId}-verifying-${Date.now()}`,
        jobId,
        milestoneId,
        stage:       "verifying",
        paymentTx:   (req as any).paymentTxHash ?? undefined,
        paidFrom:    (req as any).payerAddress,
        paidAmount:  `${PRICE_USDC} USDC`,
        timestamp:   Date.now(),
      });

      const result = await verifyMilestone(
        jobId,
        milestoneId,
        milestoneDescription,
        deliverableUrl
      );

      // Log final verdict
      logActivity({
        id:          `${jobId}-${milestoneId}-verdict-${Date.now()}`,
        jobId,
        milestoneId,
        stage:       "verdict",
        passed:      result.passed,
        score:       result.score,
        reasoning:   result.reasoning,
        paymentTx:   (req as any).paymentTxHash ?? undefined,
        paidFrom:    (req as any).payerAddress,
        paidAmount:  `${PRICE_USDC} USDC`,
        timestamp:   Date.now(),
      });

      const paymentReceipt = {
        x402Version: 1,
        paid:        true,
        amount:      PRICE_RAW.toString(),
        asset:       USDC_ADDRESS,
        network:     CHAIN_ID,
        paidTo:      payTo,
        paidFrom:    (req as any).payerAddress,
        paymentTx:   (req as any).paymentTxHash,
      };

      return res
        .status(200)
        .header("X-Payment-Response", Buffer.from(JSON.stringify(paymentReceipt)).toString("base64"))
        .json({
          jobId,
          milestoneId,
          passed:      result.passed,
          score:       result.score,
          reasoning:   result.reasoning,
          verifiedBy:  "HERMES AI (Gemini 2.5 Flash)",
          paidAmount:  `${PRICE_USDC} USDC`,
          paymentTx:   (req as any).paymentTxHash,
          erc8004:     "Identity and reputation updated on-chain post-settlement",
        });
    } catch (err) {
      logger.error("x402/verify: internal error", err);
      return res.status(500).json({
        error:  "Verification service error",
        detail: String(err),
      });
    }
  });

  await new Promise<void>((resolve) => {
    app.listen(X402_PORT, () => {
      console.log();
      logger.success(`x402 server   → http://localhost:${X402_PORT}`);
      logger.info(`  POST /verify   costs ${PRICE_USDC} USDC (x402)`);
      logger.info(`  Pay to         ${payTo}`);
      logger.info(`  Asset          USDC on Avalanche Fuji`);
      logger.info(`  Network        ${CHAIN_ID}`);
      console.log();
      resolve();
    });
  });
}
