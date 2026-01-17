import React, { useEffect, useMemo, useRef, useState } from "react";
import { motion } from "framer-motion";

type OscilloscopeProps = {
  color?: string;
  waveform: Float32Array;
  sampleRate?: number;
};

const Oscilloscope: React.FC<OscilloscopeProps> = ({ color = "#FFB347", waveform, sampleRate }) => {
  const [path, setPath] = useState<string>("");
  const dataRef = useRef(waveform);

  useEffect(() => {
    dataRef.current = waveform;
  }, [waveform]);

  useEffect(() => {
    let raf: number;
    const draw = () => {
      const data = dataRef.current;
      const points: string[] = [];
      const len = data.length;
      for (let i = 0; i < 100; i += 1) {
        const idx = Math.floor((i / 99) * (len - 1));
        const x = i;
        const y = 20 + data[idx] * 18; // centerline 20 with amplitude mapped
        points.push(`${x},${y}`);
      }
      setPath(`M ${points.join(" L ")}`);
      raf = requestAnimationFrame(draw);
    };
    draw();
    return () => cancelAnimationFrame(raf);
  }, []);

  const label = useMemo(() => `Signal Trace // ${sampleRate ? Math.round(sampleRate / 1000) : 48} kHz`, [sampleRate]);

  return (
    <div className="w-full h-24 bg-card/80 rounded border border-border relative overflow-hidden group">
      <div className="absolute top-1 left-2 text-[8px] uppercase tracking-tighter text-zinc-600 font-mono">
        {label}
      </div>
      <svg viewBox="0 0 100 40" className="w-full h-full">
        <motion.path
          d={path}
          fill="none"
          stroke={color}
          strokeWidth="0.6"
          initial={{ opacity: 0.5 }}
          animate={{ opacity: [0.35, 0.8, 0.35] }}
          transition={{ repeat: Infinity, duration: 1.6, ease: "easeInOut" }}
        />
        <motion.path
          d={path}
          fill="none"
          stroke={color}
          strokeWidth="1.4"
          className="blur-[2px] opacity-25"
          animate={{ opacity: [0.1, 0.3, 0.1] }}
          transition={{ repeat: Infinity, duration: 1.6, ease: "easeInOut" }}
        />
      </svg>
    </div>
  );
};

export default Oscilloscope;
