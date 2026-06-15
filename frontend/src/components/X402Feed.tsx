import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Zap, CheckCircle2, XCircle, Loader2, ExternalLink } from "lucide-react";

interface ActivityEvent {
  id:          string;
  jobId:       number;
  milestoneId: number;
  stage:       "payment_received" | "verifying" | "verdict";
  passed?:     boolean;
  score?:      number;
  reasoning?:  string;
  paymentTx?:  string;
  paidFrom?:   string;
  paidAmount:  string;
  timestamp:   number;
}

export interface VerdictInfo {
  passed:    boolean;
  score:     number;
  reasoning: string;
}

interface Props {
  onNewVerdict?: (jobId: number, milestoneId: number, info: VerdictInfo) => void;
}

const X402_URL  = import.meta.env.VITE_X402_URL ?? "http://localhost:3001";
const SNOWTRACE = "https://testnet.snowtrace.io/tx";

// Stage priority — higher wins when collapsing per-milestone
const STAGE_RANK: Record<ActivityEvent["stage"], number> = {
  payment_received: 1,
  verifying:        2,
  verdict:          3,
};

/**
 * Collapse all events for the same milestone into one card.
 * Winner is the highest-priority stage; payment info is merged from earlier stages
 * so the verdict card still shows the payment tx link.
 */
function collapseByMilestone(events: ActivityEvent[]): ActivityEvent[] {
  const byMilestone = new Map<string, ActivityEvent>();

  for (const ev of events) {
    const key      = `${ev.jobId}-${ev.milestoneId}`;
    const existing = byMilestone.get(key);

    if (!existing || STAGE_RANK[ev.stage] > STAGE_RANK[existing.stage]) {
      byMilestone.set(key, {
        ...ev,
        // Preserve payment info from earlier stages when stepping up to a higher one
        paymentTx:  ev.paymentTx  ?? existing?.paymentTx,
        paidFrom:   ev.paidFrom   ?? existing?.paidFrom,
        paidAmount: ev.paidAmount || existing?.paidAmount || "",
      });
    }
  }

  // Return newest milestone first
  return Array.from(byMilestone.values()).sort((a, b) => b.timestamp - a.timestamp);
}

