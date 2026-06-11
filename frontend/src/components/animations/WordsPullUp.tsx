import { useRef } from "react";
import { motion, useInView } from "framer-motion";

interface Props {
  text: string;
  className?: string;
  delay?: number;
}

export default function WordsPullUp({ text, className = "", delay = 0 }: Props) {
  const ref = useRef<HTMLSpanElement>(null);
  const isInView = useInView(ref, { once: true, margin: "-50px" });

  return (
    <span ref={ref} className={`inline-flex flex-wrap gap-x-[0.25em] ${className}`}>
      {text.split(" ").map((word, i) => (
        <span key={i} className="overflow-hidden inline-flex">
          <motion.span
            className="inline-block"
            initial={{ y: "100%" }}
            animate={isInView ? { y: 0 } : { y: "100%" }}
            transition={{
              duration: 0.7,
              delay: delay + i * 0.08,
              ease: [0.16, 1, 0.3, 1],
            }}
          >
            {word}
          </motion.span>
        </span>
      ))}
    </span>
  );
}
