import { useState, useEffect, useCallback } from "react";
import { useParams, NavLink } from "react-router-dom";
import { motion } from "framer-motion";
import { ethers } from "ethers";
import { RefreshCw } from "lucide-react";
import FadeUp from "../components/animations/FadeUp";
import { useWallet } from "../contexts/WalletContext";
import addresses from "../contracts/addresses.json";
import ReputationABI from "../contracts/abis/HermesReputation.json";

const RPC = "https://api.avax-test.network/ext/bc/C/rpc";

interface Agent {
  id: string;
  wallet: string;
  name: string;
  role: string;
  reputationScore: number;
  totalJobs: number;
  completedJobs: number;
  registeredAt: number;
  isVerified: boolean;
}

interface RepEvent {
  jobId: number;
  milestoneId: number;
  wasPositive: boolean;
  timestamp: number;
  notes: string;
}

async function fetchAgent(addr: string): Promise<Agent | null> {
  const provider = new ethers.JsonRpcProvider(RPC);
  const contract = new ethers.Contract(addresses.hermesReputation, ReputationABI, provider);
  try {
    const a = await contract.getAgentByWallet(addr);
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
  } catch { return null; }
}

async function fetchHistory(agentId: string): Promise<RepEvent[]> {
  const provider = new ethers.JsonRpcProvider(RPC);
  const contract = new ethers.Contract(addresses.hermesReputation, ReputationABI, provider);
  try {
    const events = await contract.getReputationHistory(agentId);
    return Array.from(events).map((e: any) => ({
      jobId:       Number(e.jobId),
      milestoneId: Number(e.milestoneId),
      wasPositive: e.wasPositive as boolean,
      timestamp:   Number(e.timestamp),
      notes:       e.notes as string,
    }));
  } catch { return []; }
}

