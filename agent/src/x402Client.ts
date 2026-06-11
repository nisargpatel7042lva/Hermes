/**
 * HERMES x402 Client
 *
 * Calls the local x402 verification server, handles the 402 payment flow,
 * pays USDC on Avalanche Fuji, and returns the verification verdict.
 *
 * Flow:
 *   1. POST /verify (no payment)
 *   2. Receive 402 + parse payment requirements
 *   3. Transfer USDC on-chain to payTo address
 *   4. Wait for tx confirmation
 *   5. POST /verify with X-Payment: base64({ from, txHash })
 *   6. Return { passed, score, reasoning }
 */

import axios from "axios";
import { ethers } from "ethers";
import { logger } from "./logger";
import type { VerificationResult } from "./verifier";
import { X402_PORT } from "./x402Server";

// ── Config ────────────────────────────────────────────────────────────────────

const USDC_ADDRESS = "0x5425890298aed601595a70AB815c96711a31Bc65";
const USDC_ABI     = [
  "function transfer(address to, uint256 amount) external returns (bool)",
  "function balanceOf(address account) external view returns (uint256)",
];

function getAgentWallet(): ethers.Wallet {
  const rpc = process.env.FUJI_RPC_URL ?? "https://api.avax-test.network/ext/bc/C/rpc";
  const pk  = process.env.PRIVATE_KEY;
  if (!pk) throw new Error("PRIVATE_KEY not set");
  const key = pk.startsWith("0x") ? pk : `0x${pk}`;
  return new ethers.Wallet(key, new ethers.JsonRpcProvider(rpc));
}

// ── Types ─────────────────────────────────────────────────────────────────────

interface X402PaymentRequired {
  maxAmountRequired: string;
  payTo:             string;
  asset:             string;
  network:           string;
  description:       string;
}

interface X402VerifyBody {
  jobId:                number;
  milestoneId:          number;
  milestoneDescription: string;
  deliverableUrl:       string;
}

// ── Main x402 call ────────────────────────────────────────────────────────────

export async function verifyViax402(
  jobId:                number,
  milestoneId:          number,
  milestoneDescription: string,
  deliverableUrl:       string
): Promise<VerificationResult> {
  const serverUrl = `http://localhost:${X402_PORT}/verify`;
  const body: X402VerifyBody = { jobId, milestoneId, milestoneDescription, deliverableUrl };

  logger.info(`x402: calling verification server — ${serverUrl}`);

  // ── Step 1: Initial call (expect 402) ─────────────────────────────────────
  let paymentRequirements: X402PaymentRequired;

  try {
    const probe = await axios.post(serverUrl, body, {
      validateStatus: () => true, // don't throw on 402
    });

    if (probe.status === 200) {
      // Server skipped payment gate (shouldn't happen, but handle gracefully)
      logger.warn("x402: server returned 200 without payment — unexpected");
      return extractVerdict(probe.data);
    }

    if (probe.status !== 402) {
      throw new Error(`x402: unexpected status ${probe.status} on probe: ${JSON.stringify(probe.data)}`);
    }

    // Decode X-Payment-Required header
    const encoded = probe.headers["x-payment-required"];
    if (!encoded) throw new Error("x402: 402 response missing X-Payment-Required header");

    paymentRequirements = JSON.parse(
      Buffer.from(encoded as string, "base64").toString("utf8")
    ) as X402PaymentRequired;

    logger.info(`x402: payment required — ${Number(paymentRequirements.maxAmountRequired) / 1_000_000} USDC → ${paymentRequirements.payTo}`);
  } catch (err: any) {
    if (err.code === "ECONNREFUSED") {
      throw new Error(`x402: verification server not running on port ${X402_PORT}`);
    }
    throw err;
  }

  // ── Step 2: Pay USDC on Fuji ───────────────────────────────────────────────
  const wallet    = getAgentWallet();
  const usdc      = new ethers.Contract(USDC_ADDRESS, USDC_ABI, wallet);
  const amountRaw = BigInt(paymentRequirements.maxAmountRequired);
  const payTo     = paymentRequirements.payTo;

  // Pre-flight balance check
  const balance: bigint = await usdc.balanceOf(wallet.address);
  const priceUsdc = (Number(amountRaw) / 1_000_000).toFixed(2);
  if (balance < amountRaw) {
    throw new Error(
      `x402: insufficient USDC for verification fee. ` +
      `Have: ${(Number(balance) / 1_000_000).toFixed(2)}, ` +
      `Need: ${priceUsdc}. ` +
      `Get test USDC at https://faucet.circle.com/`
    );
  }

  logger.info(`x402: paying ${priceUsdc} USDC from ${wallet.address.slice(0, 10)}… → ${payTo.slice(0, 10)}…`);

  let txHash: string;
  try {
    const tx      = await usdc.transfer(payTo, amountRaw);
    const receipt = await tx.wait();
    txHash        = receipt.hash as string;
    logger.success(`x402: payment confirmed — tx ${txHash.slice(0, 14)}…`);
  } catch (err: any) {
    throw new Error(`x402: USDC transfer failed — ${err?.reason ?? err?.message ?? String(err)}`);
  }

  // ── Step 3: Build payment proof and retry ─────────────────────────────────
  const proof = {
    x402Version: 1,
    scheme:      "exact",
    network:     paymentRequirements.network,
    payload: {
      authorization: {
        from:  wallet.address,
        to:    payTo,
        value: amountRaw.toString(),
      },
      txHash,
    },
    from:    wallet.address,
    txHash,
    payer:   wallet.address,
  };

  const paymentHeader = Buffer.from(JSON.stringify(proof)).toString("base64");

  logger.info("x402: retrying with payment proof…");

  const verified = await axios.post(serverUrl, body, {
    headers:        { "X-Payment": paymentHeader },
    validateStatus: () => true,
  });

  if (verified.status !== 200) {
    throw new Error(
      `x402: server rejected payment proof — ${verified.status}: ${JSON.stringify(verified.data)}`
    );
  }

  // Log the payment receipt from response header
  const receiptHeader = verified.headers["x-payment-response"];
  if (receiptHeader) {
    try {
      const receipt = JSON.parse(Buffer.from(receiptHeader as string, "base64").toString("utf8"));
      logger.success(`x402: receipt — paid ${Number(receipt.amount) / 1_000_000} USDC, paymentTx: ${receipt.paymentTx?.slice(0, 14)}…`);
    } catch {}
  }

  return extractVerdict(verified.data);
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function extractVerdict(data: any): VerificationResult {
  return {
    passed:      Boolean(data.passed),
    score:       Number(data.score ?? 0),
    reasoning:   String(data.reasoning ?? ""),
    keyFindings: [],
  };
}
