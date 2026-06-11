import { motion } from "framer-motion";
import { NavLink } from "react-router-dom";
import { ChevronDown } from "lucide-react";
import GoldParticles from "../components/animations/GoldParticles";
import WordsPullUp from "../components/animations/WordsPullUp";
import FadeUp from "../components/animations/FadeUp";
import { useStats } from "../hooks/useStats";

export default function Landing() {
  const stats = useStats();

  return (
    <div className="relative min-h-screen bg-obsidian marble-bg overflow-hidden">
      <GoldParticles />

      {/* Column accent lines */}
      <div className="column-divider absolute left-[20%] top-0 h-full opacity-40 hidden lg:block" />
      <div className="column-divider absolute left-[80%] top-0 h-full opacity-40 hidden lg:block" />

      {/* Hero */}
      <section className="relative z-10 flex flex-col items-center justify-center min-h-screen pt-24 pb-32 px-6 text-center">

        {/* Badge */}
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.2 }}
          className="liquid-glass rounded-full px-4 py-1.5 inline-flex items-center gap-2 mb-10"
        >
          <span className="w-2 h-2 rounded-full bg-avax animate-pulse" />
          <span className="font-sans text-xs" style={{ color: "rgba(201,168,76,0.8)" }}>
            Live on Avalanche Fuji
          </span>
        </motion.div>

        {/* Title */}
        <h1
          className="font-cinzel font-bold leading-none mb-4"
          style={{
            fontSize: "clamp(5rem, 18vw, 14rem)",
            letterSpacing: "0.12em",
          }}
        >
          <WordsPullUp
            text="HERMES"
            className="gold-text-gradient"
            delay={0}
          />
        </h1>

        {/* Subtitle in Instrument Serif */}
        <p className="font-instrument italic text-2xl md:text-3xl mb-6" style={{ color: "rgba(240,235,225,0.5)" }}>
          <WordsPullUp text="Guardian of Commerce" delay={0.3} />
        </p>

        {/* Description */}
        <FadeUp delay={0.5} className="max-w-lg mx-auto mb-10">
          <p className="font-sans font-light text-base leading-relaxed" style={{ color: "rgba(240,235,225,0.45)" }}>
            An autonomous payment agent that verifies freelance work and releases USDC
            the moment your milestone is complete. No chasing. No trust required.
          </p>
        </FadeUp>

        {/* CTA Buttons */}
        <FadeUp delay={0.6} className="flex flex-wrap items-center justify-center gap-4 mb-16">
          <NavLink
            to="/post-job"
            className="font-cinzel font-semibold text-sm tracking-wider rounded-full px-8 py-3.5 transition-all duration-200 hover:scale-105"
            style={{ background: "#C9A84C", color: "#07060E" }}
          >
            Post a Job
          </NavLink>
          <NavLink
            to="/register"
            className="liquid-glass font-cinzel text-sm tracking-wider rounded-full px-8 py-3.5 transition-all duration-200"
            style={{ color: "#C9A84C" }}
          >
            Register as Agent
          </NavLink>
        </FadeUp>

        {/* Stats bar */}
        <FadeUp delay={0.8} className="w-full max-w-2xl mx-auto">
          <div className="liquid-glass rounded-2xl px-8 py-5 flex items-center justify-center gap-0">
            <Stat label="Jobs Protected" value={String(stats.totalJobs)} />
            <div className="column-divider h-10 mx-8" />
            <Stat label="USDC Released" value={`$${stats.totalUSDCReleased}`} />
            <div className="column-divider h-10 mx-8" />
            <Stat label="Agents Verified" value={String(stats.totalAgents)} />
          </div>
        </FadeUp>

        {/* Scroll indicator */}
        <div className="absolute bottom-8 left-1/2 -translate-x-1/2 flex flex-col items-center gap-2">
          <span className="font-sans text-xs" style={{ color: "rgba(240,235,225,0.25)" }}>Scroll to explore</span>
          <ChevronDown size={16} className="animate-bounce_slow" style={{ color: "rgba(201,168,76,0.4)" }} />
        </div>
      </section>

      {/* How it works section */}
      <section className="relative z-10 max-w-5xl mx-auto px-6 pb-32">
        <FadeUp className="text-center mb-16">
          <span className="font-sans text-xs uppercase tracking-widest" style={{ color: "rgba(201,168,76,0.6)" }}>
            The Divine Process
          </span>
          <h2 className="font-cinzel text-4xl md:text-5xl mt-3" style={{ color: "#F0EBE1" }}>
            How Hermes Works
          </h2>
        </FadeUp>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {STEPS.map((step, i) => (
            <FadeUp key={i} delay={i * 0.1}>
              <div className="liquid-glass rounded-2xl p-6 h-full gold-shimmer-hover">
                <div className="font-cinzel text-3xl mb-4" style={{ color: "#C9A84C" }}>{step.icon}</div>
                <h3 className="font-cinzel text-lg mb-2" style={{ color: "#F0EBE1" }}>{step.title}</h3>
                <p className="font-sans text-sm leading-relaxed" style={{ color: "rgba(240,235,225,0.45)" }}>{step.desc}</p>
              </div>
            </FadeUp>
          ))}
        </div>
      </section>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="text-center flex-1">
      <div className="font-cinzel text-3xl mb-1" style={{ color: "#C9A84C" }}>{value}</div>
      <div className="font-sans text-xs uppercase tracking-widest" style={{ color: "rgba(240,235,225,0.35)" }}>{label}</div>
    </div>
  );
}

const STEPS = [
  {
    icon: "Ⅰ",
    title: "Seal the Covenant",
    desc: "A client locks USDC into the escrow contract and defines milestone requirements. Funds are untouchable until work is verified.",
  },
  {
    icon: "Ⅱ",
    title: "Deliver the Work",
    desc: "The freelancer submits a URL — GitHub repo, Google Doc, deployed app — as proof of completion.",
  },
  {
    icon: "Ⅲ",
    title: "Hermes Decides",
    desc: "The AI agent fetches the deliverable, scores it against the milestone description, and releases or rejects payment on-chain. No human arbitration.",
  },
];