export default function X402Feed({ onNewVerdict }: Props) {
  const [events, setEvents] = useState<ActivityEvent[]>([]);
  const [online, setOnline] = useState(false);
  const [collapsed, setCollapsed] = useState(false);

  // Stable ref so the polling interval never needs to restart when the callback changes
  const onNewVerdictRef = useRef(onNewVerdict);
  useEffect(() => { onNewVerdictRef.current = onNewVerdict; }, [onNewVerdict]);

  // Track which verdict IDs we've already fired the callback for
  const seenVerdictIds = useRef(new Set<string>());
  const firstPoll      = useRef(true);

  useEffect(() => {
    let mounted = true;

    const poll = async () => {
      try {
        const res = await fetch(`${X402_URL}/activity`, { signal: AbortSignal.timeout(3000) });
        if (!res.ok) throw new Error("not ok");
        const data = await res.json();
        if (!mounted) return;

        const evts: ActivityEvent[] = data.events ?? [];

        // On first poll, seed seenVerdictIds without firing callbacks (they're pre-existing)
        if (firstPoll.current) {
          evts.forEach(ev => { if (ev.stage === "verdict") seenVerdictIds.current.add(ev.id); });
          firstPoll.current = false;
        } else {
          // On subsequent polls, fire callback for each new verdict
          for (const ev of evts) {
            if (ev.stage === "verdict" && !seenVerdictIds.current.has(ev.id)) {
              seenVerdictIds.current.add(ev.id);
              onNewVerdictRef.current?.(ev.jobId, ev.milestoneId, {
                passed:    ev.passed    ?? false,
                score:     ev.score     ?? 0,
                reasoning: ev.reasoning ?? "",
              });
            }
          }
        }

        setEvents(evts);
        setOnline(true);
      } catch {
        if (mounted) setOnline(false);
      }
    };

    poll();
    const interval = setInterval(poll, 4_000);
    return () => { mounted = false; clearInterval(interval); };
  }, []); // intentionally no deps — callback is accessed via ref

  // Don't render if server is offline and no events
  if (!online && events.length === 0) return null;

  return (
    <div className="mb-10">
      {/* Section header */}
      <button
        onClick={() => setCollapsed(v => !v)}
        className="w-full flex items-center justify-between mb-4 group cursor-pointer"
      >
        <div className="flex items-center gap-3">
          <div
            className="flex items-center gap-2 rounded-full px-3 py-1"
            style={{ background: "rgba(201,168,76,0.1)", border: "1px solid rgba(201,168,76,0.25)" }}
          >
            <span
              className="w-1.5 h-1.5 rounded-full"
              style={{ background: online ? "#C9A84C" : "#E84142",
                       boxShadow: online ? "0 0 6px rgba(201,168,76,0.8)" : "none" }}
            />
            <span className="font-cinzel text-xs" style={{ color: "#C9A84C" }}>
              x402 {online ? "live" : "offline"}
            </span>
          </div>
          <h2 className="font-cinzel text-xl" style={{ color: "#F0EBE1" }}>
            Verification Feed
          </h2>
          {events.length > 0 && (
            <span
              className="font-sans text-xs rounded-full px-2 py-0.5"
              style={{ background: "rgba(201,168,76,0.1)", color: "rgba(201,168,76,0.7)" }}
            >
              {collapseByMilestone(events).length} milestone{collapseByMilestone(events).length !== 1 ? "s" : ""}
            </span>
          )}
        </div>
        <span className="font-sans text-xs transition-opacity group-hover:opacity-70"
          style={{ color: "rgba(240,235,225,0.3)" }}>
          {collapsed ? "show ▾" : "hide ▴"}
        </span>
      </button>

      <AnimatePresence>
        {!collapsed && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            {events.length === 0 ? (
              <div className="liquid-glass rounded-2xl p-6 text-center">
                <Zap size={20} className="mx-auto mb-2" style={{ color: "rgba(201,168,76,0.3)" }} />
                <p className="font-instrument italic text-sm" style={{ color: "rgba(240,235,225,0.35)" }}>
                  Waiting for milestone submissions — x402 payments will appear here
                </p>
                <p className="font-mono text-xs mt-2" style={{ color: "rgba(240,235,225,0.2)" }}>
                  {X402_URL}/activity
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                <AnimatePresence initial={false}>
                  {collapseByMilestone(events).map(ev => (
                    <motion.div
                      key={`${ev.jobId}-${ev.milestoneId}`}
                      initial={{ opacity: 0, x: -12 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: 12 }}
                      transition={{ duration: 0.2 }}
                    >
                      <EventCard event={ev} />
                    </motion.div>
                  ))}
                </AnimatePresence>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function EventCard({ event: ev }: { event: ActivityEvent }) {
  const isVerdict   = ev.stage === "verdict";
  const isVerifying = ev.stage === "verifying";
  const isPaid      = ev.stage === "payment_received";

  const accentColor = isVerdict
    ? ev.passed ? "#C9A84C" : "#E84142"
    : "rgba(201,168,76,0.6)";

  return (
    <div
      className="liquid-glass rounded-xl p-4"
      style={{ borderLeft: `2px solid ${accentColor}` }}
    >
      <div className="flex items-start justify-between gap-4">
        {/* Left: icon + label */}
        <div className="flex items-start gap-3">
          <div className="mt-0.5 shrink-0">
            {isVerdict ? (
              ev.passed
                ? <CheckCircle2 size={16} style={{ color: "#C9A84C" }} />
                : <XCircle     size={16} style={{ color: "#E84142" }} />
            ) : isVerifying ? (
              <Loader2 size={16} className="animate-spin" style={{ color: "rgba(201,168,76,0.7)" }} />
            ) : (
              <Zap size={16} style={{ color: "rgba(201,168,76,0.7)" }} />
            )}
          </div>

          <div className="min-w-0">
            {/* Stage label */}
            <div className="flex items-center gap-2 mb-1 flex-wrap">
              <span className="font-cinzel text-sm" style={{ color: accentColor }}>
                {isVerdict
                  ? ev.passed ? "✓ Verified" : "✗ Rejected"
                  : isVerifying ? "Verifying…"
                  : "Payment received"}
              </span>
              <span className="font-sans text-xs" style={{ color: "rgba(240,235,225,0.35)" }}>
                Job #{ev.jobId} · Milestone #{ev.milestoneId}
              </span>
            </div>

            {/* Score bar */}
            {isVerdict && ev.score !== undefined && (
              <div className="flex items-center gap-2 mb-1.5">
                <div className="flex gap-0.5">
                  {Array.from({ length: 10 }).map((_, i) => (
                    <div
                      key={i}
                      className="w-2.5 h-1.5 rounded-sm"
                      style={{
                        background: i < Math.round(ev.score! / 10)
                          ? (ev.passed ? "#C9A84C" : "#E84142")
                          : "rgba(240,235,225,0.08)",
                      }}
                    />
                  ))}
                </div>
                <span className="font-mono text-xs" style={{ color: "rgba(240,235,225,0.5)" }}>
                  {ev.score}/100
                </span>
              </div>
            )}

            {/* Reasoning */}
            {isVerdict && ev.reasoning && (
              <p className="font-sans text-xs leading-relaxed mb-1.5"
                style={{ color: "rgba(240,235,225,0.55)" }}>
                {ev.reasoning}
              </p>
            )}

            {/* x402 payment info */}
            <div className="flex flex-wrap items-center gap-3 mt-1">
              <span
                className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 font-mono text-xs"
                style={{ background: "rgba(201,168,76,0.08)", color: "rgba(201,168,76,0.7)",
                         border: "1px solid rgba(201,168,76,0.2)" }}
              >
                <Zap size={10} /> {ev.paidAmount} via x402
              </span>

              {ev.paymentTx && (
                <a
                  href={`${SNOWTRACE}/${ev.paymentTx}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 font-mono text-xs transition-opacity hover:opacity-70 cursor-pointer"
                  style={{ color: "rgba(201,168,76,0.5)" }}
                >
                  payment tx <ExternalLink size={10} />
                </a>
              )}

              {ev.paidFrom && (
                <span className="font-mono text-xs" style={{ color: "rgba(240,235,225,0.2)" }}>
                  {ev.paidFrom.slice(0, 8)}…
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Right: time */}
        <span className="font-sans text-xs shrink-0" style={{ color: "rgba(240,235,225,0.2)" }}>
          {new Date(ev.timestamp).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
        </span>
      </div>
    </div>
  );
}
