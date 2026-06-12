import { ethers } from "ethers";
import * as fs from "fs";
import * as path from "path";
import { logger } from "./logger";

// ── Minimal human-readable ABIs ────────────────────────────────────────────
// Only the events and functions this agent actually calls

const ESCROW_ABI = [
  // Events
  "event MilestoneSubmitted(uint256 indexed jobId, uint256 indexed milestoneId, address indexed freelancer, string deliverableUrl, uint256 submittedAt)",
  "event MilestoneReleased(uint256 indexed jobId, uint256 indexed milestoneId, address indexed freelancer, uint256 amount)",
  "event MilestoneRejected(uint256 indexed jobId, uint256 indexed milestoneId, address indexed freelancer)",
  "event JobCompleted(uint256 indexed jobId, address indexed client, address indexed freelancer)",
  // Read
  "function getMilestone(uint256 jobId, uint256 milestoneId) external view returns (string description, uint256 amount, uint8 status, string deliverableUrl, uint256 submittedAt, uint256 releasedAt)",
  "function getJob(uint256 jobId) external view returns (uint256 id, address client, address freelancer, string title, string description, uint256 totalAmount, uint256 releasedAmount, uint8 status, uint256 createdAt, uint256 milestoneCount, bytes32 erc8004FreelancerId, bytes32 erc8004ClientId)",
  "function jobCounter() external view returns (uint256)",
  // Write (verifier only)
  "function releaseMilestone(uint256 jobId, uint256 milestoneId) external",
  "function rejectMilestone(uint256 jobId, uint256 milestoneId)  external",
];

const REPUTATION_ABI = [
  "function updateReputation(bytes32 agentId, uint256 jobId, uint256 milestoneId, bool wasPositive, string calldata notes) external",
];

// Mirror of MilestoneStatus enum in HermesEscrow.sol
export const MilestoneStatus = {
  Pending:   0n,
  Submitted: 1n,
  Verified:  2n,
  Released:  3n,
  Rejected:  4n,
} as const;

// ── Types ──────────────────────────────────────────────────────────────────

export interface SubmittedMilestone {
  jobId: number;
  milestoneId: number;
  description: string;
  deliverableUrl: string;
  amountRaw: bigint;       // USDC with 6 decimals
  freelancerAddress: string;
  erc8004FreelancerId: string; // bytes32 hex
}

// ── Address loading ────────────────────────────────────────────────────────

interface Addresses {
  hermesEscrow: string;
  hermesReputation: string;
}

function loadAddresses(): Addresses {
  const fromEnv: Partial<Addresses> = {
    hermesEscrow:     process.env.HERMES_ESCROW_ADDRESS,
    hermesReputation: process.env.HERMES_REPUTATION_ADDRESS,
  };

  if (fromEnv.hermesEscrow && fromEnv.hermesReputation) {
    return fromEnv as Addresses;
  }

  // Fall back to addresses.json written by the deploy script
  const jsonPath = path.resolve(__dirname, "contracts/addresses.json");
  if (fs.existsSync(jsonPath)) {
    const data = JSON.parse(fs.readFileSync(jsonPath, "utf8"));
    if (data.hermesEscrow && data.hermesReputation) return data;
  }

  throw new Error(
    "Contract addresses not found.\n" +
    "  Option 1: set HERMES_ESCROW_ADDRESS and HERMES_REPUTATION_ADDRESS in .env\n" +
    "  Option 2: run `npm run deploy` from the contracts/ folder first."
  );
}

// ── ContractCaller ─────────────────────────────────────────────────────────

export class ContractCaller {
  private provider: ethers.JsonRpcProvider;
  private signer:   ethers.Wallet;
  private escrow:   ethers.Contract;
  private reputation: ethers.Contract;

