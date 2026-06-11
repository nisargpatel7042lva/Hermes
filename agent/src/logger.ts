// ANSI escape codes — no external dependency needed
const C = {
  reset:  "\x1b[0m",
  bold:   "\x1b[1m",
  dim:    "\x1b[2m",
  gold:   "\x1b[33m",
  green:  "\x1b[32m",
  red:    "\x1b[31m",
  cyan:   "\x1b[36m",
  yellow: "\x1b[93m",
  white:  "\x1b[37m",
};

function ts(): string {
  return new Date().toISOString().replace("T", " ").slice(0, 19);
}

function line(icon: string, color: string, msg: string): void {
  console.log(`${C.dim}[${ts()}]${C.reset} ${color}${icon}${C.reset}  ${msg}`);
}

export const logger = {
  // ── Standard levels ────────────────────────────────────────────────────────
  info:    (msg: string) => line("ℹ", C.cyan,  msg),
  success: (msg: string) => line("✓", C.green, msg),
  warn:    (msg: string) => line("⚠", C.yellow, msg),
  poll:    (msg: string) => line("↻", C.dim,   `${C.dim}${msg}${C.reset}`),

  error: (msg: string, err?: unknown) => {
    line("✗", C.red, msg);
    if (err) console.log(`${C.dim}         ${String(err)}${C.reset}`);
  },

  // ── Startup banner ─────────────────────────────────────────────────────────
  banner(): void {
    console.log();
    console.log(`${C.gold}${C.bold}╔══════════════════════════════════════════════════╗`);
    console.log(`║         ⚡  HERMES AGENT AWAKENS  ⚡           ║`);
    console.log(`║  The gods of commerce watch over all transactions  ║`);
    console.log(`╚══════════════════════════════════════════════════╝${C.reset}`);
    console.log();
  },

  // ── Milestone verdict ──────────────────────────────────────────────────────
  verdict(
    jobId: number,
    milestoneId: number,
    passed: boolean,
    score: number,
    reasoning: string,
    keyFindings: string[]
  ): void {
    const icon  = passed ? `${C.green}✓ PASS` : `${C.red}✗ FAIL`;
    const bar   = buildScoreBar(score, passed);
    console.log();
    console.log(`   ${C.bold}⚖  VERDICT${C.reset} · Job #${jobId} · Milestone #${milestoneId}`);
    console.log(`   ${icon}${C.reset}  Score ${C.bold}${score}/100${C.reset}  ${bar}`);
    console.log(`   ${C.dim}${reasoning}${C.reset}`);
    if (keyFindings.length) {
      keyFindings.forEach((f) => console.log(`   ${C.dim}• ${f}${C.reset}`));
    }
  },

  // ── Payment released ───────────────────────────────────────────────────────
  release(jobId: number, milestoneId: number, amountUsdc: string, txHash: string): void {
    console.log();
    console.log(`${C.gold}${C.bold}  ⚡ HERMES HAS SPOKEN ⚡${C.reset}`);
    console.log(`${C.green}${C.bold}  ✓  MILESTONE RELEASED — PAYMENT FLOWS${C.reset}`);
    console.log(`     Job #${C.bold}${jobId}${C.reset}  ·  Milestone #${C.bold}${milestoneId}${C.reset}  ·  ${C.gold}${amountUsdc} USDC${C.reset}`);
    console.log(`     Tx  ${C.dim}${txHash}${C.reset}`);
    console.log(`${C.dim}     "Commerce flows where honor is proven"${C.reset}`);
    console.log();
  },

  // ── Milestone rejected ─────────────────────────────────────────────────────
  reject(jobId: number, milestoneId: number, txHash: string, reason: string): void {
    console.log();
    console.log(`${C.red}${C.bold}  ⚔  THE GODS ARE DISPLEASED ⚔${C.reset}`);
    console.log(`${C.red}${C.bold}  ✗  MILESTONE REJECTED — WORK FALLS SHORT${C.reset}`);
    console.log(`     Job #${C.bold}${jobId}${C.reset}  ·  Milestone #${C.bold}${milestoneId}${C.reset}`);
    console.log(`     Tx  ${C.dim}${txHash}${C.reset}`);
    console.log(`     ${C.dim}${reason}${C.reset}`);
    console.log(`${C.dim}     "Return with worthy offerings, mortal"${C.reset}`);
    console.log();
  },

  // ── Gemini startup test ───────────────────────────────────────────────────
  geminiOnline(model: string): void {
    line("✦", C.cyan, `Gemini online  (${model})`);
  },
};

// ── Helpers ────────────────────────────────────────────────────────────────

function buildScoreBar(score: number, passed: boolean): string {
  const filled = Math.round(score / 10);
  const empty  = 10 - filled;
  const color  = passed ? C.green : C.red;
  return `${color}${"█".repeat(filled)}${C.dim}${"░".repeat(empty)}${C.reset}`;
}
