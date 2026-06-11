import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { NavLink } from "react-router-dom";
import { Scroll, Scale, Wallet } from "lucide-react";
import WordsPullUp from "../components/animations/WordsPullUp";
import FadeUp from "../components/animations/FadeUp";
import TransactionToast, { ToastStatus } from "../components/TransactionToast";
import { useWallet } from "../contexts/WalletContext";
import { useContract } from "../hooks/useContract";

interface AgentData {
  id: string;
  name: string;
  role: string;
  reputationScore: number;
  totalJobs: number;
  completedJobs: number;
}

export default function Register() {
  const { isConnected, account, connectWallet } = useWallet();
  const { registerAgent, getAgentByWallet, isRegistered } = useContract();

  const [name, setName] = useState("");
  const [role, setRole] = useState<"Freelancer" | "Client">("Freelancer");
  const [txStatus, setTxStatus] = useState<"idle" | "loading" | "done">("idle");
  const [toast, setToast] = useState<ToastStatus>(null);
  const [txHash, setTxHash] = useState<string>();
  const [errMsg, setErrMsg] = useState<string>();

  // Existing identity check
  const [checking, setChecking] = useState(false);
  const [existingAgent, setExistingAgent] = useState<AgentData | null>(null);

  useEffect(() => {
    if (!account) { setExistingAgent(null); return; }
    setChecking(true);
    getAgentByWallet(account)
      .then(a => {
        if (a) {
          setExistingAgent(a);
          setName(a.name);
          setRole(a.role as "Freelancer" | "Client");
        } else {
          setExistingAgent(null);
        }
      })
      .finally(() => setChecking(false));
  }, [account]);

  const alreadyRegistered = !!existingAgent || txStatus === "done";

  const handleRegister = async () => {
    if (!isConnected || !name.trim()) return;
    setTxStatus("loading");
    setToast("pending");
    try {
      const hash = await registerAgent(name.trim(), role.toLowerCase());
      setTxHash(hash);
      setToast("success");
      setTxStatus("done");
      // Reload actual agent data
      if (account) {
        const a = await getAgentByWallet(account);
        if (a) setExistingAgent(a);
      }
    } catch (e: any) {
      const msg = e?.reason ?? e?.info?.error?.message ?? e?.message ?? "Transaction failed";
      setErrMsg(msg);
      setToast("error");
      setTxStatus("idle");
    }
  };

  const displayName = name || "Your Name";
  const displayScore = existingAgent?.reputationScore ?? 500;
  const displayJobs = existingAgent?.totalJobs ?? 0;
  const displayCompleted = existingAgent?.completedJobs ?? 0;
  const displayId = existingAgent?.id;

  return (
    <div className="min-h-screen pt-28 pb-20 px-6" style={{ background: "#07060E" }}>
      <div className="max-w-5xl mx-auto">

        {/* Header */}
        <div className="text-center mb-16">
          <span className="font-sans text-xs uppercase tracking-widest" style={{ color: "rgba(201,168,76,0.6)" }}>
            ERC-8004 Identity
          </span>
          <h1 className="font-cinzel text-5xl md:text-6xl mt-3 mb-4" style={{ color: "#F0EBE1" }}>
            <WordsPullUp text="Forge Your Identity" />
          </h1>
          <p className="font-instrument italic text-xl" style={{ color: "rgba(240,235,225,0.4)" }}>
            Every god needs a name. Every agent needs an identity.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">

          {/* Left — form */}
          <FadeUp delay={0.1}>
            <div className="liquid-glass rounded-3xl p-8">

              {/* Already registered banner */}
              {alreadyRegistered && (
                <div
                  className="rounded-xl p-4 mb-6 flex items-center gap-3"
                  style={{ background: "rgba(201,168,76,0.08)", border: "1px solid rgba(201,168,76,0.3)" }}
                >
                  <span style={{ color: "#C9A84C" }}>⚡</span>
                  <div>
                    <p className="font-cinzel text-sm" style={{ color: "#C9A84C" }}>Identity already forged</p>
                    <p className="font-sans text-xs mt-0.5" style={{ color: "rgba(240,235,225,0.4)" }}>
                      Your on-chain identity exists. View your{" "}
                      <NavLink to="/profile" className="underline hover:text-marble transition-colors" style={{ color: "#C9A84C" }}>
                        profile
                      </NavLink>.
                    </p>
                  </div>
                </div>
              )}

              {/* Name */}
              <div className="mb-8">
                <label className="block font-sans text-xs uppercase tracking-widest mb-2" style={{ color: "rgba(201,168,76,0.6)" }}>
                  Name
                </label>
                <input
                  type="text"
                  value={name}
                  onChange={e => setName(e.target.value)}
                  placeholder="Enter your name"
                  disabled={alreadyRegistered}
                  className="w-full bg-transparent border-b py-3 outline-none font-sans text-base transition-colors duration-200 disabled:opacity-50"
                  style={{ borderColor: "rgba(201,168,76,0.2)", color: "#F0EBE1" }}
                  onFocus={e => (e.target.style.borderColor = "rgba(201,168,76,0.6)")}
                  onBlur={e => (e.target.style.borderColor = "rgba(201,168,76,0.2)")}
                />
              </div>

              {/* Role selector */}
              <div className="mb-8">
                <label className="block font-sans text-xs uppercase tracking-widest mb-3" style={{ color: "rgba(201,168,76,0.6)" }}>
                  Role
                </label>
                <div className="grid grid-cols-2 gap-3">
                  {(["Freelancer", "Client"] as const).map(r => (
                    <button
                      key={r}
                      onClick={() => !alreadyRegistered && setRole(r)}
                      disabled={alreadyRegistered}
                      className="liquid-glass rounded-xl p-4 text-left transition-all duration-200 disabled:cursor-default cursor-pointer hover:scale-[1.02]"
                      style={{
                        border: role === r
                          ? "1px solid rgba(201,168,76,0.6)"
                          : "1px solid rgba(240,235,225,0.05)",
                        background: role === r ? "rgba(201,168,76,0.08)" : undefined,
                      }}
                    >
                      <div
                        className="w-8 h-8 rounded-lg flex items-center justify-center mb-2"
                        style={{ background: "rgba(201,168,76,0.12)", color: "#C9A84C" }}
                      >
                        {r === "Freelancer" ? <Scroll size={16} /> : <Scale size={16} />}
                      </div>
                      <div className="font-cinzel text-sm" style={{ color: "#F0EBE1" }}>{r}</div>
                      <div className="font-sans text-xs mt-0.5" style={{ color: "rgba(240,235,225,0.4)" }}>
                        {r === "Freelancer" ? "I deliver work" : "I post jobs"}
                      </div>
                    </button>
                  ))}
                </div>
              </div>

              {/* Wallet */}
              <div className="mb-8">
                {isConnected && account ? (
                  <div className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-green-400" />
                    <span className="font-mono text-sm" style={{ color: "rgba(240,235,225,0.6)" }}>
                      {account.slice(0, 6)}...{account.slice(-4)}
                    </span>
                    {checking && (
                      <span className="font-sans text-xs animate-pulse" style={{ color: "rgba(201,168,76,0.5)" }}>
                        checking...
                      </span>
                    )}
                  </div>
                ) : (
                  <button
                    onClick={connectWallet}
                    className="liquid-glass w-full rounded-full px-6 py-3 flex items-center justify-center gap-3 font-sans text-sm transition-all hover:scale-[1.02] cursor-pointer"
                    style={{ color: "#C9A84C", border: "1px solid rgba(201,168,76,0.3)" }}
                  >
                    <Wallet size={16} /> Connect Wallet
                  </button>
                )}
              </div>

              {/* Submit */}
              <button
                onClick={handleRegister}
                disabled={!isConnected || !name.trim() || txStatus === "loading" || alreadyRegistered}
                className="w-full rounded-2xl py-4 font-cinzel tracking-wider text-sm transition-all duration-200 disabled:opacity-40 disabled:cursor-not-allowed hover:enabled:scale-[1.02]"
                style={{ background: "#C9A84C", color: "#07060E" }}
              >
                {txStatus === "loading"
                  ? "The gods inscribe your name..."
                  : alreadyRegistered
                  ? "Identity Forged ⚡"
                  : "Forge Identity on Chain"}
              </button>
            </div>
          </FadeUp>

          {/* Right — live ID card */}
          <FadeUp delay={0.2}>
            <motion.div
              className="liquid-glass rounded-3xl p-8 flex flex-col items-center text-center"
              style={{ background: "rgba(240,235,225,0.02)", minHeight: "420px" }}
              animate={txStatus === "done" ? { scale: [1, 1.02, 1] } : {}}
              transition={{ duration: 0.5 }}
            >
              <span className="font-cinzel text-6xl mb-2" style={{ color: "#C9A84C" }}>Ω</span>
              <span className="font-sans text-xs uppercase tracking-widest mb-4" style={{ color: "rgba(201,168,76,0.6)" }}>
                HERMES IDENTITY
              </span>
              <div className="w-full h-px mb-6" style={{ background: "rgba(201,168,76,0.2)" }} />

              <div className="font-cinzel text-2xl mb-3" style={{ color: "#F0EBE1" }}>
                {displayName}
              </div>
              <span
                className="rounded-full px-3 py-1 font-cinzel text-xs mb-4"
                style={{ background: "rgba(201,168,76,0.15)", color: "#C9A84C" }}
              >
                {role}
              </span>

              {displayId && (
                <div className="font-mono text-xs mb-4 px-2 break-all" style={{ color: "rgba(240,235,225,0.2)" }}>
                  {displayId.slice(0, 16)}...{displayId.slice(-8)}
                </div>
              )}
              {!displayId && (
                <div className="font-mono text-xs mb-4" style={{ color: "rgba(240,235,225,0.2)" }}>
                  {alreadyRegistered ? "Registered" : "Pending..."}
                </div>
              )}

              <div className="font-cinzel text-5xl mb-2" style={{ color: "#C9A84C" }}>
                {displayScore}
              </div>
              <div className="font-sans text-xs uppercase tracking-widest mb-6" style={{ color: "rgba(240,235,225,0.3)" }}>
                Reputation Score
              </div>

              <div className="flex gap-6 font-sans text-xs" style={{ color: "rgba(240,235,225,0.4)" }}>
                <span>Jobs: {displayJobs}</span>
                <span>Completed: {displayCompleted}</span>
                <span>Rate: {displayJobs > 0 ? `${Math.round((displayCompleted / displayJobs) * 100)}%` : "—"}</span>
              </div>

              {alreadyRegistered && (
                <NavLink
                  to="/profile"
                  className="mt-6 font-cinzel text-xs rounded-full px-4 py-2 transition-all hover:scale-105"
                  style={{ background: "rgba(201,168,76,0.12)", color: "#C9A84C", border: "1px solid rgba(201,168,76,0.3)" }}
                >
                  View Full Profile →
                </NavLink>
              )}
            </motion.div>
          </FadeUp>
        </div>
      </div>

      <TransactionToast
        status={toast}
        txHash={txHash}
        errorMsg={errMsg}
        onDismiss={() => setToast(null)}
      />
    </div>
  );
}
