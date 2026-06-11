import { useState } from "react";
import { Plus, X, ExternalLink } from "lucide-react";
import FadeUp from "../components/animations/FadeUp";
import TransactionToast, { ToastStatus } from "../components/TransactionToast";
import { useWallet } from "../contexts/WalletContext";
import { useContract, formatUSDC } from "../hooks/useContract";
import { ethers } from "ethers";
import addresses from "../contracts/addresses.json";

interface Milestone {
  id: string;
  description: string;
  amount: string;
}

export default function PostJob() {
  const { isConnected, account } = useWallet();
  const { approveUSDC, createJob, getAgentByWallet } = useContract();

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [freelancer, setFreelancer] = useState("");
  const [milestones, setMilestones] = useState<Milestone[]>([
    { id: "1", description: "", amount: "" },
  ]);

  const [step, setStep] = useState<"idle" | "approving" | "approved" | "creating" | "done">("idle");
  const [toast, setToast] = useState<ToastStatus>(null);
  const [txHash, setTxHash] = useState<string>();
  const [errMsg, setErrMsg] = useState<string>();

  const total = milestones.reduce((s, m) => s + (parseFloat(m.amount) || 0), 0);

  const addMilestone = () =>
    setMilestones(ms => [...ms, { id: Date.now().toString(), description: "", amount: "" }]);

  const removeMilestone = (id: string) =>
    setMilestones(ms => ms.filter(m => m.id !== id));

  const updateMilestone = (id: string, field: "description" | "amount", val: string) =>
    setMilestones(ms => ms.map(m => (m.id === id ? { ...m, [field]: val } : m)));

  const handleApprove = async () => {
    if (!isConnected || total === 0) return;
    setStep("approving");
    setToast("pending");
    try {
      await approveUSDC(total.toString());
      setToast(null);
      setStep("approved");
    } catch (e: any) {
      setErrMsg(e?.reason ?? e?.info?.error?.message ?? e?.shortMessage ?? e?.message ?? "Approval failed");
      setToast("error");
      setStep("idle");
    }
  };

  const handleCreate = async () => {
    if (!isConnected || !title || !freelancer || milestones.some(m => !m.description || !m.amount)) return;
    if (!ethers.isAddress(freelancer)) {
      setErrMsg("The gods have spoken: invalid freelancer address");
      setToast("error");
      return;
    }
    setStep("creating");
    setToast("pending");
    try {
      let freelancerERC8004Id = ethers.ZeroHash;
      let clientERC8004Id = ethers.ZeroHash;
      try {
        const fAgent = await getAgentByWallet(freelancer);
        if (fAgent) freelancerERC8004Id = fAgent.id;
        if (account) {
          const cAgent = await getAgentByWallet(account);
          if (cAgent) clientERC8004Id = cAgent.id;
        }
      } catch {}

      const hash = await createJob(
        freelancer,
        title,
        description,
        milestones.map(m => m.description),
        milestones.map(m => m.amount),
        freelancerERC8004Id,
        clientERC8004Id,
      );
      setTxHash(hash);
      setToast("success");
      setStep("done");
    } catch (e: any) {
      setErrMsg(e?.reason ?? e?.info?.error?.message ?? e?.shortMessage ?? e?.message ?? "Transaction failed");
      setToast("error");
      setStep("approved");
    }
  };

  return (
    <div className="min-h-screen pt-28 pb-20 px-6" style={{ background: "#07060E" }}>
      <div className="max-w-3xl mx-auto">

        {/* Header */}
        <FadeUp className="mb-12">
          <span className="font-sans text-xs uppercase tracking-widest" style={{ color: "rgba(201,168,76,0.6)" }}>
            Client Console
          </span>
          <h1 className="font-cinzel text-5xl mt-2 mb-2" style={{ color: "#F0EBE1" }}>
            Seal the Covenant
          </h1>
          <p className="font-instrument italic text-xl" style={{ color: "rgba(240,235,225,0.4)" }}>
            Lock your offering. Hermes ensures delivery.
          </p>
        </FadeUp>

        {/* Form */}
        <FadeUp delay={0.1}>
          <div className="liquid-glass rounded-3xl p-8 space-y-6">

            <Field label="Job Title">
              <input
                type="text"
                value={title}
                onChange={e => setTitle(e.target.value)}
                placeholder="e.g. Build a Web3 Dashboard"
                className="input-field"
              />
            </Field>

            <Field label="Description">
              <textarea
                value={description}
                onChange={e => setDescription(e.target.value)}
                placeholder="Describe the full scope of work..."
                rows={4}
                className="input-field resize-none"
              />
            </Field>

            <Field label="Freelancer Wallet Address">
              <input
                type="text"
                value={freelancer}
                onChange={e => setFreelancer(e.target.value)}
                placeholder="0x..."
                className="input-field font-mono text-sm"
              />
            </Field>

            {/* Milestones */}
            <div>
              <div className="flex items-center justify-between mb-3">
                <label className="font-sans text-xs uppercase tracking-widest" style={{ color: "rgba(201,168,76,0.6)" }}>
                  Milestones
                </label>
                <button
                  onClick={addMilestone}
                  className="flex items-center gap-1 font-sans text-sm transition-opacity hover:opacity-70"
                  style={{ color: "#C9A84C" }}
                >
                  <Plus size={14} /> Add Milestone
                </button>
              </div>

              <div className="space-y-3">
                {milestones.map((m, i) => (
                  <div key={m.id} className="liquid-glass rounded-xl p-4 flex items-center gap-3">
                    <span className="font-cinzel text-xs shrink-0" style={{ color: "#C9A84C" }}>
                      {String(i + 1).padStart(2, "0")}
                    </span>
                    <input
                      type="text"
                      value={m.description}
                      onChange={e => updateMilestone(m.id, "description", e.target.value)}
                      placeholder="Milestone description..."
                      className="flex-1 bg-transparent outline-none font-sans text-sm"
                      style={{ color: "#F0EBE1" }}
                    />
                    <div className="flex items-center gap-1 shrink-0">
                      <input
                        type="number"
                        value={m.amount}
                        onChange={e => updateMilestone(m.id, "amount", e.target.value)}
                        placeholder="0"
                        min="0"
                        className="w-20 bg-transparent outline-none font-sans text-sm text-right"
                        style={{ color: "#C9A84C" }}
                      />
                      <span className="font-sans text-xs" style={{ color: "rgba(201,168,76,0.5)" }}>USDC</span>
                    </div>
                    {milestones.length > 1 && (
                      <button
                        onClick={() => removeMilestone(m.id)}
                        className="text-marble/30 hover:text-avax transition-colors"
                      >
                        <X size={14} />
                      </button>
                    )}
                  </div>
                ))}
              </div>

              {/* Total */}
              <div className="liquid-glass rounded-xl p-4 mt-4 flex items-center justify-between">
                <span className="font-sans text-sm" style={{ color: "rgba(240,235,225,0.5)" }}>
                  Total Escrow Amount
                </span>
                <span className="font-cinzel text-2xl" style={{ color: "#C9A84C" }}>
                  {total.toFixed(2)} USDC
                </span>
              </div>
            </div>

            {/* Actions */}
            <div className="space-y-3 pt-2">
              <button
                onClick={handleApprove}
                disabled={!isConnected || total === 0 || step !== "idle"}
                className="w-full rounded-2xl py-4 font-cinzel tracking-wider text-sm transition-all hover:scale-[1.02] disabled:opacity-40 disabled:cursor-not-allowed"
                style={{ background: step === "approved" || step === "creating" || step === "done" ? "rgba(201,168,76,0.2)" : "#C9A84C", color: step === "approved" || step === "creating" || step === "done" ? "#C9A84C" : "#07060E" }}
              >
                {step === "approving" ? "Approving USDC..." : "① Approve USDC"}
              </button>

              <button
                onClick={handleCreate}
                disabled={step !== "approved" || !title || !freelancer}
                className="w-full rounded-2xl py-4 font-cinzel tracking-wider text-sm transition-all hover:scale-[1.02] disabled:opacity-40 disabled:cursor-not-allowed"
                style={{ background: "#C9A84C", color: "#07060E" }}
              >
                {step === "creating"
                  ? "Hermes seals the covenant..."
                  : step === "done"
                  ? "The contract is written in stone. ⚡"
                  : "② Seal the Covenant"}
              </button>

              {step === "done" && txHash && (
                <a
                  href={`https://testnet.snowtrace.io/tx/${txHash}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center justify-center gap-2 font-sans text-xs transition-colors hover:opacity-70"
                  style={{ color: "rgba(240,235,225,0.4)" }}
                >
                  View on Snowtrace <ExternalLink size={12} />
                </a>
              )}
            </div>
          </div>
        </FadeUp>
      </div>

      <TransactionToast status={toast} txHash={txHash} errorMsg={errMsg} onDismiss={() => setToast(null)} />

      <style>{`
        .input-field {
          width: 100%;
          background: transparent;
          border: 1px solid rgba(240,235,225,0.1);
          border-radius: 0.75rem;
          padding: 0.75rem 1rem;
          font-family: Inter, sans-serif;
          font-size: 0.875rem;
          color: #F0EBE1;
          outline: none;
          transition: border-color 0.2s;
        }
        .input-field::placeholder { color: rgba(240,235,225,0.2); }
        .input-field:focus { border-color: rgba(201,168,76,0.4); }
      `}</style>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block font-sans text-xs uppercase tracking-widest mb-2" style={{ color: "rgba(201,168,76,0.6)" }}>
        {label}
      </label>
      {children}
    </div>
  );
}
