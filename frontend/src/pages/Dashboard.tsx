import { useState, useEffect, useCallback, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronDown, ExternalLink, RefreshCw } from "lucide-react";
import FadeUp from "../components/animations/FadeUp";
import TransactionToast, { ToastStatus } from "../components/TransactionToast";
import { useWallet } from "../contexts/WalletContext";
import { useContract, formatUSDC } from "../hooks/useContract";

const STATUS_LABELS = ["Open", "Active", "Completed", "Disputed", "Cancelled"];
const STATUS_COLORS = [
  { bg: "rgba(59,130,246,0.15)", text: "rgba(147,197,253,0.9)" },
  { bg: "rgba(201,168,76,0.15)", text: "#C9A84C" },
  { bg: "rgba(34,197,94,0.15)", text: "rgba(134,239,172,0.9)" },
  { bg: "rgba(232,65,66,0.15)", text: "#E84142" },
  { bg: "rgba(107,114,128,0.15)", text: "rgba(209,213,219,0.6)" },
];

const MILESTONE_STATUS = ["Pending", "Submitted", "Verified", "Released", "Rejected"];

interface JobData {
  id: number;
  title: string;
  client: string;
  freelancer: string;
  totalAmount: bigint;
  releasedAmount: bigint;
  status: number;
  milestoneCount: number;
  erc8004FreelancerId: string;
  erc8004ClientId: string;
}

interface MilestoneData {
  description: string;
  amount: bigint;
  status: number;
  deliverableUrl: string;
  submittedAt: number;
  releasedAt: number;
}

