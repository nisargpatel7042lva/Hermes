import { motion, AnimatePresence } from "framer-motion";
import { X } from "lucide-react";
import { useWallet } from "../contexts/WalletContext";

export default function WalletPicker() {
  const { showPicker, setShowPicker, availableWallets, connectWithProvider } = useWallet();

  return (
    <AnimatePresence>
      {showPicker && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[200] flex items-center justify-center"
          style={{ background: "rgba(7,6,14,0.85)", backdropFilter: "blur(10px)" }}
          onClick={() => setShowPicker(false)}
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.9, y: 24 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.9, y: 24 }}
            transition={{ ease: "easeOut", duration: 0.22 }}
            className="liquid-glass rounded-3xl p-8 w-full max-w-sm mx-4"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-6">
              <div>
                <span className="font-cinzel text-xs uppercase tracking-widest" style={{ color: "rgba(201,168,76,0.6)" }}>
                  Wallet
                </span>
                <h2 className="font-cinzel text-xl mt-1" style={{ color: "#F0EBE1" }}>
                  Choose a Wallet
                </h2>
              </div>
              <button
                onClick={() => setShowPicker(false)}
                className="p-1 transition-opacity hover:opacity-60"
                style={{ color: "rgba(240,235,225,0.4)" }}
              >
                <X size={18} />
              </button>
            </div>

            <div className="space-y-3">
              {availableWallets.map((w) => (
                <button
                  key={w.info.uuid}
                  onClick={() => connectWithProvider(w)}
                  className="w-full flex items-center gap-4 rounded-2xl p-4 text-left transition-all hover:scale-[1.02]"
                  style={{
                    background: "rgba(240,235,225,0.03)",
                    border: "1px solid rgba(201,168,76,0.15)",
                  }}
                >
                  <img
                    src={w.info.icon}
                    alt={w.info.name}
                    className="w-10 h-10 rounded-xl shrink-0"
                  />
                  <div className="flex-1 min-w-0">
                    <div className="font-cinzel text-sm" style={{ color: "#F0EBE1" }}>
                      {w.info.name}
                    </div>
                    <div className="font-mono text-xs mt-0.5 truncate" style={{ color: "rgba(240,235,225,0.25)" }}>
                      {w.info.rdns}
                    </div>
                  </div>
                  <span className="font-sans text-sm shrink-0" style={{ color: "#C9A84C" }}>→</span>
                </button>
              ))}
            </div>

            <p className="font-sans text-xs text-center mt-6" style={{ color: "rgba(240,235,225,0.2)" }}>
              Your keys, your coins. Hermes never holds funds.
            </p>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
