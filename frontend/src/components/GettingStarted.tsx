import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { NavLink } from "react-router-dom";
import { ChevronUp, X, CheckCircle2, Circle, Wallet, UserPlus, Briefcase } from "lucide-react";
import { useWallet } from "../contexts/WalletContext";
import { useContract } from "../hooks/useContract";

const DISMISSED_KEY = "hermes_guide_dismissed";

interface Step {
  id: string;
  icon: React.ReactNode;
  title: string;
  desc: string;
  action?: { label: string; to: string };
  done: boolean;
}

export default function GettingStarted() {
  const [open, setOpen] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const [isRegistered, setIsRegistered] = useState(false);
  const { isConnected, account } = useWallet();
  const { getAgentByWallet } = useContract();

  // Load dismissed state
  useEffect(() => {
    if (sessionStorage.getItem(DISMISSED_KEY)) setDismissed(true);
  }, []);

  // Check registration
  useEffect(() => {
    if (!account) { setIsRegistered(false); return; }
    getAgentByWallet(account).then(a => setIsRegistered(!!a)).catch(() => {});
  }, [account]);

  const steps: Step[] = [
    {
      id: "connect",
      icon: <Wallet size={16} />,
      title: "Connect your wallet",
      desc: "Use MetaMask or Avalanche Core on the Fuji testnet.",
      action: isConnected ? undefined : { label: "Connect", to: "/" },
      done: isConnected,
    },
    {
      id: "register",
      icon: <UserPlus size={16} />,
      title: "Forge your identity",
      desc: "Register on-chain as a Freelancer or Client.",
      action: isRegistered ? undefined : { label: "Register →", to: "/register" },
      done: isRegistered,
    },
    {
      id: "work",
      icon: <Briefcase size={16} />,
      title: "Post a job or find work",
      desc: "Clients post jobs with USDC escrow. Freelancers submit deliverables.",
      action: { label: "Go to Jobs →", to: "/dashboard" },
      done: false,
    },
  ];

  const allDone = steps.every(s => s.done);
  const completedCount = steps.filter(s => s.done).length;

  const dismiss = () => {
    setDismissed(true);
    sessionStorage.setItem(DISMISSED_KEY, "1");
  };

  if (dismissed || allDone) return null;

  return (
    <div className="fixed bottom-6 right-6 z-40">
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: 12, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 12, scale: 0.95 }}
            transition={{ duration: 0.2, ease: "easeOut" }}
            className="mb-3 w-72 rounded-2xl overflow-hidden"
            style={{
              background: "rgba(10,9,20,0.97)",
              border: "1px solid rgba(201,168,76,0.25)",
              backdropFilter: "blur(20px)",
              boxShadow: "0 16px 48px rgba(0,0,0,0.6)",
            }}
          >
            {/* Header */}
            <div
              className="flex items-center justify-between px-4 py-3"
              style={{ borderBottom: "1px solid rgba(201,168,76,0.12)" }}
            >
              <div>
                <span className="font-cinzel text-sm" style={{ color: "#C9A84C" }}>Getting Started</span>
                <span className="font-sans text-xs ml-2" style={{ color: "rgba(240,235,225,0.3)" }}>
                  {completedCount}/3
                </span>
              </div>
              <button
                onClick={dismiss}
                className="p-1 rounded-lg transition-opacity hover:opacity-60 cursor-pointer"
                style={{ color: "rgba(240,235,225,0.3)" }}
                aria-label="Dismiss guide"
              >
                <X size={14} />
              </button>
            </div>

            {/* Progress bar */}
            <div className="h-0.5 w-full" style={{ background: "rgba(201,168,76,0.08)" }}>
              <motion.div
                className="h-full"
                style={{ background: "#C9A84C" }}
                initial={{ width: 0 }}
                animate={{ width: `${(completedCount / 3) * 100}%` }}
                transition={{ duration: 0.5, ease: "easeOut" }}
              />
            </div>

            {/* Steps */}
            <div className="p-3 flex flex-col gap-2">
              {steps.map((step, i) => (
                <div
                  key={step.id}
                  className="flex items-start gap-3 rounded-xl px-3 py-2.5"
                  style={{
                    background: step.done
                      ? "rgba(201,168,76,0.04)"
                      : i === completedCount
                      ? "rgba(201,168,76,0.08)"
                      : "transparent",
                    border: i === completedCount && !step.done
                      ? "1px solid rgba(201,168,76,0.2)"
                      : "1px solid transparent",
                  }}
                >
                  <div className="mt-0.5 shrink-0" style={{ color: step.done ? "#C9A84C" : "rgba(240,235,225,0.25)" }}>
                    {step.done ? <CheckCircle2 size={16} /> : <Circle size={16} />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div
                      className="font-sans text-sm font-medium leading-tight"
                      style={{ color: step.done ? "rgba(240,235,225,0.4)" : "#F0EBE1" }}
                    >
                      {step.title}
                    </div>
                    {!step.done && (
                      <p className="font-sans text-xs mt-0.5 leading-relaxed" style={{ color: "rgba(240,235,225,0.35)" }}>
                        {step.desc}
                      </p>
                    )}
                    {!step.done && step.action && (
                      <NavLink
                        to={step.action.to}
                        onClick={() => setOpen(false)}
                        className="inline-block mt-1.5 font-cinzel text-xs transition-opacity hover:opacity-70 cursor-pointer"
                        style={{ color: "#C9A84C" }}
                      >
                        {step.action.label}
                      </NavLink>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Toggle pill */}
      <motion.button
        onClick={() => setOpen(v => !v)}
        whileHover={{ scale: 1.04 }}
        whileTap={{ scale: 0.97 }}
        className="flex items-center gap-2.5 rounded-full px-4 py-2.5 cursor-pointer transition-all duration-200"
        style={{
          background: open ? "rgba(201,168,76,0.15)" : "#C9A84C",
          border: open ? "1px solid rgba(201,168,76,0.4)" : "1px solid transparent",
          boxShadow: open ? "none" : "0 4px 20px rgba(201,168,76,0.35)",
          color: open ? "#C9A84C" : "#07060E",
        }}
      >
        <span className="font-cinzel text-sm font-semibold">
          {open ? "Close" : "Get Started"}
        </span>
        <motion.span animate={{ rotate: open ? 180 : 0 }} transition={{ duration: 0.2 }}>
          <ChevronUp size={15} />
        </motion.span>
        {!open && completedCount > 0 && (
          <span
            className="font-sans text-xs rounded-full px-1.5"
            style={{ background: "rgba(7,6,14,0.25)", color: "#07060E" }}
          >
            {completedCount}/3
          </span>
        )}
      </motion.button>
    </div>
  );
}
