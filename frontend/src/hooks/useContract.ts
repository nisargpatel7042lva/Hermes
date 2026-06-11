import { useMemo } from "react";
import { ethers } from "ethers";
import { useWallet } from "../contexts/WalletContext";
import addresses from "../contracts/addresses.json";
import EscrowABI from "../contracts/abis/HermesEscrow.json";
import ReputationABI from "../contracts/abis/HermesReputation.json";

const USDC_ABI = [
  "function approve(address spender, uint256 amount) external returns (bool)",
  "function allowance(address owner, address spender) external view returns (uint256)",
  "function balanceOf(address account) external view returns (uint256)",
];

function toUSDC(amount: string): bigint {
  return BigInt(Math.round(parseFloat(amount) * 1_000_000));
}

export function formatUSDC(raw: bigint): string {
  return (Number(raw) / 1_000_000).toFixed(2);
}

export function shortenAddr(addr: string): string {
  return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
}

export function useContract() {
  const { provider, account } = useWallet();

  // ── Read-only contract instances (no signer needed) ──────────────────────
  const readEscrow = useMemo(() =>
    provider ? new ethers.Contract(addresses.hermesEscrow, EscrowABI, provider) : null,
    [provider]
  );

  const readReputation = useMemo(() =>
    provider ? new ethers.Contract(addresses.hermesReputation, ReputationABI, provider) : null,
    [provider]
  );

  // ── Signed contract factory (ethers v6: getSigner() is async) ────────────
  async function signedContract(contractAddr: string, abi: ethers.InterfaceAbi) {
    if (!provider) throw new Error("Wallet not connected");
    const signer = await provider.getSigner();
    return new ethers.Contract(contractAddr, abi, signer);
  }

  // ── Write functions ───────────────────────────────────────────────────────

  async function registerAgent(name: string, role: string): Promise<string> {
    const contract = await signedContract(addresses.hermesReputation, ReputationABI);
    const tx = await contract.registerAgent(name, role, "");
    const receipt = await tx.wait();
    return receipt.hash as string;
  }

  async function approveUSDC(totalUsdc: string): Promise<void> {
    const contract = await signedContract(addresses.usdcFuji, USDC_ABI);
    const amount = toUSDC(totalUsdc);
    const tx = await contract.approve(addresses.hermesEscrow, amount);
    await tx.wait();
  }

  async function createJob(
    freelancer: string,
    title: string,
    description: string,
    milestoneDescs: string[],
    milestoneAmounts: string[],
    freelancerERC8004Id: string,
    clientERC8004Id: string
  ): Promise<string> {
    const contract = await signedContract(addresses.hermesEscrow, EscrowABI);
    const amounts = milestoneAmounts.map(toUSDC);
    const tx = await contract.createJob(
      freelancer, title, description, milestoneDescs, amounts,
      freelancerERC8004Id, clientERC8004Id
    );
    const receipt = await tx.wait();
    return receipt.hash as string;
  }

  async function submitMilestone(jobId: number, milestoneId: number, url: string): Promise<string> {
    const contract = await signedContract(addresses.hermesEscrow, EscrowABI);
    const tx = await contract.submitMilestone(jobId, milestoneId, url);
    const receipt = await tx.wait();
    return receipt.hash as string;
  }

  // ── Read functions ────────────────────────────────────────────────────────

  async function getJobsByClient(addr: string): Promise<number[]> {
    if (!readEscrow) return [];
    const ids: bigint[] = await readEscrow.getJobsByClient(addr);
    return Array.from(ids).map(Number);
  }

  async function getJobsByFreelancer(addr: string): Promise<number[]> {
    if (!readEscrow) return [];
    const ids: bigint[] = await readEscrow.getJobsByFreelancer(addr);
    return Array.from(ids).map(Number);
  }

  async function getJob(jobId: number) {
    if (!readEscrow) return null;
    const j = await readEscrow.getJob(jobId);
    return {
      id:                  Number(j.id),
      client:              j.client as string,
      freelancer:          j.freelancer as string,
      title:               j.title as string,
      description:         j.description as string,
      totalAmount:         j.totalAmount as bigint,
      releasedAmount:      j.releasedAmount as bigint,
      status:              Number(j.status),
      createdAt:           Number(j.createdAt),
      milestoneCount:      Number(j.milestoneCount),
      erc8004FreelancerId: j.erc8004FreelancerId as string,
      erc8004ClientId:     j.erc8004ClientId as string,
    };
  }

  async function getMilestone(jobId: number, milestoneId: number) {
    if (!readEscrow) return null;
    const m = await readEscrow.getMilestone(jobId, milestoneId);
    return {
      description:   m.description as string,
      amount:        m.amount as bigint,
      status:        Number(m.status),
      deliverableUrl: m.deliverableUrl as string,
      submittedAt:   Number(m.submittedAt),
      releasedAt:    Number(m.releasedAt),
    };
  }

  async function getAgentByWallet(addr: string) {
    if (!readReputation) return null;
    try {
      const a = await readReputation.getAgentByWallet(addr);
      if (!a || a.wallet === ethers.ZeroAddress) return null;
      return {
        id:              a.id as string,
        wallet:          a.wallet as string,
        name:            a.name as string,
        role:            a.role as string,
        reputationScore: Number(a.reputationScore),
        totalJobs:       Number(a.totalJobs),
        completedJobs:   Number(a.completedJobs),
        registeredAt:    Number(a.registeredAt),
        isVerified:      a.isVerified as boolean,
      };
    } catch {
      return null;
    }
  }

  async function getReputationHistory(agentId: string) {
    if (!readReputation) return [];
    try {
      const events = await readReputation.getReputationHistory(agentId);
      return Array.from(events).map((e: any) => ({
        jobId:       Number(e.jobId),
        milestoneId: Number(e.milestoneId),
        wasPositive: e.wasPositive as boolean,
        timestamp:   Number(e.timestamp),
        notes:       e.notes as string,
      }));
    } catch {
      return [];
    }
  }

  async function isRegistered(addr: string): Promise<boolean> {
    if (!readReputation) return false;
    try { return await readReputation.isRegistered(addr); }
    catch { return false; }
  }

  return {
    account,
    registerAgent,
    approveUSDC,
    createJob,
    submitMilestone,
    getJobsByClient,
    getJobsByFreelancer,
    getJob,
    getMilestone,
    getAgentByWallet,
    getReputationHistory,
    isRegistered,
    addresses,
  };
}