export default function Profile() {
  const { address } = useParams<{ address?: string }>();
  const { account, connectWallet } = useWallet();

  const target = address ?? account ?? "";
  const isOwnProfile = !address && !!account;

  const [agent, setAgent] = useState<Agent | null>(null);
  const [history, setHistory] = useState<RepEvent[]>([]);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [notFound, setNotFound] = useState(false);

  const load = useCallback(async (showFullLoader = false) => {
    if (!target) return;
    if (showFullLoader) { setLoading(true); setAgent(null); setHistory([]); setNotFound(false); }
    else setRefreshing(true);
    try {
      const a = await fetchAgent(target);
      if (!a) { setNotFound(true); return; }
      setNotFound(false);
      setAgent(a);
      const h = await fetchHistory(a.id);
      setHistory(h);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [target]);

  // Initial load
  useEffect(() => { load(true); }, [load]);

  // Poll every 15s so reputation updates appear automatically
  useEffect(() => {
    if (!target) return;
    const interval = setInterval(() => load(false), 15_000);
    return () => clearInterval(interval);
  }, [load, target]);

  const successRate = agent && agent.totalJobs > 0
    ? Math.round((agent.completedJobs / agent.totalJobs) * 100)
    : 0;

  // Not connected + own profile
  if (!target) {
    return (
      <div className="min-h-screen pt-28 flex flex-col items-center justify-center gap-4" style={{ background: "#07060E" }}>
        <span className="font-cinzel text-5xl" style={{ color: "#C9A84C" }}>Ω</span>
        <p className="font-cinzel text-2xl" style={{ color: "rgba(240,235,225,0.5)" }}>
          Who walks the arena?
        </p>
        <p className="font-instrument italic" style={{ color: "rgba(240,235,225,0.3)" }}>
          Connect your wallet to view your chronicle
        </p>
        <button
          onClick={connectWallet}
          className="liquid-glass rounded-full px-6 py-3 font-cinzel text-sm mt-2"
          style={{ color: "#C9A84C" }}
        >
          Connect Wallet
        </button>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="min-h-screen pt-28 pb-20 px-6" style={{ background: "#07060E" }}>
        <div className="max-w-4xl mx-auto space-y-4">
          <div className="skeleton h-56 rounded-3xl" />
          <div className="grid grid-cols-3 gap-4">
            {[1, 2, 3].map(i => <div key={i} className="skeleton h-28 rounded-2xl" />)}
          </div>
          <div className="skeleton h-48 rounded-2xl" />
        </div>
      </div>
    );
  }

  if (notFound) {
    return (
      <div className="min-h-screen pt-28 flex flex-col items-center justify-center gap-4" style={{ background: "#07060E" }}>
        <span className="font-cinzel text-5xl" style={{ color: "rgba(240,235,225,0.2)" }}>Ω</span>
        <p className="font-cinzel text-2xl" style={{ color: "rgba(240,235,225,0.4)" }}>
          No identity found for this address
        </p>
        <p className="font-mono text-xs mb-2" style={{ color: "rgba(240,235,225,0.2)" }}>
          {target.slice(0, 10)}...{target.slice(-6)}
        </p>
        <p className="font-instrument italic" style={{ color: "rgba(240,235,225,0.3)" }}>
          The gods have not yet inscribed this soul
        </p>
        {isOwnProfile && (
          <NavLink
            to="/register"
            className="liquid-glass rounded-full px-6 py-3 font-cinzel text-sm mt-2 transition-all hover:scale-105"
            style={{ color: "#C9A84C" }}
          >
            Forge Your Identity →
          </NavLink>
        )}
      </div>
    );
  }

  if (!agent) return null;

  return (
    <div className="min-h-screen pt-28 pb-20 px-6" style={{ background: "#07060E" }}>
      <div className="max-w-4xl mx-auto">

        {/* Identity card */}
        <FadeUp>
          <div className="liquid-glass rounded-3xl p-8 md:p-12 mb-6">
            <div className="flex justify-end mb-2">
              <button
                onClick={() => load(false)}
                disabled={refreshing}
                className="flex items-center gap-1.5 font-sans text-xs transition-opacity hover:opacity-70 disabled:opacity-40"
                style={{ color: "rgba(201,168,76,0.6)" }}
              >
                <RefreshCw size={12} className={refreshing ? "animate-spin" : ""} />
                {refreshing ? "Updating..." : "Refresh"}
              </button>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8 items-center">
              <div>
                <span className="font-cinzel text-6xl" style={{ color: "#C9A84C" }}>Ω</span>
                <h1 className="font-cinzel text-4xl mt-4 mb-3" style={{ color: "#F0EBE1" }}>
                  {agent.name}
                </h1>
                <span
                  className="inline-block rounded-full px-4 py-1 font-cinzel text-xs mb-4"
                  style={{ background: "rgba(201,168,76,0.12)", color: "#C9A84C", border: "1px solid rgba(201,168,76,0.25)" }}
                >
                  {agent.role}
                </span>
                {agent.isVerified && (
                  <span
                    className="inline-block rounded-full px-3 py-1 font-cinzel text-xs mb-4 ml-2"
                    style={{ background: "rgba(34,197,94,0.1)", color: "rgba(134,239,172,0.9)", border: "1px solid rgba(34,197,94,0.2)" }}
                  >
                    ✓ Verified
                  </span>
                )}
                <div className="font-mono text-xs break-all mb-3" style={{ color: "rgba(240,235,225,0.25)" }}>
                  ID: {agent.id.slice(0, 18)}...{agent.id.slice(-8)}
                </div>
                <div className="font-mono text-xs break-all mb-3" style={{ color: "rgba(240,235,225,0.2)" }}>
                  {agent.wallet.slice(0, 10)}...{agent.wallet.slice(-6)}
                </div>
                <div className="flex items-center gap-2 font-sans text-xs" style={{ color: "rgba(240,235,225,0.4)" }}>
                  <span className="w-2 h-2 rounded-full bg-avax" />
                  Avalanche Fuji
                </div>
              </div>

              <div className="flex flex-col items-center">
                <ScoreGauge score={agent.reputationScore} />
                <div className="font-sans text-xs uppercase tracking-widest mt-3" style={{ color: "rgba(240,235,225,0.3)" }}>
                  Reputation Score
                </div>
              </div>
            </div>
          </div>
        </FadeUp>

        {/* Stats */}
        <FadeUp delay={0.1}>
          <div className="grid grid-cols-3 gap-4 mb-12">
            {[
              { label: "Total Jobs", value: String(agent.totalJobs) },
              { label: "Completed", value: String(agent.completedJobs) },
              { label: "Success Rate", value: agent.totalJobs > 0 ? `${successRate}%` : "—" },
            ].map(s => (
              <div key={s.label} className="liquid-glass rounded-2xl p-6 text-center">
                <div className="font-cinzel text-4xl mb-1" style={{ color: "#C9A84C" }}>{s.value}</div>
                <div className="font-sans text-xs uppercase tracking-widest" style={{ color: "rgba(240,235,225,0.3)" }}>{s.label}</div>
              </div>
            ))}
          </div>
        </FadeUp>

        {/* Chronicle */}
        <FadeUp delay={0.2}>
          <h2 className="font-cinzel text-2xl mb-8" style={{ color: "#F0EBE1" }}>Chronicle</h2>

          {history.length === 0 ? (
            <div className="liquid-glass rounded-2xl p-8 text-center">
              <p className="font-instrument italic text-lg" style={{ color: "rgba(240,235,225,0.3)" }}>
                No reputation events — your chronicle is unwritten
              </p>
            </div>
          ) : (
            <div className="relative pl-6">
              <div className="absolute left-0 top-0 bottom-0 w-px" style={{ background: "rgba(201,168,76,0.2)" }} />
              {history.map((ev, i) => (
                <motion.div
                  key={i}
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: i * 0.04, ease: "easeOut" }}
                  className="relative pb-6"
                >
                  <div
                    className="absolute left-[-9px] top-1.5 w-3 h-3 rounded-full border-2"
                    style={{
                      background: ev.wasPositive ? "#C9A84C" : "#E84142",
                      borderColor: "#07060E",
                    }}
                  />
                  <div className="liquid-glass rounded-xl p-4">
                    <div className="flex items-start justify-between gap-4 mb-1">
                      <span className="font-sans text-sm" style={{ color: "rgba(240,235,225,0.7)" }}>
                        Job #{ev.jobId} · Milestone #{ev.milestoneId}
                      </span>
                      <span className="font-cinzel text-sm shrink-0" style={{ color: ev.wasPositive ? "#C9A84C" : "#E84142" }}>
                        {ev.wasPositive ? "+10" : "-20"} rep
                      </span>
                    </div>
                    {ev.notes && (
                      <p className="font-sans text-xs line-clamp-2 mb-1" style={{ color: "rgba(240,235,225,0.35)" }}>
                        {ev.notes}
                      </p>
                    )}
                    <span className="font-sans text-xs" style={{ color: "rgba(240,235,225,0.25)" }}>
                      {new Date(ev.timestamp * 1000).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                    </span>
                  </div>
                </motion.div>
              ))}
            </div>
          )}
        </FadeUp>
      </div>
    </div>
  );
}

function ScoreGauge({ score }: { score: number }) {
  const r = 60;
  const circ = 2 * Math.PI * r;
  const pct = Math.min(score / 1000, 1);
  const color = score >= 700 ? "#C9A84C" : score >= 400 ? "#F0EBE1" : "#E84142";

  return (
    <div className="relative w-36 h-36 flex items-center justify-center">
      <svg className="absolute inset-0 -rotate-90" viewBox="0 0 140 140">
        <circle cx="70" cy="70" r={r} fill="none" stroke="rgba(240,235,225,0.06)" strokeWidth="8" />
        <motion.circle
          cx="70" cy="70" r={r}
          fill="none"
          stroke={color}
          strokeWidth="8"
          strokeLinecap="round"
          strokeDasharray={circ}
          initial={{ strokeDashoffset: circ }}
          animate={{ strokeDashoffset: circ * (1 - pct) }}
          transition={{ duration: 1.2, ease: "easeOut" }}
        />
      </svg>
      <div className="font-cinzel text-3xl" style={{ color }}>{score}</div>
    </div>
  );
}
