import { ethers } from "hardhat";
import * as fs from "fs";
import * as path from "path";

const USDC_FUJI = "0x5425890298aed601595a70AB815c96711a31Bc65";

async function main() {
  const [deployer] = await ethers.getSigners();
  const network = await ethers.provider.getNetwork();

  console.log("╔══════════════════════════════════════════════╗");
  console.log("║          HERMES Deployment Script            ║");
  console.log("╚══════════════════════════════════════════════╝");
  console.log(`  Deployer : ${deployer.address}`);
  console.log(`  Network  : ${network.name} (chainId ${network.chainId})`);
  console.log(`  USDC     : ${USDC_FUJI}`);
  console.log("────────────────────────────────────────────────");

  // ── Step 1: Deploy HermesReputation ──────────────────────────────────────
  console.log("\n[1/3] Deploying HermesReputation...");
  const ReputationFactory = await ethers.getContractFactory("HermesReputation");
  const reputation = await ReputationFactory.deploy();
  await reputation.waitForDeployment();
  const reputationAddress = await reputation.getAddress();
  console.log(`  ✓ HermesReputation : ${reputationAddress}`);

  // ── Step 2: Deploy HermesEscrow ──────────────────────────────────────────
  // The deployer address acts as the initial verifier (the AI agent wallet).
  // In production, set this to a dedicated agent hot-wallet.
  console.log("\n[2/3] Deploying HermesEscrow...");
  const verifier = deployer.address;
  const EscrowFactory = await ethers.getContractFactory("HermesEscrow");
  const escrow = await EscrowFactory.deploy(USDC_FUJI, reputationAddress, verifier);
  await escrow.waitForDeployment();
  const escrowAddress = await escrow.getAddress();
  console.log(`  ✓ HermesEscrow     : ${escrowAddress}`);
  console.log(`  ✓ Verifier wallet  : ${verifier}`);

  // ── Step 3: Wire up HermesReputation → HermesEscrow ──────────────────────
  console.log("\n[3/3] Wiring reputation registry to escrow...");
  const wireTx = await reputation.setEscrowContract(escrowAddress);
  await wireTx.wait();
  console.log("  ✓ setEscrowContract() confirmed");

  // ── Save addresses ────────────────────────────────────────────────────────
  const addresses = {
    hermesEscrow: escrowAddress,
    hermesReputation: reputationAddress,
    usdcFuji: USDC_FUJI,
    verifier,
    network: network.name,
    chainId: Number(network.chainId),
    deployedAt: new Date().toISOString(),
  };

  const destinations = [
    path.resolve(__dirname, "../../frontend/src/contracts"),
    path.resolve(__dirname, "../../agent/src/contracts"),
  ];

  for (const dir of destinations) {
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, "addresses.json"), JSON.stringify(addresses, null, 2));
  }

  console.log("\n────────────────────────────────────────────────");
  console.log("  addresses.json written to:");
  console.log("    frontend/src/contracts/addresses.json");
  console.log("    agent/src/contracts/addresses.json");
  console.log("\n╔══════════════════════════════════════════════╗");
  console.log("║            Deployment Complete               ║");
  console.log("╚══════════════════════════════════════════════╝");
  console.log(JSON.stringify(addresses, null, 2));
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
