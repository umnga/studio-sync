import { useState, useCallback, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Upload, Loader2, Square, Download } from "lucide-react";
import { useAudioAnalyzer } from "../hooks/useAudioAnalyzer";
import StemCard from "./StemCard";

type ProcessingStatus = "idle" | "uploading" | "processing" | "complete" | "error";

type StemData = {
  name: string;
  url: string;
  duration: number;
  rms_db: number;
  peak_db: number;
};

type SplitterModuleProps = {
  onBack?: () => void;
};

const API_BASE_URL = "http://localhost:8000";

export const SplitterModule: React.FC<SplitterModuleProps> = () => {
  const [dragActive, setDragActive] = useState(false);
  const [fileName, setFileName] = useState<string | null>(null);
  const [status, setStatus] = useState<ProcessingStatus>("idle");
  const [progress, setProgress] = useState(0);
  const [stems, setStems] = useState<StemData[]>([]);
  const [sessionId] = useState(() => Date.now().toString());
  const { rms } = useAudioAnalyzer();
  const workerRef = useRef<Worker | null>(null);

  // Initialize Web Worker
  useEffect(() => {
    workerRef.current = new Worker(
      new URL("../workers/splitter.worker.ts", import.meta.url),
      { type: "module" }
    );

    workerRef.current.onmessage = (event) => {
      const { type, progress: workerProgress, result, message } = event.data;

      if (type === "PROGRESS") {
        setProgress(workerProgress);
        if (workerProgress === 10) {
          setStatus("uploading");
        } else if (workerProgress >= 30) {
          setStatus("processing");
        }
      } else if (type === "COMPLETION") {
        setStems(result.stems || []);
        setStatus("complete");
        setProgress(100);
      } else if (type === "ERROR") {
        console.error("Worker error:", message);
        setStatus("error");
      }
    };

    return () => {
      workerRef.current?.terminate();
    };
  }, []);

  const handleFileUpload = useCallback(
    (file: File) => {
      if (!file.type.includes("audio")) {
        return;
      }

      setFileName(file.name);
      setStatus("uploading");
      setProgress(0);
      setStems([]);

      // Send to Web Worker
      workerRef.current?.postMessage({
        type: "START_SPLIT",
        audioFile: file,
        sessionId,
      });
    },
    [sessionId]
  );

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
    setStems([]);
  };

  const handleDownloadAll = async () => {
    if (stems.length === 0) return;

    try {
      // Download each stem
      for (const stem of stems) {
        const link = document.createElement("a");
        link.href = `http://localhost:8000${stem.url}`;
        link.setAttribute("download", `${stem.name}.wav`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);

        // Add a small delay between downloads
        await new Promise((resolve) => setTimeout(resolve, 200));
      }
    } catch (error) {
      console.error("Download error:", error);
    }
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
              <label className="neon-button haptic px-6 py-3 cursor-pointer flex items-center gap-2 mx-auto">
                <input type="file" accept="audio/*" onChange={handleInputChange} className="hidden" />
                <Upload className="w-4 h-4" />
                LOAD CARTRIDGE
              </label>
            )}

            {(status === "complete" || status === "error") && (
              <>
                <button onClick={resetUpload} className="neon-button haptic px-6 py-3 flex items-center gap-2 mx-auto">
                  <Upload className="w-4 h-4" />
                  {status === "error" ? "RETRY" : "LOAD NEW"}
                </button>
                {status === "complete" && stems.length > 0 && (
                  <motion.button
                    onClick={handleDownloadAll}
                    className="neon-button haptic px-6 py-3 flex items-center gap-2 mx-auto bg-primary/10 border border-primary/40 hover:bg-primary/20"
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                  >
                    <Download className="w-4 h-4" />
                    DOWNLOAD ALL
                  </motion.button>
                )}
              </>
            )}
          </div>
        </div>
      </motion.div>

      {/* Stem Cards - 3x2 Grid for 6 stems */}
      <AnimatePresence>
        {status === "complete" && stems.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="space-y-4"
          >
            {/* Section Header */}
            <div className="flex items-center justify-between">
              <div>
                <p className="tech-label">OUTPUT CHANNELS</p>
                <p className="text-xs text-muted-foreground font-mono mt-1">
                  {stems.length} STEMS • htdemucs_6s
                </p>
              </div>
            </div>

            {/* 3x2 Grid Layout */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {stems.map((stem, idx) => (
                <motion.div
                  key={stem.name}
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: idx * 0.08 }}
                >
                  <StemCard
                    name={stem.name}
                    url={stem.url}
                    duration={stem.duration}
                    rmsDb={stem.rms_db}
                    peakDb={stem.peak_db}
                  />
                </motion.div>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default SplitterModule;