  constructor() {
    const rpcUrl     = process.env.FUJI_RPC_URL ?? "https://api.avax-test.network/ext/bc/C/rpc";
    const privateKey = process.env.PRIVATE_KEY;
    if (!privateKey) throw new Error("PRIVATE_KEY not set in .env");

    const addresses = loadAddresses();

    this.provider   = new ethers.JsonRpcProvider(rpcUrl);
    this.signer     = new ethers.Wallet(privateKey, this.provider);
    this.escrow     = new ethers.Contract(addresses.hermesEscrow,     ESCROW_ABI,     this.signer);
    this.reputation = new ethers.Contract(addresses.hermesReputation, REPUTATION_ABI, this.signer);

    logger.info(`Verifier wallet  : ${this.signer.address}`);
    logger.info(`HermesEscrow     : ${addresses.hermesEscrow}`);
    logger.info(`HermesReputation : ${addresses.hermesReputation}`);
    logger.info(`RPC              : ${rpcUrl}`);
  }

  // ── Chain helpers ──────────────────────────────────────────────────────────

  async getLatestBlock(): Promise<number> {
    return this.provider.getBlockNumber();
  }

  async getNetwork(): Promise<{ name: string; chainId: bigint }> {
    return this.provider.getNetwork();
  }

  // ── Event queries ──────────────────────────────────────────────────────────

  /**
   * Returns all milestones that are currently in Submitted status,
   * found by scanning MilestoneSubmitted events from `fromBlock` onward.
   */
  async getSubmittedMilestones(fromBlock: number): Promise<SubmittedMilestone[]> {
    const latestBlock = await this.provider.getBlockNumber();
    if (fromBlock > latestBlock) return [];

    logger.poll(`Scanning blocks ${fromBlock}–${latestBlock} for submissions…`);

    // Fuji public RPC caps eth_getLogs at 2048 blocks — chunk the range
    const CHUNK = 2048;
    const filter = this.escrow.filters.MilestoneSubmitted();
    const rawEvents: ethers.Log[] = [];
    for (let start = fromBlock; start <= latestBlock; start += CHUNK) {
      const end = Math.min(start + CHUNK - 1, latestBlock);
      const chunk = await this.escrow.queryFilter(filter, start, end);
      rawEvents.push(...chunk);
    }

    const results: SubmittedMilestone[] = [];

    for (const raw of rawEvents) {
      const ev = raw as ethers.EventLog;
      const jobId      = Number(ev.args.jobId);
      const milestoneId = Number(ev.args.milestoneId);

      try {
        const [milestone, job] = await Promise.all([
          this.escrow.getMilestone(jobId, milestoneId),
          this.escrow.getJob(jobId),
        ]);

        // Only process milestones still awaiting verification
        if (milestone.status !== MilestoneStatus.Submitted) continue;

        results.push({
          jobId,
          milestoneId,
          description:         milestone.description,
          deliverableUrl:      milestone.deliverableUrl || ev.args.deliverableUrl,
          amountRaw:           milestone.amount as bigint,
          freelancerAddress:   ev.args.freelancer as string,
          erc8004FreelancerId: job.erc8004FreelancerId as string,
        });
      } catch (err) {
        logger.error(`Could not fetch milestone ${jobId}-${milestoneId}`, err);
      }
    }

    return results;
  }

  /**
   * Returns true only if every milestone before `milestoneId` on this job
   * has been Released. Enforces sequential milestone completion.
   */
  async arePreviousMilestonesReleased(jobId: number, milestoneId: number): Promise<boolean> {
    for (let prevId = 0; prevId < milestoneId; prevId++) {
      try {
        const m = await this.escrow.getMilestone(jobId, prevId);
        if (Number(m.status) !== Number(MilestoneStatus.Released)) return false;
      } catch {
        return false; // treat fetch failure as not released
      }
    }
    return true;
  }

