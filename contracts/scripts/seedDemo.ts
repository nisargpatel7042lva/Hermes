/**
 * seedDemo.ts — Populates HERMES with demo data for hackathon presentation.
 *
 * Prerequisites:
 *   1. Run deploy script first: npm run deploy (or deploy:local)
 *   2. On Fuji: client wallet needs Fuji USDC (faucet: https://faucet.circle.com)
 *   3. On Fuji: second wallet acts as freelancer (fund with AVAX from https://faucet.avax.network)
 *
 * Usage:
 *   Local:  npx hardhat run scripts/seedDemo.ts --network localhost
 *   Fuji:   npx hardhat run scripts/seedDemo.ts --network fuji
 */
import { ethers } from "hardhat";
import * as fs from "fs";
import * as path from "path";

const ADDRESSES_PATH = path.resolve(
  __dirname,
  "../../frontend/src/contracts/addresses.json"
);

async function main() {
  // ── Load deployed addresses ────────────────────────────────────────────────
  if (!fs.existsSync(ADDRESSES_PATH)) {
    throw new Error(
      "addresses.json not found. Run `npm run deploy` (or `npm run deploy:local`) first."
    );
  }
  const addresses = JSON.parse(fs.readFileSync(ADDRESSES_PATH, "utf8"));

  const signers = await ethers.getSigners();
  if (signers.length < 2) {
    console.warn(
      "\n⚠  Only one signer found. On Fuji, add a second private key to hardhat.config.ts.\n" +
        "   On local Hardhat node this script uses accounts[0] as client and accounts[1] as freelancer.\n"
    );
    throw new Error("Need at least 2 signers (client and freelancer).");
  }

  const client = signers[0];     // deployer doubles as client
  const freelancer = signers[1]; // second account as freelancer

  console.log("╔══════════════════════════════════════════════╗");
  console.log("║            HERMES Demo Seed Script           ║");
  console.log("╚══════════════════════════════════════════════╝");
  console.log(`  Client     : ${client.address}`);
  console.log(`  Freelancer : ${freelancer.address}`);
  console.log(`  Escrow     : ${addresses.hermesEscrow}`);
  console.log(`  Reputation : ${addresses.hermesReputation}`);
  console.log("────────────────────────────────────────────────");

  // ── Bind contracts ────────────────────────────────────────────────────────
  const reputation = await ethers.getContractAt(
    "HermesReputation",
    addresses.hermesReputation
  );
  const escrow = await ethers.getContractAt("HermesEscrow", addresses.hermesEscrow);
  const usdc = await ethers.getContractAt(
    "@openzeppelin/contracts/token/ERC20/IERC20.sol:IERC20",
    addresses.usdcFuji
  );

  // ── USDC balance check ────────────────────────────────────────────────────
  const DEMO_TOTAL = ethers.parseUnits("500", 6); // 500 USDC
  const clientBalance = await usdc.balanceOf(client.address);
  if (clientBalance < DEMO_TOTAL) {
    console.error(
      `\n✗ Client has ${ethers.formatUnits(clientBalance, 6)} USDC ` +
        `but needs at least 500 USDC.\n` +
        `  Get Fuji USDC at: https://faucet.circle.com\n`
    );
    process.exit(1);
  }
  console.log(`\n  Client USDC balance: ${ethers.formatUnits(clientBalance, 6)} USDC ✓`);

  // ── Step 1: Register freelancer ───────────────────────────────────────────
  console.log("\n[1/4] Registering freelancer...");
  let freelancerAgentId: string;

  if (await reputation.isRegistered(freelancer.address)) {
    const agent = await reputation.getAgentByWallet(freelancer.address);
    freelancerAgentId = agent.id;
    console.log(`  ✓ Already registered — id: ${freelancerAgentId}`);
  } else {
    const tx = await reputation
      .connect(freelancer)
      .registerAgent("Odysseus Dev", "freelancer", "ipfs://QmOdysseusDevProfile");
    const receipt = await tx.wait();
    // Parse AgentRegistered event
    const iface = reputation.interface;
    const log = receipt?.logs
      .map((l: any) => { try { return iface.parseLog(l); } catch { return null; } })
      .find((e: any) => e?.name === "AgentRegistered");
    freelancerAgentId = log?.args?.agentId ?? ethers.ZeroHash;
    console.log(`  ✓ Freelancer registered — id: ${freelancerAgentId}`);
  }

  // ── Step 2: Register client ───────────────────────────────────────────────
  console.log("\n[2/4] Registering client...");
  let clientAgentId: string;

  if (await reputation.isRegistered(client.address)) {
    const agent = await reputation.getAgentByWallet(client.address);
    clientAgentId = agent.id;
    console.log(`  ✓ Already registered — id: ${clientAgentId}`);
  } else {
    const tx = await reputation
      .connect(client)
      .registerAgent("Athens Corp", "client", "ipfs://QmAthensCorpProfile");
    const receipt = await tx.wait();
    const iface = reputation.interface;
    const log = receipt?.logs
      .map((l: any) => { try { return iface.parseLog(l); } catch { return null; } })
      .find((e: any) => e?.name === "AgentRegistered");
    clientAgentId = log?.args?.agentId ?? ethers.ZeroHash;
    console.log(`  ✓ Client registered — id: ${clientAgentId}`);
  }

  // ── Step 3: Approve USDC spending ─────────────────────────────────────────
  console.log("\n[3/4] Approving 500 USDC for escrow...");
  const approveTx = await (usdc as any)
    .connect(client)
    .approve(addresses.hermesEscrow, DEMO_TOTAL);
  await approveTx.wait();
  console.log("  ✓ Approval confirmed");

  // ── Step 4: Create demo job with 3 milestones ──────────────────────────────
  console.log("\n[4/4] Creating demo job...");

  const milestoneDescriptions = [
    "Greek design system — Tailwind config, Cinzel typography, gold/obsidian palette, shadcn/ui components",
    "Job creation & milestone tracking UI — MetaMask connect, escrow deposit flow, progress indicators",
    "AI agent dashboard — real-time milestone status, Gemini verdict display, payment history feed",
  ];
  const milestoneAmounts = [
    ethers.parseUnits("100", 6),  // 100 USDC
    ethers.parseUnits("150", 6),  // 150 USDC
    ethers.parseUnits("250", 6),  // 250 USDC
  ];

  const createTx = await escrow.connect(client).createJob(
    freelancer.address,
    "Build HERMES dApp — Full Frontend",
    "Complete React/Vite frontend for the HERMES autonomous payment system: " +
      "Ancient Greek visual theme, Web3 wallet integration, real-time agent status.",
    milestoneDescriptions,
    milestoneAmounts,
    freelancerAgentId,
    clientAgentId
  );
  const createReceipt = await createTx.wait();

  // Extract jobId from JobCreated event
  const escrowIface = escrow.interface;
  const jobLog = createReceipt?.logs
    .map((l: any) => { try { return escrowIface.parseLog(l); } catch { return null; } })
    .find((e: any) => e?.name === "JobCreated");
  const jobId = jobLog?.args?.jobId ?? 1n;

  console.log(`  ✓ Job #${jobId} created`);
  console.log(`    Title     : Build HERMES dApp — Full Frontend`);
  console.log(`    Total     : 500 USDC locked in escrow`);
  console.log(`    Milestone 1: 100 USDC — Design system`);
  console.log(`    Milestone 2: 150 USDC — Job creation UI`);
  console.log(`    Milestone 3: 250 USDC — Agent dashboard`);

  console.log("\n╔══════════════════════════════════════════════╗");
  console.log("║              Demo Seed Complete              ║");
  console.log("╚══════════════════════════════════════════════╝");
  console.log(`  Job ID          : ${jobId}`);
  console.log(`  Freelancer ID   : ${freelancerAgentId}`);
  console.log(`  Client ID       : ${clientAgentId}`);
  console.log(
    "\n  Next: freelancer submits milestone 0 with deliverable URL,\n" +
      "        then the HERMES agent calls releaseMilestone(jobId, 0).\n"
  );
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("\n✗", err.message ?? err);
    process.exit(1);
  });