export default function Dashboard() {
  const { account, isConnected, connectWallet } = useWallet();
  const { getJobsByClient, getJobsByFreelancer, getJob, getMilestone, submitMilestone } = useContract();

  const [tab, setTab] = useState<"client" | "freelancer">("client");
  const [jobs, setJobs] = useState<JobData[]>([]);
  const [loading, setLoading] = useState(false);
  const [expanded, setExpanded] = useState<number | null>(null);
  const [milestones, setMilestones] = useState<Record<string, MilestoneData>>({});
  const [submitUrls, setSubmitUrls] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState<string | null>(null);
  const [toast, setToast] = useState<ToastStatus>(null);
  const [txHash, setTxHash] = useState<string>();
  const [errMsg, setErrMsg] = useState<string>();

  useEffect(() => {
    if (!account) return;
    loadJobs();
  }, [account, tab]);

  const loadJobs = useCallback(async () => {
    if (!account) return;
    setLoading(true);
    setJobs([]);
    try {
      const ids = tab === "client"
        ? await getJobsByClient(account)
        : await getJobsByFreelancer(account);

      const fetched: JobData[] = [];
      for (const id of ids) {
        try {
          const j = await getJob(id);
          if (j) fetched.push(j as JobData);
        } catch {}
      }
      setJobs(fetched.reverse());
    } catch {}
    setLoading(false);
  }, [account, tab]);

  // Always fetches fresh — used both for initial load and polling
  const fetchMilestones = useCallback(async (jobId: number, count: number) => {
    for (let i = 0; i < count; i++) {
      const key = `${jobId}-${i}`;
      try {
        const m = await getMilestone(jobId, i);
        if (m) setMilestones(prev => ({ ...prev, [key]: m as MilestoneData }));
      } catch {}
    }
  }, [getMilestone]);

  // Poll every 5s while any visible milestone is "Submitted" (status 1)
  const expandedJobRef = useRef<{ id: number; count: number } | null>(null);
  useEffect(() => {
    const job = jobs.find(j => j.id === expanded);
    expandedJobRef.current = job ? { id: job.id, count: job.milestoneCount } : null;
  }, [expanded, jobs]);

  useEffect(() => {
    const hasSubmitted = Object.values(milestones).some(m => m.status === 1);
    if (!hasSubmitted || expanded === null) return;

    const interval = setInterval(() => {
      const ref = expandedJobRef.current;
      if (ref) fetchMilestones(ref.id, ref.count);
    }, 5_000);

    return () => clearInterval(interval);
  }, [milestones, expanded, fetchMilestones]);

  const handleExpand = (jobId: number, count: number) => {
    if (expanded === jobId) { setExpanded(null); return; }
    setExpanded(jobId);
    fetchMilestones(jobId, count);
  };

  const handleSubmit = async (jobId: number, milestoneId: number) => {
    const key = `${jobId}-${milestoneId}`;
    const url = submitUrls[key];
    if (!url?.trim()) return;
    setSubmitting(key);
    setToast("pending");
    try {
      const hash = await submitMilestone(jobId, milestoneId, url);
      setTxHash(hash);
      setToast("success");
      // Optimistic update then re-fetch from chain
      setMilestones(prev => ({
        ...prev,
        [key]: prev[key] ? { ...prev[key], status: 1, deliverableUrl: url } : prev[key],
      }));
      // Clear URL input
      setSubmitUrls(prev => { const n = { ...prev }; delete n[key]; return n; });
      // Re-fetch all milestones for this job after 3s
      setTimeout(() => {
        const job = jobs.find(j => j.id === jobId);
        if (job) fetchMilestones(job.id, job.milestoneCount);
      }, 3_000);
    } catch (e: any) {
      const msg = e?.reason ?? e?.info?.error?.message ?? e?.shortMessage ?? e?.message ?? "Submit failed";
      setErrMsg(msg);
      setToast("error");
    }
    setSubmitting(null);
  };

  const releasedCount = (job: JobData) =>
    Object.entries(milestones)
      .filter(([k, m]) => k.startsWith(`${job.id}-`) && m.status === 3)
      .length;

  return (
    <div className="min-h-screen pt-28 pb-20 px-6" style={{ background: "#07060E" }}>
      <div className="max-w-5xl mx-auto">

        {/* Header */}
        <FadeUp className="mb-8 flex items-start justify-between">
          <div>
            <h1 className="font-cinzel text-5xl mb-2" style={{ color: "#F0EBE1" }}>The Arena</h1>
            <p className="font-instrument italic text-xl" style={{ color: "rgba(240,235,225,0.4)" }}>
              Where work meets its reward
            </p>
          </div>
          {isConnected && (
            <button
              onClick={loadJobs}
              disabled={loading}
              className="mt-2 flex items-center gap-2 liquid-glass rounded-full px-4 py-2 font-sans text-sm transition-all hover:scale-105 disabled:opacity-40"
              style={{ color: "#C9A84C" }}
            >
              <RefreshCw size={13} className={loading ? "animate-spin" : ""} />
              Refresh
            </button>
          )}
        </FadeUp>

        {/* Tab toggle */}
        <FadeUp delay={0.05} className="mb-8">
          <div className="liquid-glass rounded-full p-1 inline-flex">
            {(["client", "freelancer"] as const).map(t => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className="relative rounded-full px-6 py-2 font-sans text-sm transition-all duration-200"
                style={{ color: tab === t ? "#07060E" : "rgba(240,235,225,0.4)" }}
              >
                {tab === t && (
                  <motion.span
                    layoutId="tab-bg"
                    className="absolute inset-0 rounded-full"
                    style={{ background: "#C9A84C" }}
                  />
                )}
                <span className="relative">{t === "client" ? "As Client" : "As Freelancer"}</span>
              </button>
            ))}
          </div>
        </FadeUp>

        {/* Not connected */}
        {!isConnected && (
          <FadeUp className="text-center py-24">
            <p className="font-cinzel text-xl mb-4" style={{ color: "rgba(240,235,225,0.4)" }}>
              Connect your wallet to enter the arena
            </p>
            <button
              onClick={connectWallet}
              className="liquid-glass rounded-full px-6 py-3 font-cinzel text-sm"
              style={{ color: "#C9A84C" }}
            >
              Connect Wallet
            </button>
          </FadeUp>
        )}

        {/* Loading */}
        {loading && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {[1, 2, 3, 4].map(i => (
              <div key={i} className="skeleton h-40 rounded-2xl" />
            ))}
          </div>
        )}

        {/* Empty */}
        {!loading && isConnected && jobs.length === 0 && (
          <FadeUp className="text-center py-24">
            <p className="font-cinzel text-xl" style={{ color: "rgba(240,235,225,0.3)" }}>
              No jobs yet — the arena awaits your first covenant
            </p>
          </FadeUp>
        )}

        {/* Jobs grid */}
        {!loading && jobs.length > 0 && (
          <div className="space-y-4">
            {jobs.map((job, i) => {
              const released = releasedCount(job);
              const isExpanded = expanded === job.id;
              const isFreelancer = account?.toLowerCase() === job.freelancer.toLowerCase();

              return (
                <FadeUp key={job.id} delay={i * 0.05}>
                  <div className="liquid-glass rounded-2xl gold-shimmer-hover overflow-hidden">
                    <div className="p-6">
                      {/* Top row */}
                      <div className="flex items-start justify-between mb-4">
                        <div className="flex-1 min-w-0 mr-4">
                          <div className="flex items-center gap-3 mb-1">
                            <h3 className="font-cinzel text-lg truncate" style={{ color: "#F0EBE1" }}>
                              {job.title}
                            </h3>
                            <StatusBadge status={job.status} />
                          </div>
                          <div className="font-cinzel text-2xl" style={{ color: "#C9A84C" }}>
                            {formatUSDC(job.totalAmount)} USDC
                          </div>
                        </div>
                      </div>

                      {/* Progress bar */}
                      <div className="mb-4">
                        <div className="h-1.5 rounded-full mb-2" style={{ background: "rgba(240,235,225,0.05)" }}>
                          <div
                            className="h-full rounded-full transition-all duration-500"
                            style={{
                              width: `${job.milestoneCount > 0 ? (released / job.milestoneCount) * 100 : 0}%`,
                              background: "linear-gradient(to right, #C9A84C, #E2C97E)",
                            }}
                          />
                        </div>
                        <span className="font-sans text-xs" style={{ color: "rgba(240,235,225,0.4)" }}>
                          {released}/{job.milestoneCount} milestones complete
                        </span>
                      </div>

                      {/* Address */}
                      <div className="font-mono text-xs mb-4" style={{ color: "rgba(240,235,225,0.3)" }}>
                        {tab === "client" ? "Freelancer" : "Client"}:{" "}
                        {tab === "client"
                          ? `${job.freelancer.slice(0, 6)}...${job.freelancer.slice(-4)}`
                          : `${job.client.slice(0, 6)}...${job.client.slice(-4)}`
                        }
                      </div>

                      {/* Expand button */}
                      <button
                        onClick={() => handleExpand(job.id, job.milestoneCount)}
                        className="flex items-center gap-1 font-sans text-sm transition-colors hover:opacity-70"
                        style={{ color: "#C9A84C" }}
                      >
                        View Details
                        <motion.span animate={{ rotate: isExpanded ? 180 : 0 }}>
                          <ChevronDown size={14} />
                        </motion.span>
                      </button>
                    </div>

                    {/* Expanded milestones */}
                    <AnimatePresence>
                      {isExpanded && (
                        <motion.div
                          initial={{ height: 0, opacity: 0 }}
                          animate={{ height: "auto", opacity: 1 }}
                          exit={{ height: 0, opacity: 0 }}
                          transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
                          className="overflow-hidden"
                        >
                          <div className="px-6 pb-6 border-t" style={{ borderColor: "rgba(240,235,225,0.05)" }}>
                            {Array.from({ length: job.milestoneCount }, (_, mi) => {
                              const mk = `${job.id}-${mi}`;
                              const m = milestones[mk];
                              const subKey = mk;
                              if (!m) return (
                                <div key={mi} className="py-4 border-b skeleton h-8 rounded" style={{ borderColor: "rgba(240,235,225,0.05)" }} />
                              );

                              return (
                                <div key={mi} className="py-4 border-b" style={{ borderColor: "rgba(240,235,225,0.05)" }}>
                                  <div className="flex items-start justify-between gap-4 mb-2">
                                    <div className="flex-1">
                                      <span className="font-sans text-xs mr-2" style={{ color: "rgba(201,168,76,0.5)" }}>
                                        #{mi + 1}
                                      </span>
                                      <span className="font-sans text-sm" style={{ color: "rgba(240,235,225,0.7)" }}>
                                        {m.description}
                                      </span>
                                    </div>
                                    <div className="flex items-center gap-2 shrink-0">
                                      <span className="font-cinzel text-sm" style={{ color: "#C9A84C" }}>
                                        {formatUSDC(m.amount)} USDC
                                      </span>
                                      <MilestoneStatusBadge status={m.status} />
                                    </div>
                                  </div>

                                  {/* Freelancer can submit */}
                                  {m.status === 0 && isFreelancer && (
                                    <div className="flex gap-2 mt-3">
                                      <input
                                        type="url"
                                        placeholder="https://github.com/..."
                                        value={submitUrls[subKey] ?? ""}
                                        onChange={e => setSubmitUrls(prev => ({ ...prev, [subKey]: e.target.value }))}
                                        className="flex-1 bg-transparent border-b outline-none font-sans text-xs py-1"
                                        style={{ borderColor: "rgba(201,168,76,0.2)", color: "#F0EBE1" }}
                                      />
                                      <button
                                        onClick={() => handleSubmit(job.id, mi)}
                                        disabled={submitting === subKey || !submitUrls[subKey]}
                                        className="font-cinzel text-xs px-3 py-1.5 rounded-full disabled:opacity-40"
                                        style={{ background: "#C9A84C", color: "#07060E" }}
                                      >
                                        {submitting === subKey ? "..." : "Submit to Hermes"}
                                      </button>
                                    </div>
                                  )}

                                  {/* Submitted — verifying */}
                                  {m.status === 1 && (
                                    <div className="flex items-center gap-2 mt-2">
                                      <span className="w-2 h-2 rounded-full bg-gold animate-pulse" />
                                      <span className="font-sans text-xs" style={{ color: "rgba(201,168,76,0.7)" }}>
                                        Hermes is verifying...
                                      </span>
                                    </div>
                                  )}

                                  {/* Released */}
                                  {m.status === 3 && (
                                    <div className="flex items-center gap-2 mt-2">
                                      <span className="font-sans text-xs" style={{ color: "rgba(134,239,172,0.8)" }}>
                                        ⚡ Payment Released
                                      </span>
                                      {m.deliverableUrl && (
                                        <a
                                          href={m.deliverableUrl}
                                          target="_blank"
                                          rel="noopener noreferrer"
                                          className="flex items-center gap-1 font-sans text-xs hover:opacity-70 transition-opacity"
                                          style={{ color: "rgba(240,235,225,0.3)" }}
                                        >
                                          deliverable <ExternalLink size={10} />
                                        </a>
                                      )}
                                    </div>
                                  )}

                                  {/* Rejected */}
                                  {m.status === 4 && (
                                    <div className="mt-2">
                                      <span className="font-sans text-xs" style={{ color: "rgba(232,65,66,0.8)" }}>
                                        ✗ Rejected — resubmission required
                                      </span>
                                      {isFreelancer && (
                                        <div className="flex gap-2 mt-2">
                                          <input
                                            type="url"
                                            placeholder="New deliverable URL..."
                                            value={submitUrls[subKey] ?? ""}
                                            onChange={e => setSubmitUrls(prev => ({ ...prev, [subKey]: e.target.value }))}
                                            className="flex-1 bg-transparent border-b outline-none font-sans text-xs py-1"
                                            style={{ borderColor: "rgba(201,168,76,0.2)", color: "#F0EBE1" }}
                                          />
                                          <button
                                            onClick={() => handleSubmit(job.id, mi)}
                                            disabled={submitting === subKey || !submitUrls[subKey]}
                                            className="font-cinzel text-xs px-3 py-1.5 rounded-full disabled:opacity-40"
                                            style={{ background: "#C9A84C", color: "#07060E" }}
                                          >
                                            Resubmit
                                          </button>
                                        </div>
                                      )}
                                    </div>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                </FadeUp>
              );
            })}
          </div>
        )}
      </div>

      <TransactionToast status={toast} txHash={txHash} errorMsg={errMsg} onDismiss={() => setToast(null)} />
    </div>
  );
}

function StatusBadge({ status }: { status: number }) {
  const s = STATUS_COLORS[status] ?? STATUS_COLORS[0];
  return (
    <span
      className="font-sans text-xs rounded-full px-2.5 py-0.5 shrink-0"
      style={{ background: s.bg, color: s.text }}
    >
      {STATUS_LABELS[status] ?? "Unknown"}
    </span>
  );
}

function MilestoneStatusBadge({ status }: { status: number }) {
  const colors: Record<number, { bg: string; text: string }> = {
    0: { bg: "rgba(107,114,128,0.15)", text: "rgba(209,213,219,0.6)" },
    1: { bg: "rgba(201,168,76,0.15)", text: "#C9A84C" },
    2: { bg: "rgba(59,130,246,0.15)", text: "rgba(147,197,253,0.9)" },
    3: { bg: "rgba(34,197,94,0.15)", text: "rgba(134,239,172,0.9)" },
    4: { bg: "rgba(232,65,66,0.15)", text: "#E84142" },
  };
  const c = colors[status] ?? colors[0];
  return (
    <span className="font-sans text-xs rounded-full px-2 py-0.5" style={{ background: c.bg, color: c.text }}>
      {MILESTONE_STATUS[status] ?? "Unknown"}
    </span>
  );
}
