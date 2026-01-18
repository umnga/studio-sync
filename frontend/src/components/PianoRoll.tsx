import React, { useState, useEffect, useRef } from "react";
import { motion } from "framer-motion";

type Note = {
  name: string;
  startTime: number;
  duration: number;
  velocity: number;
};

type PianoRollProps = {
  notes: Note[];
  currentTime: number;
  totalDuration: number;
  highlightColor?: string;
  tempo?: number;
};

const CHROMATIC_SCALE = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];

export const PianoRoll: React.FC<PianoRollProps> = ({
  notes = [],
  currentTime = 0,
  totalDuration = 60,
  highlightColor = "#FFB347",
  tempo = 120,
}) => {
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const [scrollPosition, setScrollPosition] = useState(0);

  // Scroll to current playback position
  useEffect(() => {
    if (scrollContainerRef.current) {
      const scrollPercent = (currentTime / totalDuration) * 100;
      scrollContainerRef.current.scrollLeft = scrollPercent * 10;
    }
  }, [currentTime, totalDuration]);

  const noteRows = Array.from({ length: 88 }, (_, i) => ({
    midiNote: 21 + i,
    noteName: `${CHROMATIC_SCALE[i % 12]}${Math.floor((21 + i) / 12)}`,
  }));

  const pixelsPerSecond = 100;
  const rollWidth = totalDuration * pixelsPerSecond;

  return (
    <div className="w-full space-y-3">
      <div className="text-sm uppercase tracking-widest text-primary mb-2">Piano Roll</div>

      <div
        ref={scrollContainerRef}
        className="relative w-full h-64 bg-black border-2 border-primary/30 rounded-lg overflow-x-auto overflow-y-hidden"
      >
        {/* Time grid */}
        <svg
          className="absolute top-0 left-0 w-full h-full pointer-events-none"
          style={{ width: `${rollWidth}px`, height: "100%" }}
        >
          {/* Vertical grid lines for beats */}
          {Array.from({ length: Math.ceil(totalDuration) }).map((_, i) => (
            <line
              key={`beat-${i}`}
              x1={i * pixelsPerSecond}
              y1="0"
              x2={i * pixelsPerSecond}
              y2="100%"
              stroke="rgba(255, 179, 71, 0.1)"
              strokeWidth="1"
            />
          ))}

          {/* Note rectangles */}
          {notes.map((note, idx) => {
            const rowIndex = noteRows.findIndex((r) => r.noteName === note.name);
            const rowHeight = 256 / 88;
            const noteX = note.startTime * pixelsPerSecond;
            const noteWidth = Math.max(5, note.duration * pixelsPerSecond);
            const noteY = rowIndex * rowHeight;

            return (
              <g key={idx}>
                <rect
                  x={noteX}
                  y={noteY}
                  width={noteWidth}
                  height={rowHeight - 1}
                  fill={highlightColor}
                  opacity={note.velocity / 127}
                  style={{
                    filter: `drop-shadow(0 0 4px ${highlightColor}80)`,
                  }}
                />
              </g>
            );
          })}
        </svg>

        {/* Playhead */}
        <motion.div
          className="absolute top-0 bottom-0 w-1 bg-primary pointer-events-none"
          style={{
            left: `${(currentTime / totalDuration) * 100}%`,
            boxShadow: `0 0 10px ${highlightColor}`,
          }}
        />
      </div>

      <div className="flex justify-between text-xs text-muted-foreground font-mono">
        <span>0:00</span>
        <span>{Math.floor(currentTime)}s / {Math.floor(totalDuration)}s</span>
      </div>
    </div>
  );
};

export default PianoRoll;
