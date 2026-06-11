import { useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ExternalLink } from "lucide-react";

export type ToastStatus = "pending" | "success" | "error" | null;

interface Props {
  status: ToastStatus;
  txHash?: string;
  errorMsg?: string;
  onDismiss: () => void;
}

export default function TransactionToast({ status, txHash, errorMsg, onDismiss }: Props) {
  useEffect(() => {
    if (status === "success") {
      const t = setTimeout(onDismiss, 5000);
      return () => clearTimeout(t);
    }
  }, [status, onDismiss]);

  return (
    <AnimatePresence>
      {status && (
        <motion.div
          initial={{ opacity: 0, x: 80 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: 80 }}
          className="fixed bottom-6 right-6 z-50 liquid-glass rounded-2xl p-4 min-w-[300px] max-w-sm"
        >
          {status === "pending" && (
            <div className="flex items-start gap-3">
              <span className="text-xl animate-spin" style={{ color: "#C9A84C" }}>☤</span>
              <div>
                <p className="font-cinzel text-sm" style={{ color: "#C9A84C" }}>Hermes is delivering...</p>
                <p className="font-sans text-xs text-marble/40 mt-0.5">Transaction submitted</p>
              </div>
            </div>
          )}
          {status === "success" && (
            <div className="flex items-start gap-3">
              <span className="text-xl" style={{ color: "#C9A84C" }}>⚡</span>
              <div className="flex-1">
                <p className="font-cinzel text-sm" style={{ color: "#C9A84C" }}>Delivered by the gods</p>
                {txHash && (
                  <a
                    href={`https://testnet.snowtrace.io/tx/${txHash}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1 font-sans text-xs text-marble/40 hover:text-marble/70 mt-1 transition-colors"
                  >
                    {txHash.slice(0, 10)}...{txHash.slice(-6)}
                    <ExternalLink size={10} />
                  </a>
                )}
              </div>
              <button onClick={onDismiss} className="text-marble/30 hover:text-marble/60 text-xs">✕</button>
            </div>
          )}
          {status === "error" && (
            <div className="flex items-start gap-3">
              <span className="text-xl" style={{ color: "#E84142" }}>✕</span>
              <div className="flex-1">
                <p className="font-cinzel text-sm" style={{ color: "#E84142" }}>The gods have refused</p>
                <p className="font-sans text-xs text-marble/40 mt-0.5 line-clamp-2">{errorMsg}</p>
              </div>
              <button onClick={onDismiss} className="text-marble/30 hover:text-marble/60 text-xs">✕</button>
            </div>
          )}
        </motion.div>
      )}
    </AnimatePresence>
  );
}
