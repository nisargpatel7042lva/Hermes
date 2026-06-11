import { motion } from "framer-motion";
import { NavLink } from "react-router-dom";
import { ChevronDown, Wallet, UserPlus, Briefcase, ArrowRight, Shield, Zap, Globe } from "lucide-react";
import GoldParticles from "../components/animations/GoldParticles";
import HeroBgVideo from "../components/HeroBgVideo";
import WordsPullUp from "../components/animations/WordsPullUp";
import FadeUp from "../components/animations/FadeUp";
import { useStats } from "../hooks/useStats";

export default function Landing() {
  const stats = useStats();

  return (
    <div className="relative bg-obsidian overflow-hidden">

      {/* Hero — full viewport with video background */}
      <section className="relative flex flex-col items-center justify-center min-h-screen pt-24 pb-32 px-6 text-center overflow-hidden">

        {/* Video background — z-0 */}
        <HeroBgVideo />

        {/* Gold particles float above video — z-10 */}
        <div className="absolute inset-0 z-10 pointer-events-none">
          <GoldParticles />
        </div>

        {/* Column accent lines — z-10 */}
        <div className="column-divider absolute left-[20%] top-0 h-full opacity-20 hidden lg:block z-10" />
        <div className="column-divider absolute left-[80%] top-0 h-full opacity-20 hidden lg:block z-10" />

        {/* All hero content — z-20, above video and particles */}
        <div className="relative z-20 flex flex-col items-center w-full">

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

        </div>{/* end z-20 content wrapper */}

        {/* Scroll indicator — z-20, pinned to bottom of section */}
        <div className="absolute bottom-8 left-1/2 -translate-x-1/2 flex flex-col items-center gap-2 z-20">
          <span className="font-sans text-xs" style={{ color: "rgba(240,235,225,0.35)" }}>Scroll to explore</span>
          <ChevronDown size={16} className="animate-bounce_slow" style={{ color: "rgba(201,168,76,0.5)" }} />
        </div>
      </section>

      {/* Sections below hero — solid obsidian bg */}
      <div className="bg-obsidian marble-bg">

      {/* How it works section */}
      <section className="relative z-10 max-w-5xl mx-auto px-6 pb-24">
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
              <div className="liquid-glass rounded-2xl p-6 h-full gold-shimmer-hover cursor-default">
                <div
                  className="w-10 h-10 rounded-xl flex items-center justify-center mb-4"
                  style={{ background: "rgba(201,168,76,0.12)", color: "#C9A84C" }}
                >
                  {step.icon}
                </div>
                <h3 className="font-cinzel text-lg mb-2" style={{ color: "#F0EBE1" }}>{step.title}</h3>
                <p className="font-sans text-sm leading-relaxed" style={{ color: "rgba(240,235,225,0.45)" }}>{step.desc}</p>
              </div>
            </FadeUp>
          ))}
        </div>
      </section>

      {/* Start Your Journey section */}
      <section className="relative z-10 max-w-5xl mx-auto px-6 pb-32">
        <FadeUp className="text-center mb-12">
          <span className="font-sans text-xs uppercase tracking-widest" style={{ color: "rgba(201,168,76,0.6)" }}>
            Begin Here
          </span>
          <h2 className="font-cinzel text-4xl md:text-5xl mt-3" style={{ color: "#F0EBE1" }}>
            Start in 3 Steps
          </h2>
        </FadeUp>

        <div className="relative">
          {/* Connector line */}
          <div
            className="absolute top-8 left-[calc(16.67%+1rem)] right-[calc(16.67%+1rem)] h-px hidden md:block"
            style={{ background: "linear-gradient(to right, rgba(201,168,76,0.4), rgba(201,168,76,0.1), rgba(201,168,76,0.4))" }}
          />

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {JOURNEY_STEPS.map((step, i) => (
              <FadeUp key={i} delay={i * 0.12}>
                <NavLink
                  to={step.to}
                  className="flex flex-col items-center text-center group cursor-pointer"
                >
                  {/* Icon circle */}
                  <div
                    className="relative w-16 h-16 rounded-full flex items-center justify-center mb-4 transition-all duration-300 group-hover:scale-110"
                    style={{
                      background: "rgba(201,168,76,0.1)",
                      border: "1px solid rgba(201,168,76,0.35)",
                      boxShadow: "0 0 0 0 rgba(201,168,76,0)",
                    }}
                    onMouseEnter={e => {
                      (e.currentTarget as HTMLElement).style.boxShadow = "0 0 24px rgba(201,168,76,0.2)";
                    }}
                    onMouseLeave={e => {
                      (e.currentTarget as HTMLElement).style.boxShadow = "0 0 0 0 rgba(201,168,76,0)";
                    }}
                  >
                    <span style={{ color: "#C9A84C" }}>{step.icon}</span>
                    <span
                      className="absolute -top-1 -right-1 w-5 h-5 rounded-full flex items-center justify-center font-cinzel text-xs"
                      style={{ background: "#C9A84C", color: "#07060E" }}
                    >
                      {i + 1}
                    </span>
                  </div>
                  <h3 className="font-cinzel text-base mb-2 transition-colors duration-200"
                    style={{ color: "#F0EBE1" }}>{step.title}</h3>
                  <p className="font-sans text-sm leading-relaxed mb-3" style={{ color: "rgba(240,235,225,0.4)" }}>
                    {step.desc}
                  </p>
                  <span
                    className="inline-flex items-center gap-1 font-cinzel text-xs transition-all duration-200 group-hover:gap-2"
                    style={{ color: "#C9A84C" }}
                  >
                    {step.cta} <ArrowRight size={12} />
                  </span>
                </NavLink>
              </FadeUp>
            ))}
          </div>
        </div>

        {/* Trust badges */}
        <FadeUp delay={0.4} className="mt-16">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {TRUST_BADGES.map((badge, i) => (
              <div
                key={i}
                className="liquid-glass rounded-xl px-5 py-4 flex items-center gap-3"
              >
                <div style={{ color: "#C9A84C" }}>{badge.icon}</div>
                <div>
                  <div className="font-cinzel text-sm" style={{ color: "#F0EBE1" }}>{badge.title}</div>
                  <div className="font-sans text-xs mt-0.5" style={{ color: "rgba(240,235,225,0.4)" }}>{badge.desc}</div>
                </div>
              </div>
            ))}
          </div>
        </FadeUp>
      </section>
    </div>
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
    icon: <Shield size={20} />,
    title: "Seal the Covenant",
    desc: "A client locks USDC into the escrow contract and defines milestone requirements. Funds are untouchable until work is verified.",
  },
  {
    icon: <Globe size={20} />,
    title: "Deliver the Work",
    desc: "The freelancer submits a URL — GitHub repo, Google Doc, deployed app — as proof of completion.",
  },
  {
    icon: <Zap size={20} />,
    title: "Hermes Decides",
    desc: "The AI agent fetches the deliverable, scores it against the milestone description, and releases or rejects payment on-chain. No human arbitration.",
  },
];

const JOURNEY_STEPS = [
  {
    icon: <Wallet size={22} />,
    title: "Connect Your Wallet",
    desc: "Use MetaMask or Avalanche Core on the Fuji testnet. Get test AVAX from the faucet.",
    cta: "Connect now",
    to: "/",
  },
  {
    icon: <UserPlus size={22} />,
    title: "Forge Your Identity",
    desc: "Register on-chain as a Freelancer or Client. Your reputation score starts at 500.",
    cta: "Register",
    to: "/register",
  },
  {
    icon: <Briefcase size={22} />,
    title: "Post or Find Work",
    desc: "Clients escrow USDC and define milestones. Freelancers deliver and get paid automatically.",
    cta: "Browse jobs",
    to: "/dashboard",
  },
];

const TRUST_BADGES = [
  {
    icon: <Shield size={18} />,
    title: "Escrow Protected",
    desc: "Funds locked in auditable smart contracts",
  },
  {
    icon: <Zap size={18} />,
    title: "AI Verified",
    desc: "Gemini 2.5 Flash evaluates deliverables instantly",
  },
  {
    icon: <Globe size={18} />,
    title: "On-Chain Reputation",
    desc: "Your track record lives forever on Avalanche",
  },
];
