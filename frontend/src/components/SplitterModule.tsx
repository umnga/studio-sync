import { useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Upload, Loader2, Download, Square } from "lucide-react";
import { useAudioAnalyzer } from "../hooks/useAudioAnalyzer";

type ProcessingStatus = "idle" | "uploading" | "processing" | "complete" | "error";

type SplitterModuleProps = {
  onBack?: () => void;
};

const stems = [
  { title: "VOCALS", color: "#FFB347", key: "vocals" },
  { title: "DRUMS", color: "#FFB347", key: "drums" },
  { title: "BASS", color: "#FFB347", key: "bass" },
  { title: "OTHER", color: "#FFB347", key: "other" },
];

const API_BASE_URL = "http://localhost:8000";

export const SplitterModule: React.FC<SplitterModuleProps> = () => {
  const [dragActive, setDragActive] = useState(false);
  const [fileName, setFileName] = useState<string | null>(null);
  const [status, setStatus] = useState<ProcessingStatus>("idle");
  const [progress, setProgress] = useState(0);
  const [stemsData, setStemsData] = useState<any>(null);
  const { rms } = useAudioAnalyzer();

  const handleFileUpload = useCallback(async (file: File) => {
    if (!file.type.includes("audio")) {
      return;
    }

    setFileName(file.name);
    setStatus("uploading");
    setProgress(0);

    try {
      const formData = new FormData();
      formData.append("file", file);

      setProgress(20);
      const infoResponse = await fetch(`${API_BASE_URL}/api/audio-splitter/info`, {
        method: "POST",
        body: formData,
      });

      if (!infoResponse.ok) throw new Error("Failed to get audio info");

      setProgress(40);
      setStatus("processing");

      const splitFormData = new FormData();
      splitFormData.append("file", file);

      const splitResponse = await fetch(`${API_BASE_URL}/api/audio-splitter/split`, {
        method: "POST",
        body: splitFormData,
      });

      if (!splitResponse.ok) throw new Error("Failed to split audio");

      const result = await splitResponse.json();

      let currentProgress = 40;
      const progressInterval = setInterval(() => {
        currentProgress += Math.random() * 12;
        if (currentProgress >= 100) {
          currentProgress = 100;
          clearInterval(progressInterval);
        }
        setProgress(currentProgress);
      }, 250);

      await new Promise((resolve) => setTimeout(resolve, 2000));
      clearInterval(progressInterval);

      setProgress(100);
      setStatus("complete");
      setStemsData(result);
    } catch (error) {
      console.error("Error:", error);
      setStatus("error");
    }
  }, []);

  const handleDrag = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setDragActive(false);
      if (e.dataTransfer.files?.[0]) {
        handleFileUpload(e.dataTransfer.files[0]);
      }
    },
    [handleFileUpload]
  );

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files?.[0]) {
      handleFileUpload(e.target.files[0]);
    }
  };

  const resetUpload = () => {
    setStatus("idle");
    setFileName(null);
    setProgress(0);
    setStemsData(null);
  };

  const loadingWidth = `${Math.max(6, rms * 100 * 12)}%`;

  return (
    <div className="w-full h-full space-y-6">
      <div className="flex items-center justify-between mb-4">
        <div>
          <p className="tech-label mb-1">SEPARATION MODULE</p>
          <h2 className="text-xl font-black text-primary">STEM SPLITTER</h2>
        </div>
      </div>

      <motion.div
        onDragEnter={handleDrag}
        onDragLeave={handleDrag}
        onDragOver={handleDrag}
        onDrop={handleDrop}
        className={`tape-deck ${dragActive ? "tape-deck-active" : ""} ${
          status !== "idle" && status !== "complete" ? "pointer-events-none opacity-75" : ""
        }`}
      >
        <div className="text-center">
          <motion.div
            animate={{ y: dragActive ? -6 : 0 }}
            className="inline-flex mb-6"
          >
            <div className="relative w-20 h-20 rounded-[10px] bg-gradient-to-b from-card/60 to-background/80 border border-primary/30 flex items-center justify-center shadow-[inset_0_2px_8px_rgba(0,0,0,0.4)]">
              {status === "uploading" || status === "processing" ? (
                <Loader2 className="w-8 h-8 text-primary animate-spin" />
              ) : (
                <Square className="w-8 h-8 text-primary" />
              )}
            </div>
          </motion.div>

          <AnimatePresence>
            {fileName && (
              <motion.div
                initial={{ opacity: 0, y: -8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                className="mb-4"
              >
                <p className="text-sm font-mono text-primary truncate max-w-xs mx-auto">{fileName}</p>
              </motion.div>
            )}
          </AnimatePresence>

          <h3 className="text-lg font-bold mb-3 text-foreground uppercase tracking-wider">
            {status === "idle" && "INSERT AUDIO CARTRIDGE"}
            {status === "uploading" && "LOADING CARTRIDGE..."}
            {status === "processing" && "SEPARATING STEMS..."}
            {status === "complete" && "SEPARATION COMPLETE"}
            {status === "error" && "ERROR — RETRY"}
          </h3>

          {status === "idle" && (
            <p className="text-xs text-muted-foreground mb-6 uppercase tracking-wider">
              Drop file or click eject to browse
            </p>
          )}

          <AnimatePresence>
            {(status === "uploading" || status === "processing") && (
              <motion.div
                initial={{ opacity: 0, scaleX: 0 }}
                animate={{ opacity: 1, scaleX: 1 }}
                exit={{ opacity: 0, scaleX: 0 }}
                className="max-w-sm mx-auto mb-6"
              >
                <div className="h-2 rounded-full bg-background/80 border border-primary/30 overflow-hidden">
                  <motion.div
                    className="h-full bg-primary/80 shadow-[0_0_12px_rgba(255,179,71,0.6)]"
                    style={{ width: status === "processing" ? `${progress}%` : loadingWidth }}
                    transition={{ duration: 0.2 }}
                  />
                </div>
                <p className="text-xs font-mono text-primary mt-2">{Math.round(progress)}%</p>
              </motion.div>
            )}
          </AnimatePresence>

          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            {status === "idle" && (
              <label>
                <input type="file" accept="audio/*" onChange={handleInputChange} className="hidden" />
                <button className="neon-button haptic px-6 py-3 cursor-pointer flex items-center gap-2 mx-auto">
                  <Upload className="w-4 h-4" />
                  LOAD CARTRIDGE
                </button>
              </label>
            )}

            {(status === "complete" || status === "error") && (
              <button onClick={resetUpload} className="neon-button haptic px-6 py-3 flex items-center gap-2 mx-auto">
                <Upload className="w-4 h-4" />
                {status === "error" ? "RETRY" : "LOAD NEW"}
              </button>
            )}
          </div>
        </div>
      </motion.div>

      <AnimatePresence>
        {status === "complete" && stemsData && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="grid grid-cols-1 md:grid-cols-2 gap-4"
          >
            {stems.map((stem, idx) => (
              <motion.div
                key={stem.key}
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: idx * 0.1 }}
                className="p-4 rounded-[10px] border border-primary/20 bg-background/70 hover:bg-background/90 transition-colors group"
              >
                <div className="flex items-center justify-between mb-3">
                  <span className="tech-label">{stem.title}</span>
                  <button className="haptic w-8 h-8 rounded-[6px] border border-primary/40 bg-card/80 flex items-center justify-center text-primary hover:bg-primary/10 transition-colors opacity-0 group-hover:opacity-100">
                    <Download className="w-4 h-4" />
                  </button>
                </div>
                <div className="h-16 rounded-[6px] bg-card/60 border border-primary/15 flex items-center justify-center">
                  <div className="flex gap-1">
                    {Array.from({ length: 24 }).map((_, i) => (
                      <div
                        key={i}
                        className="w-1 bg-primary/40 rounded-full"
                        style={{ height: `${20 + Math.random() * 40}%` }}
                      />
                    ))}
                  </div>
                </div>
              </motion.div>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default SplitterModule;
