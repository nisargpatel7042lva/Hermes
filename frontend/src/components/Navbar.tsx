import { useState, useEffect } from "react";
import { NavLink, useLocation } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { Menu, X } from "lucide-react";
import { useWallet } from "../contexts/WalletContext";

const LINKS = [
  { label: "Jobs", to: "/dashboard" },
  { label: "Register", to: "/register" },
  { label: "Post Job", to: "/post-job" },
  { label: "Profile", to: "/profile" },
];

export default function Navbar() {
  const [scrolled, setScrolled] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const { account, isConnected, connectWallet } = useWallet();
  const location = useLocation();

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 50);
    window.addEventListener("scroll", onScroll);
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => setMenuOpen(false), [location]);

  const shorten = (addr: string) => `${addr.slice(0, 6)}...${addr.slice(-4)}`;

  return (
    <header
      className="fixed top-0 left-0 right-0 z-50 transition-all duration-300"
      style={scrolled ? {
        backdropFilter: "blur(20px)",
        WebkitBackdropFilter: "blur(20px)",
        borderBottom: "1px solid rgba(201,168,76,0.15)",
      } : {}}
    >
      <nav className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
        {/* Logo */}
        <NavLink to="/" className="flex items-center gap-2 select-none">
          <span className="font-cinzel text-2xl" style={{ color: "#C9A84C" }}>Ω</span>
          <span className="font-cinzel text-lg tracking-widest" style={{ color: "#C9A84C" }}>HERMES</span>
        </NavLink>

        {/* Center links — desktop */}
        <div className="hidden md:flex items-center gap-8">
          {LINKS.map(({ label, to }) => (
            <NavLink
              key={to}
              to={to}
              className={({ isActive }) =>
                `relative font-sans text-sm transition-colors duration-200 ${
                  isActive ? "text-gold" : "text-marble/50 hover:text-marble"
                }`
              }
              style={({ isActive }) => isActive ? { color: "#C9A84C" } : {}}
            >
              {({ isActive }) => (
                <>
                  {label}
                  {isActive && (
                    <motion.span
                      layoutId="nav-dot"
                      className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full"
                      style={{ background: "#C9A84C" }}
                    />
                  )}
                </>
              )}
            </NavLink>
          ))}
        </div>

        {/* Right — wallet */}
        <div className="hidden md:block">
          {isConnected && account ? (
            <div className="liquid-glass rounded-full px-4 py-2 flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-green-400" />
              <span className="font-sans text-sm text-marble/70">{shorten(account)}</span>
              <span className="font-sans text-xs text-marble/30">Fuji</span>
            </div>
          ) : (
            <button
              onClick={connectWallet}
              className="liquid-glass rounded-full px-5 py-2 font-sans text-sm transition-all duration-200 hover:scale-105"
              style={{ color: "#C9A84C", border: "1px solid rgba(201,168,76,0.3)" }}
            >
              Connect Wallet
            </button>
          )}
        </div>

        {/* Mobile hamburger */}
        <button
          className="md:hidden p-2 text-marble/60"
          onClick={() => setMenuOpen(!menuOpen)}
        >
          {menuOpen ? <X size={20} /> : <Menu size={20} />}
        </button>
      </nav>

      {/* Mobile drawer */}
      <AnimatePresence>
        {menuOpen && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="md:hidden overflow-hidden"
            style={{ background: "rgba(7,6,14,0.97)", borderBottom: "1px solid rgba(201,168,76,0.15)" }}
          >
            <div className="px-6 py-4 flex flex-col gap-4">
              {LINKS.map(({ label, to }) => (
                <NavLink
                  key={to}
                  to={to}
                  className="font-sans text-sm text-marble/60 hover:text-marble transition-colors"
                >
                  {label}
                </NavLink>
              ))}
              {!isConnected && (
                <button
                  onClick={connectWallet}
                  className="font-sans text-sm mt-2 py-2 rounded-full liquid-glass"
                  style={{ color: "#C9A84C" }}
                >
                  Connect Wallet
                </button>
              )}
              {isConnected && account && (
                <span className="font-mono text-xs text-marble/30">{shorten(account)}</span>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </header>
  );
}
