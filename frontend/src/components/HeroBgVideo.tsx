import { useRef, useState, useEffect } from "react";

const VIDEOS = ["/hero-bg-1.mp4", "/hero-bg-2.mp4"];
const FADE_DURATION = 1500; // ms — overlap crossfade

export default function HeroBgVideo() {
  const ref0 = useRef<HTMLVideoElement>(null);
  const ref1 = useRef<HTMLVideoElement>(null);
  const [active, setActive] = useState(0); // which video is visible

  const refs = [ref0, ref1];

  // When the active video ends, crossfade to the other
  const handleEnded = (index: number) => {
    if (index !== active) return;
    const next = index === 0 ? 1 : 0;

    // Reset and play the next video before the fade starts
    const nextEl = refs[next].current;
    if (nextEl) {
      nextEl.currentTime = 0;
      nextEl.play().catch(() => {});
    }

    setActive(next);
  };

  // Autoplay the first video on mount
  useEffect(() => {
    ref0.current?.play().catch(() => {});
  }, []);

  return (
    <div className="absolute inset-0 w-full h-full overflow-hidden" aria-hidden="true">
      {VIDEOS.map((src, i) => (
        <video
          key={src}
          ref={refs[i]}
          src={src}
          muted
          playsInline
          preload="auto"
          onEnded={() => handleEnded(i)}
          style={{
            position:   "absolute",
            inset:      0,
            width:      "100%",
            height:     "100%",
            objectFit:  "cover",
            objectPosition: "center center",
            opacity:    active === i ? 1 : 0,
            transition: `opacity ${FADE_DURATION}ms ease-in-out`,
            willChange: "opacity",
          }}
        />
      ))}

      {/* Dark vignette overlay — keeps text readable, matches brand */}
      <div
        style={{
          position: "absolute",
          inset:    0,
          background: [
            /* top darkening — behind navbar */
            "linear-gradient(to bottom, rgba(7,6,14,0.75) 0%, rgba(7,6,14,0.2) 18%, rgba(7,6,14,0.1) 50%, rgba(7,6,14,0.5) 80%, rgba(7,6,14,0.95) 100%)",
            /* subtle gold tint at centre */
            "radial-gradient(ellipse at 50% 40%, rgba(201,168,76,0.04) 0%, transparent 65%)",
          ].join(", "),
          pointerEvents: "none",
        }}
      />

      {/* Left / right edge fade — keeps it contained */}
      <div
        style={{
          position: "absolute",
          inset:    0,
          background: "linear-gradient(to right, rgba(7,6,14,0.5) 0%, transparent 15%, transparent 85%, rgba(7,6,14,0.5) 100%)",
          pointerEvents: "none",
        }}
      />

      {/* Bottom-right logo cover — radial fade so it blends naturally */}
      <div
        style={{
          position:   "absolute",
          inset:      0,
          background: "radial-gradient(ellipse 40% 32% at 100% 100%, rgba(7,6,14,1) 0%, rgba(7,6,14,0.9) 50%, transparent 100%)",
          pointerEvents: "none",
        }}
      />
    </div>
  );
}
