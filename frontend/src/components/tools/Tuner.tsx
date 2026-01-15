import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { Radio, Square } from "lucide-react";
import { Button } from "@/components/ui/button";

const NOTES = ["E", "A", "D", "G", "B", "E"];
const NOTE_FREQUENCIES: Record<string, number> = {
  "E2": 82.41,
  "A2": 110.00,
  "D3": 146.83,
  "G3": 196.00,
  "B3": 246.94,
  "E4": 329.63,
};

export const Tuner = () => {
  const [isActive, setIsActive] = useState(false);
  const [currentNote, setCurrentNote] = useState("E");
  const [frequency, setFrequency] = useState(329.63);
  const [cents, setCents] = useState(0);
  const [selectedReference, setSelectedReference] = useState<string | null>(null);

  const startTuner = () => setIsActive(true);
  const stopTuner = () => setIsActive(false);

  // Simulate tuner readings
  useEffect(() => {
    if (!isActive) {
      setCents(0);
      return;
    }

    const interval = setInterval(() => {
      const noteIndex = Math.floor(Math.random() * NOTES.length);
      const note = NOTES[noteIndex];
      const baseFreq = Object.values(NOTE_FREQUENCIES)[noteIndex];
      const variation = (Math.random() - 0.5) * 10;
      const newCents = Math.round((Math.random() - 0.5) * 60);
      
      setCurrentNote(note);
      setFrequency(parseFloat((baseFreq + variation).toFixed(2)));
      setCents(newCents);
    }, 500);

    return () => clearInterval(interval);
  }, [isActive]);

  const getNeedleRotation = () => {
    // Convert cents to rotation (-30 to +30 degrees)
    return Math.max(-30, Math.min(30, cents * 0.5));
  };

  const getTuningStatus = () => {
    if (!isActive) return "inactive";
    if (Math.abs(cents) < 5) return "in-tune";
    if (cents < 0) return "flat";
    return "sharp";
  };

  const status = getTuningStatus();

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-6"
    >
      {/* Main Tuner Display */}
      <div className="glass-card rounded-2xl p-8 text-center">
        {/* Note Display */}
        <motion.div
          key={currentNote}
          initial={{ scale: 0.9, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          className="mb-8"
        >
          <span
            className={`text-8xl font-bold ${
              status === "in-tune"
                ? "text-success"
                : status === "inactive"
                ? "text-muted-foreground"
                : "gradient-text"
            }`}
          >
            {isActive ? currentNote : "—"}
          </span>
        </motion.div>

        {/* Tuning Gauge */}
        <div className="relative w-64 h-32 mx-auto mb-6">
          {/* Gauge background */}
          <svg viewBox="0 0 200 100" className="w-full h-full">
            {/* Background arc */}
            <path
              d="M 20 100 A 80 80 0 0 1 180 100"
              fill="none"
              stroke="hsl(var(--muted))"
              strokeWidth="8"
              strokeLinecap="round"
            />
            {/* Colored segments */}
            <path
              d="M 40 95 A 70 70 0 0 1 70 50"
              fill="none"
              stroke="hsl(var(--destructive))"
              strokeWidth="4"
              strokeLinecap="round"
              opacity="0.5"
            />
            <path
              d="M 85 35 A 70 70 0 0 1 115 35"
              fill="none"
              stroke="hsl(var(--success))"
              strokeWidth="4"
              strokeLinecap="round"
              opacity="0.5"
            />
            <path
              d="M 130 50 A 70 70 0 0 1 160 95"
              fill="none"
              stroke="hsl(var(--destructive))"
              strokeWidth="4"
              strokeLinecap="round"
              opacity="0.5"
            />
            {/* Center marker */}
            <line
              x1="100"
              y1="20"
              x2="100"
              y2="35"
              stroke="hsl(var(--success))"
              strokeWidth="2"
            />
          </svg>

          {/* Needle */}
          <motion.div
            className="absolute bottom-0 left-1/2 origin-bottom"
            animate={{
              rotate: isActive ? getNeedleRotation() : 0,
            }}
            transition={{ type: "spring", stiffness: 100, damping: 15 }}
            style={{ width: "2px", height: "70px", marginLeft: "-1px" }}
          >
            <div
              className={`w-full h-full rounded-full ${
                status === "in-tune" ? "bg-success" : "bg-primary"
              }`}
            />
            <div
              className={`absolute bottom-0 left-1/2 -translate-x-1/2 w-4 h-4 rounded-full ${
                status === "in-tune" ? "bg-success" : "bg-primary"
              }`}
            />
          </motion.div>
        </div>

        {/* Frequency Display */}
        <div className="mb-6">
          <p className="text-sm text-muted-foreground mb-1">Frequency</p>
          <p className="text-2xl font-mono font-semibold">
            {isActive ? `${frequency} Hz` : "— Hz"}
          </p>
        </div>

        {/* Status Text */}
        <motion.div
          key={status}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className={`inline-flex items-center gap-2 px-4 py-2 rounded-full mb-6 ${
            status === "in-tune"
              ? "bg-success/20 text-success"
              : status === "flat"
              ? "bg-secondary/20 text-secondary"
              : status === "sharp"
              ? "bg-destructive/20 text-destructive"
              : "bg-muted text-muted-foreground"
          }`}
        >
          {status === "in-tune" && "In Tune ✓"}
          {status === "flat" && `Flat (${cents} cents)`}
          {status === "sharp" && `Sharp (+${cents} cents)`}
          {status === "inactive" && "Start tuner to begin"}
        </motion.div>

        {/* Start/Stop Button */}
        <div>
          <Button
            size="lg"
            onClick={isActive ? stopTuner : startTuner}
            className={`px-8 ${
              isActive
                ? "bg-destructive hover:bg-destructive/90"
                : "bg-gradient-to-r from-primary to-secondary hover:opacity-90"
            }`}
          >
            {isActive ? (
              <>
                <Square className="mr-2 h-5 w-5" />
                Stop Tuner
              </>
            ) : (
              <>
                <Radio className="mr-2 h-5 w-5" />
                Start Tuner
              </>
            )}
          </Button>
        </div>
      </div>

      {/* Reference Notes */}
      <div className="glass-card rounded-2xl p-6">
        <h3 className="font-semibold mb-4">Standard Tuning Reference</h3>
        <div className="grid grid-cols-6 gap-2">
          {NOTES.map((note, index) => {
            const freq = Object.values(NOTE_FREQUENCIES)[index];
            return (
              <motion.button
                key={`${note}-${index}`}
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                onClick={() => setSelectedReference(note === selectedReference ? null : `${note}-${index}`)}
                className={`p-4 rounded-xl text-center transition-colors ${
                  selectedReference === `${note}-${index}`
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted/30 hover:bg-muted/50"
                }`}
              >
                <p className="text-2xl font-bold mb-1">{note}</p>
                <p className="text-xs text-muted-foreground">
                  {freq.toFixed(1)} Hz
                </p>
              </motion.button>
            );
          })}
        </div>
        <p className="text-sm text-muted-foreground mt-4 text-center">
          6th string (Low E) → 1st string (High E)
        </p>
      </div>
    </motion.div>
  );
};
