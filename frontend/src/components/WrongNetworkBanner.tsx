import { motion, AnimatePresence } from "framer-motion";
import { useWallet } from "../contexts/WalletContext";

export default function WrongNetworkBanner() {
  const { isConnected, isCorrectNetwork, switchToFuji } = useWallet();

  const show = isConnected && !isCorrectNetwork;

  return (
    <AnimatePresence>
      {show && (
        <motion.div
          initial={{ y: -60, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: -60, opacity: 0 }}
          className="fixed top-16 left-0 right-0 z-40 flex items-center justify-center gap-4 px-4 py-2.5"
          style={{ background: "rgba(232,65,66,0.9)", backdropFilter: "blur(8px)" }}
        >
          <span className="font-cinzel text-sm text-white">
            You stand outside Avalanche territory. Switch to Fuji Testnet to proceed.
          </span>
          <button
            onClick={switchToFuji}
            className="font-cinzel text-xs px-4 py-1.5 rounded-full bg-white/20 hover:bg-white/30 text-white transition-colors"
          >
            Switch Network
          </button>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
