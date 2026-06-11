import { useState, useEffect, useRef } from "react";
import { NavLink, useLocation } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { Menu, X, Copy, RefreshCw, LogOut, Check } from "lucide-react";
import { useWallet } from "../contexts/WalletContext";

const LINKS = [
  { label: "Jobs", to: "/dashboard" },
  { label: "Register", to: "/register" },
  { label: "Post Job", to: "/post-job" },
  { label: "Profile", to: "/profile" },
];

function WalletDropdown({ account }: { account: string }) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const { disconnect, connectWallet, setShowPicker, availableWallets } = useWallet();
  const ref = useRef<HTMLDivElement>(null);

  const shorten = (addr: string) => `${addr.slice(0, 6)}...${addr.slice(-4)}`;

  // Close on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const copyAddress = () => {
    navigator.clipboard.writeText(account);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const changeWallet = () => {
    setOpen(false);
    if (availableWallets.length > 1) {
      setShowPicker(true);
    } else {
      disconnect();
      connectWallet();
    }
  };

  const handleDisconnect = () => {
    setOpen(false);
    disconnect();
  };

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen(v => !v)}
        className="liquid-glass rounded-full px-4 py-2 flex items-center gap-2 transition-all duration-200 hover:scale-105"
        style={{ border: open ? "1px solid rgba(201,168,76,0.4)" : "1px solid rgba(201,168,76,0.15)" }}
      >
        <span className="w-2 h-2 rounded-full bg-green-400 shrink-0" />
        <span className="font-sans text-sm" style={{ color: "rgba(240,235,225,0.7)" }}>{shorten(account)}</span>
        <span className="font-sans text-xs" style={{ color: "rgba(240,235,225,0.25)" }}>Fuji</span>
        <motion.span
          animate={{ rotate: open ? 180 : 0 }}
          transition={{ duration: 0.2 }}
          className="font-sans text-xs ml-0.5"
          style={{ color: "rgba(201,168,76,0.5)" }}
        >
          ▾
        </motion.span>
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -8, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -8, scale: 0.96 }}
            transition={{ duration: 0.15, ease: "easeOut" }}
            className="absolute right-0 mt-2 w-52 rounded-2xl overflow-hidden"
            style={{
              background: "rgba(15,13,26,0.97)",
              border: "1px solid rgba(201,168,76,0.18)",
              backdropFilter: "blur(20px)",
              boxShadow: "0 8px 32px rgba(0,0,0,0.5)",
            }}
          >
            {/* Address display */}
            <div className="px-4 pt-4 pb-3" style={{ borderBottom: "1px solid rgba(240,235,225,0.06)" }}>
              <div className="font-sans text-xs mb-1" style={{ color: "rgba(240,235,225,0.3)" }}>Connected</div>
              <div className="font-mono text-xs break-all" style={{ color: "rgba(240,235,225,0.6)" }}>
                {account.slice(0, 10)}...{account.slice(-8)}
              </div>
            </div>

            {/* Actions */}
            <div className="p-2">
              <DropdownItem icon={copied ? <Check size={14} /> : <Copy size={14} />} onClick={copyAddress}>
                {copied ? "Copied!" : "Copy Address"}
              </DropdownItem>
              <DropdownItem icon={<RefreshCw size={14} />} onClick={changeWallet}>
                Change Wallet
              </DropdownItem>
              <DropdownItem icon={<LogOut size={14} />} onClick={handleDisconnect} danger>
                Disconnect
              </DropdownItem>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function DropdownItem({
  icon, children, onClick, danger,
}: {
  icon: React.ReactNode;
  children: React.ReactNode;
  onClick: () => void;
  danger?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left transition-all hover:scale-[1.01]"
      style={{
        color: danger ? "#E84142" : "rgba(240,235,225,0.6)",
        background: "transparent",
      }}
      onMouseEnter={e => {
        (e.currentTarget as HTMLElement).style.background = danger
          ? "rgba(232,65,66,0.08)"
          : "rgba(240,235,225,0.05)";
      }}
      onMouseLeave={e => {
        (e.currentTarget as HTMLElement).style.background = "transparent";
      }}
    >
      <span style={{ color: danger ? "#E84142" : "rgba(201,168,76,0.7)" }}>{icon}</span>
      <span className="font-sans text-sm">{children}</span>
    </button>
  );
}

export default function Navbar() {
  const [scrolled, setScrolled] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const { account, isConnected, connectWallet, disconnect } = useWallet();
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
            <WalletDropdown account={account} />
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
              {!isConnected ? (
                <button
                  onClick={connectWallet}
                  className="font-sans text-sm mt-2 py-2 rounded-full liquid-glass"
                  style={{ color: "#C9A84C" }}
                >
                  Connect Wallet
                </button>
              ) : account && (
                <div className="flex flex-col gap-2 pt-1" style={{ borderTop: "1px solid rgba(240,235,225,0.06)" }}>
                  <span className="font-mono text-xs pt-2" style={{ color: "rgba(240,235,225,0.3)" }}>
                    {shorten(account)}
                  </span>
                  <button
                    onClick={() => { navigator.clipboard.writeText(account); }}
                    className="font-sans text-xs text-left"
                    style={{ color: "rgba(201,168,76,0.6)" }}
                  >
                    Copy address
                  </button>
                  <button
                    onClick={disconnect}
                    className="font-sans text-xs text-left"
                    style={{ color: "#E84142" }}
                  >
                    Disconnect
                  </button>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </header>
  );
}
