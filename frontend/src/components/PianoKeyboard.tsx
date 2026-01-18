import React, { useMemo } from "react";
import { motion } from "framer-motion";

type PianoKeyboardProps = {
  activeNotes?: string[];
  complexity?: "beginner" | "advanced";
  onKeyClick?: (note: string) => void;
  highlightColor?: string;
  showLabels?: boolean;
};

const CHROMATIC_SCALE = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];

export const PianoKeyboard: React.FC<PianoKeyboardProps> = ({
  activeNotes = [],
  complexity = "beginner",
  onKeyClick,
  highlightColor = "#FFB347",
  showLabels = true,
}) => {
  // Generate 88 keys (A0 to C8)
  const keys = useMemo(() => {
    const keyList: Array<{ note: string; octave: number; isBlack: boolean; midiNote: number }> = [];
    let midiNote = 21; // A0

    for (let octave = 0; octave <= 8; octave++) {
      for (const note of CHROMATIC_SCALE) {
        if (octave === 0 && ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#"].includes(note)) {
          continue; // Skip notes below A0
        }
        if (octave === 8 && !["C"].includes(note)) {
          continue; // Only C8 in the last octave
        }

        keyList.push({
          note,
          octave,
          isBlack: note.includes("#"),
          midiNote,
        });

        midiNote++;
      }
    }

    return keyList;
  }, []);

  const isKeyActive = (note: string, octave: number) => {
    // Check if note matches (considering beginner vs advanced)
    if (complexity === "beginner") {
      // Only highlight root position notes across all octaves
      return activeNotes.some((n) => n.split(/\d/)[0] === note.split(/\d/)[0]);
    }
    return activeNotes.includes(`${note}${octave}`);
  };

  // Filter keys for display (show 3 octaves at a time for mobile, all for desktop)
  const displayKeys = keys.slice(12, -12); // Show C1 to B7 (88 keys)

  return (
    <div className="w-full space-y-4">
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex justify-center bg-gradient-to-b from-background to-background/80 p-6 rounded-xl border border-primary/20 shadow-2xl overflow-x-auto"
      >
        <div className="flex relative h-48 gap-0 md:gap-0.5" style={{ minWidth: "fit-content" }}>
          {displayKeys.map((key, idx) => {
            const isActive = isKeyActive(key.note, key.octave);
            const noteName = `${key.note}${key.octave}`;

            return (
              <motion.div
                key={idx}
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                onClick={() => onKeyClick?.(noteName)}
                className={`
                  relative cursor-pointer transition-all duration-100
                  ${
                    key.isBlack
                      ? "w-6 h-24 bg-black border border-black -mx-3 z-10 rounded-b-sm"
                      : "w-10 h-40 bg-white border-2 border-zinc-400 z-0 rounded-b-md shadow-md"
                  }
                  ${
                    isActive
                      ? `shadow-[0_0_20px_${highlightColor}] scale-105`
                      : "hover:bg-opacity-90"
                  }
                `}
                style={
                  isActive
                    ? {
                        backgroundColor: key.isBlack ? highlightColor : highlightColor,
                        boxShadow: `0 0 20px ${highlightColor}80, inset 0 0 10px ${highlightColor}40`,
                      }
                    : {}
                }
              >
                {showLabels && !key.isBlack && (
                  <span
                    className="absolute bottom-2 left-1/2 -translate-x-1/2 text-[10px] font-mono text-zinc-600 pointer-events-none"
                  >
                    {key.note}
                  </span>
                )}
              </motion.div>
            );
          })}
        </div>
      </motion.div>

      {/* Legend */}
      <div className="flex justify-center gap-6 text-xs text-muted-foreground">
        <div className="flex items-center gap-2">
          <div
            className="w-4 h-4 rounded-sm"
            style={{ backgroundColor: highlightColor }}
          />
          <span>Active Notes</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-4 h-4 border border-zinc-400 rounded-sm" />
          <span>Inactive</span>
        </div>
      </div>
    </div>
  );
};

export default PianoKeyboard;