  /**
   * Checks current on-chain state across all jobs to find any milestone
   * currently in Submitted status — regardless of when it was submitted.
   * Used at startup to catch submissions older than the event scan window.
   */
  async getSubmittedMilestonesByState(): Promise<SubmittedMilestone[]> {
    const counter = Number(await this.escrow.jobCounter());
    const results: SubmittedMilestone[] = [];

    for (let jobId = 1; jobId <= counter; jobId++) {
      try {
        const job = await this.escrow.getJob(jobId);
        const milestoneCount = Number(job.milestoneCount);

        for (let mi = 0; mi < milestoneCount; mi++) {
          try {
            const milestone = await this.escrow.getMilestone(jobId, mi);
            if (milestone.status !== MilestoneStatus.Submitted) continue;

            results.push({
              jobId,
              milestoneId:         mi,
              description:         milestone.description as string,
              deliverableUrl:      milestone.deliverableUrl as string,
              amountRaw:           milestone.amount as bigint,
              freelancerAddress:   job.freelancer as string,
              erc8004FreelancerId: job.erc8004FreelancerId as string,
            });
          } catch {}
        }
      } catch {}
    }

    return results;
  }

  // ── Real-time listener ─────────────────────────────────────────────────────

  /**
   * Attach a callback to the MilestoneSubmitted contract event.
   * Fires as soon as each new submission lands on-chain.
   */
  listenForSubmissions(
    callback: (milestone: SubmittedMilestone) => void
  ): void {
    this.escrow.on(
      "MilestoneSubmitted",
      async (
        jobId: bigint,
        milestoneId: bigint,
        freelancer: string,
        deliverableUrl: string
      ) => {
        try {
          const [milestone, job] = await Promise.all([
            this.escrow.getMilestone(jobId, milestoneId),
            this.escrow.getJob(jobId),
          ]);

          callback({
            jobId:               Number(jobId),
            milestoneId:         Number(milestoneId),
            description:         milestone.description as string,
            deliverableUrl:      milestone.deliverableUrl as string || deliverableUrl,
            amountRaw:           milestone.amount as bigint,
            freelancerAddress:   freelancer,
            erc8004FreelancerId: job.erc8004FreelancerId as string,
          });
        } catch (err) {
          logger.error(
            `Event handler failed for ${jobId}-${milestoneId}`,
            err
          );
        }
      }
    );

    logger.success("Real-time MilestoneSubmitted listener active");
  }

  // ── Write functions ────────────────────────────────────────────────────────

  /**
   * Called by the agent after Gemini approves the deliverable.
   * Transfers USDC to the freelancer on-chain.
   */
  async releaseMilestonePayment(
    jobId: number,
    milestoneId: number
  ): Promise<string> {
    const tx = await this.escrow.releaseMilestone(jobId, milestoneId);
    const receipt = await tx.wait();
    return receipt.hash as string;
  }

  /**
   * Called by the agent after Gemini rejects the deliverable.
   * Resets milestone to Pending so the freelancer can resubmit.
   */
  async rejectMilestoneSubmission(
    jobId: number,
    milestoneId: number
  ): Promise<string> {
    const tx = await this.escrow.rejectMilestone(jobId, milestoneId);
    const receipt = await tx.wait();
    return receipt.hash as string;
  }

  /**
   * Updates the freelancer's on-chain reputation score.
   * Non-critical: failure is logged but does not abort the pipeline.
   */
  async updateAgentReputation(
    agentId: string,
    jobId: number,
    milestoneId: number,
    wasPositive: boolean,
    notes: string
  ): Promise<void> {
    if (agentId === ethers.ZeroHash) return;

    try {
      const tx = await this.reputation.updateReputation(
        agentId,
        jobId,
        milestoneId,
        wasPositive,
        notes.slice(0, 200) // keep calldata bounded
      );
      await tx.wait();
      logger.success(
        `Reputation updated — agent ${agentId.slice(0, 10)}… → ${wasPositive ? "+10" : "-20"} pts`
      );
    } catch (err) {
      logger.warn("Reputation update failed (non-critical) — " + String(err));
    }
  }
}
