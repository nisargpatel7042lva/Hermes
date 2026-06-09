export default function Home() {
  return (
    <main className="min-h-screen flex flex-col items-center justify-center gap-8 px-4">
      {/* Logo / Hero */}
      <div className="text-center space-y-4">
        <h1 className="font-serif text-6xl md:text-8xl font-black tracking-widest gold-shimmer">
          HERMES
        </h1>
        <div className="column-divider w-64 mx-auto">
          <span className="px-4 text-gold-500 font-serif text-sm tracking-[0.3em] uppercase">
            ⚡ Messenger of Commerce ⚡
          </span>
        </div>
        <p className="text-marble-400 text-lg max-w-md mx-auto leading-relaxed">
          Autonomous milestone payment agent for freelancers — powered by
          Avalanche & AI
        </p>
      </div>

      {/* Status card */}
      <div className="border border-gold-800 bg-obsidian-900 rounded-lg px-8 py-6 text-center space-y-2 w-full max-w-sm">
        <p className="text-marble-500 text-xs font-mono uppercase tracking-widest">
          Network
        </p>
        <p className="text-gold-400 font-mono font-medium">
          Avalanche Fuji Testnet
        </p>
        <p className="text-marble-600 text-xs font-mono">chainId: 43113</p>
      </div>
    </main>
  );
}
