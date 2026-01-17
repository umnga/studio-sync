import React, { useMemo } from "react";
import { motion } from "framer-motion";
import Tooltip from "./Tooltip";

type AudioKnobProps = {
  label: string;
  value: string;
  unit: string;
  size?: "sm" | "md" | "lg";
  normalized?: number; // 0..1
  onChange?: (value: number) => void;
};

export const AudioKnob: React.FC<AudioKnobProps> = ({
  label,
  value,
  unit,
  size = "md",
  normalized = 0.5,
  onChange,
}) => {
  const shellSize = size === "lg" ? "w-24 h-24" : size === "sm" ? "w-12 h-12" : "w-16 h-16";
  const dialSize = size === "lg" ? "w-20 h-20" : size === "sm" ? "w-10 h-10" : "w-12 h-12";
  const dimpleSize = size === "lg" ? "w-2.5 h-2.5" : size === "sm" ? "w-1.5 h-1.5" : "w-2 h-2";
  const labelTrack = size === "lg" ? "tracking-[0.3em]" : "tracking-[0.24em]";

  const rotation = useMemo(() => {
    const clamped = Math.max(0, Math.min(1, normalized));
    return -135 + clamped * 270; // sweep -135 to 135
  }, [normalized]);

  const bump = () => {
    if (!onChange) return;
    const next = Math.min(1, normalized + 0.08);
    onChange(next);
  };

  return (
    <div className="flex flex-col items-center gap-3 p-3">
      <span className={`text-[10px] uppercase ${labelTrack} text-zinc-500 font-semibold`}>
        {label}
      </span>
      <Tooltip content={`${value}${unit}`} delay={300}>
        <div
          className={`relative ${shellSize} rounded-full bg-card shadow-[inset_0px_2px_4px_rgba(255,255,255,0.04),0px_10px_22px_rgba(0,0,0,0.65)] border border-border flex items-center justify-center group cursor-pointer`}
        >
          {/* The "Machined" Dial with dimple */}
          <motion.div
            className={`${dialSize} rounded-full bg-gradient-to-b from-zinc-300/10 to-black/70 flex items-center justify-center shadow-[0_14px_24px_rgba(0,0,0,0.45)] haptic`}
            style={{ rotate: rotation }}
            whileHover={{ scale: 1.05 }}
            transition={{ type: "spring", stiffness: 320, damping: 22 }}
            onClick={bump}
          >
            <div className={`rounded-full bg-primary ${dimpleSize} shadow-[0_0_12px_rgba(255,179,71,0.6)]`} />
          </motion.div>
        </div>
      </Tooltip>
    </div>
  );
};

export default AudioKnob;
