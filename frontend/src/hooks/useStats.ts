import { useState, useEffect } from "react";
import { ethers } from "ethers";
import addresses from "../contracts/addresses.json";
import EscrowABI from "../contracts/abis/HermesEscrow.json";
import ReputationABI from "../contracts/abis/HermesReputation.json";

const RPC = "https://api.avax-test.network/ext/bc/C/rpc";
const CHUNK = 2048;
const SCAN_BLOCKS = 500_000; // ~11.5 days at 2s/block on Fuji — covers full deployment history
const PARALLEL_BATCH = 15;

async function countAgentEvents(
  reputation: ethers.Contract,
  latestBlock: number
): Promise<number> {
  const scanFrom = Math.max(0, latestBlock - SCAN_BLOCKS);
  const ranges: [number, number][] = [];
  for (let from = scanFrom; from <= latestBlock; from += CHUNK) {
    ranges.push([from, Math.min(from + CHUNK - 1, latestBlock)]);
  }

  let total = 0;
  for (let i = 0; i < ranges.length; i += PARALLEL_BATCH) {
    const batch = ranges.slice(i, i + PARALLEL_BATCH);
    const counts = await Promise.all(
      batch.map(async ([from, to]) => {
        try {
          const filter = reputation.filters.AgentRegistered();
          const events = await reputation.queryFilter(filter, from, to);
          return events.length;
        } catch { return 0; }
      })
    );
    total += counts.reduce((a, b) => a + b, 0);
  }
  return total;
}

export function useStats() {
  const [stats, setStats] = useState({ totalJobs: 0, totalUSDCReleased: "0.00", totalAgents: 0 });

  useEffect(() => {
    const provider = new ethers.JsonRpcProvider(RPC);
    const escrow = new ethers.Contract(addresses.hermesEscrow, EscrowABI, provider);
    const reputation = new ethers.Contract(addresses.hermesReputation, ReputationABI, provider);

    const fetchStats = async () => {
      try {
        const [count, latest] = await Promise.all([
          escrow.jobCounter(),
          provider.getBlockNumber(),
        ]);
        const totalJobs = Number(count);

        // Total USDC released across first 50 jobs
        let released = 0n;
        for (let i = 1; i <= Math.min(totalJobs, 50); i++) {
          try {
            const j = await escrow.getJob(i);
            released += j.releasedAmount as bigint;
          } catch {}
        }

        // Agent count via paginated scan across full deployment history
        const totalAgents = await countAgentEvents(reputation, latest);

        setStats({
          totalJobs,
          totalUSDCReleased: (Number(released) / 1_000_000).toFixed(2),
          totalAgents,
        });
      } catch {}
    };

    fetchStats();
    const interval = setInterval(fetchStats, 30_000);
    return () => clearInterval(interval);
  }, []);

  return stats;
}
