import { useLocation, Routes, Route } from "react-router-dom";
import { AnimatePresence, motion } from "framer-motion";
import Navbar from "./components/Navbar";
import WrongNetworkBanner from "./components/WrongNetworkBanner";
import WalletPicker from "./components/WalletPicker";
import GettingStarted from "./components/GettingStarted";
import Landing from "./pages/Landing";
import Register from "./pages/Register";
import PostJob from "./pages/PostJob";
import Dashboard from "./pages/Dashboard";
import Profile from "./pages/Profile";

const pageVariants = {
  initial: { opacity: 0, y: 20 },
  in: { opacity: 1, y: 0 },
  out: { opacity: 0, y: -10 },
};
const pageTransition = { duration: 0.4, ease: "easeOut" as const };

export default function App() {
  const location = useLocation();

  return (
    <>
      <Navbar />
      <WrongNetworkBanner />
      <WalletPicker />
      <GettingStarted />
      <AnimatePresence mode="wait">
        <motion.div
          key={location.pathname}
          initial="initial"
          animate="in"
          exit="out"
          variants={pageVariants}
          transition={pageTransition}
        >
          <Routes location={location}>
            <Route path="/" element={<Landing />} />
            <Route path="/register" element={<Register />} />
            <Route path="/post-job" element={<PostJob />} />
            <Route path="/dashboard" element={<Dashboard />} />
            <Route path="/profile" element={<Profile />} />
            <Route path="/profile/:address" element={<Profile />} />
          </Routes>
        </motion.div>
      </AnimatePresence>
    </>
  );
}
