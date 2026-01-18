import { motion, AnimatePresence } from "framer-motion";
import { Power } from "lucide-react";
import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAudioAnalyzer } from "../hooks/useAudioAnalyzer";
import AudioKnob from "./AudioKnob";
import Oscilloscope from "./Oscilloscope";
import SplitterModule from "./SplitterModule";
import PracticeTools from "./PracticeTools";

type RackMode = "ANALYZE" | "SPLIT" | "PRACTICE";

const ProHero = () => {
  const navigate = useNavigate();
  const [rackMode, setRackMode] = useState<RackMode>("ANALYZE");
  const [functionOpen, setFunctionOpen] = useState(false);
  const {
    isRunning,
    powerOn,
    rms,
    waveform,
    phase,
    sampleRate,
    baseLatency,
    gain,
    startSession,
    togglePower,
    setGain,
  } = useAudioAnalyzer();

  const meterWidth = (mult = 1) => {
    const value = Math.min(0.95, rms * 12 * mult);
    return `${Math.max(0.06, value) * 100}%`;
  };

  const phasePolyline = useMemo(() => {
    const points: string[] = [];
    const len = waveform.length || 1;
    for (let i = 0; i < 60; i += 1) {
      const angle = (i / 60) * Math.PI * 2;
      const idx = Math.floor((i / 59) * (len - 1));
      const radius = 36 + waveform[idx] * 40;
      const x = 60 + radius * Math.cos(angle);
      const y = 60 + radius * Math.sin(angle);
      points.push(`${x},${y}`);
    }
    return points.join(" ");
  }, [waveform]);

  const latencyMs = baseLatency ? `${(baseLatency * 1000).toFixed(1)} ms` : "--";
  const sampleKHz = sampleRate ? `${(sampleRate / 1000).toFixed(1)} kHz` : "--";
  const masterValue = `${Math.round(gain * 100)}%`;
  const dimClass = powerOn ? "" : "opacity-60";

  return (
    <div className="relative min-h-screen bg-background overflow-hidden matte-surface">
      <div className="absolute inset-y-24 left-0 w-10 venting" />
      <div className="absolute inset-y-24 right-0 w-10 venting" />

      <div className="relative z-10 container mx-auto px-6 pt-28 pb-16">
        <div className="text-center max-w-3xl mx-auto mb-8">
          <p className="tech-label mb-3">AS-48 // MONO RACK</p>
          <h1 className="text-5xl md:text-6xl font-black mb-4 led-text">PRACTICE STUDIO</h1>
          <p className="text-sm md:text-base uppercase tracking-[0.28em] text-zinc-500">
            Live Analyzer · Mic Capture · Single Accent Control
          </p>
        </div>

        {/* Segmented Rack Mode Control */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.05 }}
          className="flex justify-center mb-8"
        >
          <div className="segmented-control">
            {(["ANALYZE", "SPLIT", "PRACTICE"] as RackMode[]).map((mode) => (
              <button
                key={mode}
                onClick={() => setRackMode(mode)}
                className={`segment-button haptic ${
                  rackMode === mode ? "segment-button-active" : "segment-button-inactive"
                }`}
              >
                {mode}
              </button>
            ))}
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className={`glass-strong rounded-[12px] border border-primary/20 shadow-2xl overflow-hidden ${dimClass}`}
        >
          <div className="flex flex-wrap items-center justify-between gap-3 px-6 py-4 border-b border-primary/15 bg-card/90">
            <div className="flex items-center gap-3">
              <div className={`w-2 h-2 rounded-full ${powerOn ? "bg-primary animate-pulse" : "bg-zinc-600"}`} />
              <span className="tech-label">{powerOn ? "LIVE" : "IDLE"} · {sampleKHz} · Lat {latencyMs}</span>
            </div>
            <div className="flex items-center gap-3">
              <button
                onClick={togglePower}
                className="power-button"
                aria-label="Toggle Audio Context"
              >
                <Power className="w-5 h-5" />
              </button>
              <button
                onClick={startSession}
                className="neon-button px-4 py-2"
              >
                Start Session (Mic)
              </button>
              <button
                onClick={() => setFunctionOpen((s) => !s)}
                className="neon-button px-4 py-2"
              >
                Function
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 px-6 py-8 items-center">
            <AnimatePresence mode="wait">
              {rackMode === "ANALYZE" && (
                <motion.div
                  key="analyze"
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: 20 }}
                  transition={{ type: "spring", stiffness: 300, damping: 30 }}
                  className="lg:col-span-3 grid grid-cols-1 lg:grid-cols-3 gap-6"
                >
                  <div className="space-y-4">
                    {["Input", "Process", "Output"].map((label, idx) => (
                      <div key={label} className="p-3 rounded-[8px] border border-primary/20 bg-background/70">
                        <div className="flex items-center justify-between mb-2">
                          <span className="tech-label">{label}</span>
                          <span className="text-[11px] font-mono text-primary">{idx === 1 ? "DSP" : "LIVE"}</span>
                        </div>
                        <div className="vu-meter">
                          <div
                            className="vu-meter-fill"
                            style={{ width: meterWidth(idx === 0 ? 1 : idx === 1 ? 0.9 : 0.8) }}
                          />
                        </div>
                      </div>
                    ))}
                  </div>

                  <div className="flex flex-col items-center gap-4 w-full">
                    <span className="tech-label">MASTER</span>
                    <AudioKnob
                      label="Intensity"
                      value={masterValue}
                      unit=""
                      size="lg"
                      normalized={gain}
                      onChange={(v) => setGain(v)}
                    />
                    <div className="text-[11px] font-mono text-primary">SEPARATION</div>
                    <div className="grid grid-cols-2 gap-3 w-full">
                      <div className="rounded-[10px] border border-primary/20 bg-background/70 px-4 py-3 text-center">
                        <span className="tech-label block mb-1">LATENCY</span>
                        <p className="text-sm font-mono text-primary">{latencyMs}</p>
                      </div>
                      <div className="rounded-[10px] border border-primary/20 bg-background/70 px-4 py-3 text-center">
                        <span className="tech-label block mb-1">BIT DEPTH</span>
                        <p className="text-sm font-mono text-primary">{sampleKHz}</p>
                      </div>
                    </div>
                  </div>

                  <div className="flex flex-col gap-4 w-full">
                    <Oscilloscope color="#FFB347" waveform={waveform} sampleRate={sampleRate} />
                    <div className="rounded-[10px] border border-primary/20 bg-background/70 p-4 flex items-center justify-between">
                      <div>
                        <span className="tech-label block mb-1">PHASE</span>
                        <p className="text-sm font-mono text-primary">{phase.toFixed(2)}</p>
                      </div>
                      <motion.svg
                        viewBox="0 0 120 120"
                        className="w-20 h-20"
                        animate={{ rotate: isRunning ? 360 : 0 }}
                        transition={{ duration: 18, repeat: Infinity, ease: "linear" }}
                      >
                        <motion.polyline
                          points={phasePolyline}
                          fill="none"
                          stroke="#FFB347"
                          strokeWidth={1.4}
                          strokeLinejoin="round"
                          strokeLinecap="round"
                          opacity={0.9}
                        />
                      </motion.svg>
                    </div>
                  </div>
                </motion.div>
              )}

              {rackMode === "SPLIT" && (
                <motion.div
                  key="split"
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: 20 }}
                  transition={{ type: "spring", stiffness: 300, damping: 30 }}
                  className="lg:col-span-3"
                >
                  <SplitterModule />
                </motion.div>
              )}

              {rackMode === "PRACTICE" && (
                <motion.div
                  key="practice"
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: 20 }}
                  transition={{ type: "spring", stiffness: 300, damping: 30 }}
                  className="lg:col-span-3"
                >
                  <PracticeTools 
                    stems={[]}
                    guitarChord="C major"
                  />
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: functionOpen ? "auto" : 0, opacity: functionOpen ? 1 : 0 }}
            className="overflow-hidden border-t border-primary/15 bg-card/80 px-6"
          >
            <div className="py-4 flex items-center gap-6 text-[11px] font-mono uppercase tracking-[0.24em] text-zinc-500">
              <button onClick={() => navigate("/about")} className="hover:text-primary">Docs</button>
              <button className="hover:text-primary">API</button>
              <span className="text-primary">Model: HTDEMUCS</span>
            </div>
          </motion.div>
        </motion.div>
      </div>
    </div>
  );
};

export default ProHero;
