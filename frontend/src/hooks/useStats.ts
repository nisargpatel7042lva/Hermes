import { useState, useEffect } from "react";
import { ethers } from "ethers";
import addresses from "../contracts/addresses.json";
import EscrowABI from "../contracts/abis/HermesEscrow.json";
import ReputationABI from "../contracts/abis/HermesReputation.json";

const RPC = "https://api.avax-test.network/ext/bc/C/rpc";
const CHUNK = 2048;

export function useStats() {
  const [stats, setStats] = useState({ totalJobs: 0, totalUSDCReleased: "0.00", totalAgents: 0 });

  useEffect(() => {
    const provider = new ethers.JsonRpcProvider(RPC);
    const escrow = new ethers.Contract(addresses.hermesEscrow, EscrowABI, provider);
    const reputation = new ethers.Contract(addresses.hermesReputation, ReputationABI, provider);

    const fetchStats = async () => {
      try {
        // Total jobs
        const count = await escrow.jobCounter();
        const totalJobs = Number(count);

        // Total USDC released across first 50 jobs
        let released = 0n;
        for (let i = 1; i <= Math.min(totalJobs, 50); i++) {
          try {
            const j = await escrow.getJob(i);
            released += j.releasedAmount as bigint;
          } catch {}
        }

        // Agent count from AgentRegistered events (last 2048 blocks = ~68 min on Fuji)
        let totalAgents = 0;
        try {
          const latest = await provider.getBlockNumber();
          const from = Math.max(0, latest - CHUNK);
          const filter = reputation.filters.AgentRegistered();
          const events = await reputation.queryFilter(filter, from, latest);
          totalAgents = events.length;
        } catch {}

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
