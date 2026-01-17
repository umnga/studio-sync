import { motion, AnimatePresence } from "framer-motion";
import { Activity, Settings, Moon, Sun } from "lucide-react";
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAudioAnalyzer } from "../hooks/useAudioAnalyzer";

const ProNavbar = () => {
  const navigate = useNavigate();
  const [isLight, setIsLight] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const { sampleRate, baseLatency, powerOn } = useAudioAnalyzer();

  useEffect(() => {
    const root = document.documentElement;
    if (isLight) {
      root.setAttribute("data-theme", "light");
    } else {
      root.removeAttribute("data-theme");
    }
  }, [isLight]);

  const statusText = `${powerOn ? "LIVE" : "IDLE"} • ${sampleRate ? (sampleRate / 1000).toFixed(1) : "48.0"} KHZ • LAT ${baseLatency ? (baseLatency * 1000).toFixed(1) : "5.0"} MS`;

  return (
    <motion.nav
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      className="fixed top-0 left-0 right-0 z-50 glass rounded-b-[6px] border-b border-primary/15"
    >
      <div className="container mx-auto px-4 h-12 flex items-center justify-between gap-4">
        <div className="flex items-center gap-4 cursor-pointer haptic" onClick={() => navigate("/")}>
          <div className="w-7 h-7 border border-primary rounded-[4px] flex items-center justify-center bg-card/80">
            <Activity className="w-3.5 h-3.5 text-primary" />
          </div>
          <span className="font-black text-primary tracking-[0.3em] text-sm">STUDIO</span>
        </div>

        <div className="flex items-center gap-4 text-[10px] font-mono uppercase tracking-[0.22em] text-muted-foreground">
          {statusText}
        </div>

        <div className="flex items-center gap-3">
          <motion.button
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            onClick={() => setShowSettings((s) => !s)}
            className="haptic w-8 h-8 rounded-[6px] border border-primary/40 bg-card/80 flex items-center justify-center text-primary hover:bg-primary/10 transition-colors"
            aria-label="Settings"
          >
            <Settings className="w-4 h-4" />
          </motion.button>

          <div className="industrial-toggle haptic" onClick={() => setIsLight((v) => !v)}>
            <motion.div
              animate={{ x: isLight ? 16 : -16 }}
              transition={{ type: "spring", stiffness: 400, damping: 28 }}
              className="absolute w-6 h-6 rounded-[4px] bg-primary shadow-lg flex items-center justify-center"
            >
              {isLight ? <Sun className="w-3.5 h-3.5 text-primary-foreground" /> : <Moon className="w-3.5 h-3.5 text-primary-foreground" />}
            </motion.div>
          </div>
        </div>
      </div>

      <AnimatePresence>
        {showSettings && (
          <motion.div
            initial={{ opacity: 0, y: -10, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -10, scale: 0.95 }}
            transition={{ type: "spring", stiffness: 400, damping: 28 }}
            className="absolute right-4 top-12 w-56 glass rounded-[6px] border border-primary/20 p-4 shadow-2xl"
          >
            <p className="tech-label mb-3">SETTINGS</p>
            <div className="flex flex-col gap-2 text-[11px] font-mono uppercase tracking-[0.2em] text-zinc-500">
              <button onClick={() => navigate("/about")} className="text-left hover:text-primary transition-colors haptic">Documentation</button>
              <button className="text-left hover:text-primary transition-colors haptic">API Reference</button>
              <button className="text-left hover:text-primary transition-colors haptic">Preferences</button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.nav>
  );
};

export default ProNavbar;
