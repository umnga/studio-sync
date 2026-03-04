import { useState, useCallback, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Upload, Loader2, Square, Download, Youtube } from "lucide-react";
type ProcessingStatus = "idle" | "uploading" | "processing" | "complete" | "error";
type InputMode = "file" | "youtube";

type StemData = {
  name: string;
  url: string;
  duration: number;
  rms_db: number;
  peak_db: number;
};

type YouTubeMetadata = {
  title: string;
  thumbnail: string;
  duration: number;
  cached?: boolean;
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
  const [stage, setStage] = useState("");
  const [stems, setStems] = useState<StemData[]>([]);
  const [inputMode, setInputMode] = useState<InputMode>("file");
  const [youtubeUrl, setYoutubeUrl] = useState("");
  const [youtubeMetadata, setYoutubeMetadata] = useState<YouTubeMetadata | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  const processStream = useCallback(async (response: Response) => {
    const reader = response.body?.getReader();
    const decoder = new TextDecoder();

    if (!reader) throw new Error("Failed to get response stream");

    let buffer = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const messages = buffer.split("\n\n");
      buffer = messages.pop() || "";

      for (const message of messages) {
        if (!message.trim()) continue;

        const lines = message.split("\n");
        let eventType = "message";
        let eventData = null;

        for (const line of lines) {
          if (line.startsWith("event: ")) {
            eventType = line.slice(7).trim();
          } else if (line.startsWith("data: ")) {
            try {
              eventData = JSON.parse(line.slice(6));
            } catch (e) {
              console.warn("Failed to parse SSE data:", line);
            }
          }
        }

        if (!eventData) continue;

        if (eventType === "metadata") {
          setYoutubeMetadata({
            title: eventData.title,
            thumbnail: eventData.thumbnail,
            duration: eventData.duration,
            cached: eventData.cached,
          });
          setFileName(eventData.title);
        } else if (eventType === "progress") {
          setProgress(eventData.percent || 0);
          setStage(eventData.stage || "Processing...");
          if (eventData.percent >= 30) {
            setStatus("processing");
          }
        } else if (eventType === "complete") {
          setStems(eventData.data.stems || []);
          setStatus("complete");
          setProgress(100);
          setStage("Complete!");
        } else if (eventType === "error") {
          throw new Error(eventData.error || "Processing failed");
        }
      }
    }
  }, []);

  const handleFileUpload = useCallback(
    async (file: File) => {
      if (!file.type.includes("audio")) return;

      setFileName(file.name);
      setStatus("uploading");
      setProgress(0);
      setStage("Uploading...");
      setStems([]);
      setYoutubeMetadata(null);

      try {
        const formData = new FormData();
        formData.append("file", file);
        formData.append("mode", "detailed");

        setStatus("processing");
        abortControllerRef.current = new AbortController();

        const response = await fetch(`${API_BASE_URL}/api/split/stream`, {
          method: "POST",
          body: formData,
          signal: abortControllerRef.current.signal,
        });

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}));
          throw new Error(errorData.detail || `Server error: ${response.status}`);
        }

        await processStream(response);
      } catch (error) {
        if ((error as Error).name === "AbortError") {
          setStatus("idle");
          setProgress(0);
          setStage("");
          return;
        }
        console.error("Error:", error);
        setStatus("error");
        setStage("Error occurred");
      }
    },
    [processStream]
  );

  const handleYouTubeSubmit = useCallback(async () => {
    if (!youtubeUrl.trim()) return;

    setFileName("Fetching from YouTube...");
    setStatus("uploading");
    setProgress(0);
    setStage("Downloading from YouTube...");
    setStems([]);
    setYoutubeMetadata(null);

    try {
      setStatus("processing");
      abortControllerRef.current = new AbortController();

      const response = await fetch(`${API_BASE_URL}/api/split-youtube/stream`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          url: youtubeUrl.trim(),
          mode: "detailed",
        }),
        signal: abortControllerRef.current.signal,
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.detail || `Server error: ${response.status}`);
      }

      await processStream(response);
      setYoutubeUrl("");
    } catch (error) {
      if ((error as Error).name === "AbortError") {
        setStatus("idle");
        setProgress(0);
        setStage("");
        setYoutubeMetadata(null);
        return;
      }
      console.error("Error:", error);
      setStatus("error");
      setStage("Error occurred");
    }
  }, [youtubeUrl, processStream]);

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
        setInputMode("file");
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
    setStage("");
    setStems([]);
    setYoutubeUrl("");
    setYoutubeMetadata(null);
  };

  const handleDownloadAll = async () => {
    if (stems.length === 0) return;
    try {
      for (const stem of stems) {
        const link = document.createElement("a");
        link.href = `${API_BASE_URL}${stem.url}`;
        link.setAttribute("download", `${stem.name}.wav`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        await new Promise((resolve) => setTimeout(resolve, 200));
      }
    } catch (error) {
      console.error("Download error:", error);
    }
  };


  return (
    <div className="w-full h-full space-y-6">
      <div className="flex items-center justify-between mb-4">
        <div>
          <p className="tech-label mb-1">SEPARATION MODULE</p>
          <h2 className="text-xl font-black text-primary">STEM SPLITTER</h2>
        </div>
      </div>

      {/* Input Mode Selector */}
      <div className="flex gap-2 mb-4">
        <button
          onClick={() => setInputMode("file")}
          disabled={status === "processing"}
          className={`flex-1 px-4 py-2 rounded border transition-all ${
            inputMode === "file"
              ? "bg-primary/20 border-primary text-primary"
              : "bg-background/60 border-primary/30 text-muted-foreground hover:border-primary/50"
          }`}
        >
          <Upload className="w-4 h-4 inline mr-2" />
          FILE UPLOAD
        </button>
        <button
          onClick={() => setInputMode("youtube")}
          disabled={status === "processing"}
          className={`flex-1 px-4 py-2 rounded border transition-all ${
            inputMode === "youtube"
              ? "bg-primary/20 border-primary text-primary"
              : "bg-background/60 border-primary/30 text-muted-foreground hover:border-primary/50"
          }`}
        >
          <Youtube className="w-4 h-4 inline mr-2" />
          YOUTUBE URL
        </button>
      </div>

      <AnimatePresence mode="wait">
        {inputMode === "file" ? (
          <motion.div
            key="file-mode"
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 20 }}
            onDragEnter={handleDrag}
            onDragLeave={handleDrag}
            onDragOver={handleDrag}
            onDrop={handleDrop}
            className={`tape-deck ${dragActive ? "tape-deck-active" : ""} ${
              status !== "idle" && status !== "complete" ? "pointer-events-none opacity-75" : ""
            }`}
          >
            <div className="text-center">
              <motion.div animate={{ y: dragActive ? -6 : 0 }} className="inline-flex mb-6">
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
                    <p className="text-sm font-mono text-primary truncate max-w-xs mx-auto">
                      {fileName}
                    </p>
                  </motion.div>
                )}
              </AnimatePresence>

              <h3 className="text-lg font-bold mb-3 text-foreground uppercase tracking-wider">
                {status === "idle" && "INSERT AUDIO CARTRIDGE"}
                {status === "uploading" && "LOADING CARTRIDGE..."}
                {status === "processing" && stage}
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
                        style={{
                          width: `${progress}%`,
                        }}
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
                    <input
                      type="file"
                      accept="audio/*"
                      onChange={handleInputChange}
                      className="hidden"
                    />
                    <Upload className="w-4 h-4" />
                    LOAD CARTRIDGE
                  </label>
                )}

                {(status === "complete" || status === "error") && (
                  <>
                    <button
                      onClick={resetUpload}
                      className="neon-button haptic px-6 py-3 flex items-center gap-2 mx-auto"
                    >
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
        ) : (
          <motion.div
            key="youtube-mode"
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            className={`tape-deck ${
              status !== "idle" && status !== "complete" ? "pointer-events-none opacity-75" : ""
            }`}
          >
            <div className="text-center">
              <motion.div className="inline-flex mb-6">
                <div className="relative w-20 h-20 rounded-[10px] bg-gradient-to-b from-card/60 to-background/80 border border-primary/30 flex items-center justify-center shadow-[inset_0_2px_8px_rgba(0,0,0,0.4)]">
                  {status === "uploading" || status === "processing" ? (
                    <Loader2 className="w-8 h-8 text-primary animate-spin" />
                  ) : (
                    <Youtube className="w-8 h-8 text-primary" />
                  )}
                </div>
              </motion.div>

              <AnimatePresence>
                {youtubeMetadata && (
                  <motion.div
                    initial={{ opacity: 0, y: -8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0 }}
                    className="mb-4 flex items-center justify-center gap-3"
                  >
                    {youtubeMetadata.thumbnail && (
                      <img
                        src={youtubeMetadata.thumbnail}
                        alt={youtubeMetadata.title}
                        className="w-16 h-12 object-cover rounded border border-primary/30"
                      />
                    )}
                    <div className="text-left">
                      <p className="text-sm font-mono text-primary truncate max-w-xs">
                        {youtubeMetadata.title}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {Math.floor(youtubeMetadata.duration / 60)}:
                        {String(Math.floor(youtubeMetadata.duration % 60)).padStart(2, "0")}
                      </p>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              <h3 className="text-lg font-bold mb-3 text-foreground uppercase tracking-wider">
                {status === "idle" && "PASTE YOUTUBE URL"}
                {status === "uploading" && "DOWNLOADING..."}
                {status === "processing" && stage}
                {status === "complete" && "SEPARATION COMPLETE"}
                {status === "error" && "ERROR — RETRY"}
              </h3>

              {status === "idle" && (
                <p className="text-xs text-muted-foreground mb-6 uppercase tracking-wider">
                  Enter URL and press LOAD
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
                        style={{ width: `${progress}%` }}
                        transition={{ duration: 0.2 }}
                      />
                    </div>
                    <p className="text-xs font-mono text-primary mt-2">{Math.round(progress)}%</p>
                  </motion.div>
                )}
              </AnimatePresence>

              {status === "idle" && (
                <div className="max-w-md mx-auto mb-6">
                  <input
                    type="text"
                    value={youtubeUrl}
                    onChange={(e) => setYoutubeUrl(e.target.value)}
                    placeholder="https://youtube.com/watch?v=..."
                    className="w-full px-4 py-2 bg-background/60 border border-primary/30 rounded text-sm font-mono text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none"
                    onKeyDown={(e) => {
                      if (e.key === "Enter") handleYouTubeSubmit();
                    }}
                  />
                </div>
              )}

              <div className="flex flex-col sm:flex-row gap-3 justify-center">
                {status === "idle" && (
                  <button
                    onClick={handleYouTubeSubmit}
                    disabled={!youtubeUrl.trim()}
                    className="neon-button haptic px-6 py-3 flex items-center gap-2 mx-auto disabled:opacity-50"
                  >
                    <Youtube className="w-4 h-4" />
                    LOAD FROM YOUTUBE
                  </button>
                )}

                {(status === "complete" || status === "error") && (
                  <>
                    <button
                      onClick={resetUpload}
                      className="neon-button haptic px-6 py-3 flex items-center gap-2 mx-auto"
                    >
                      <Youtube className="w-4 h-4" />
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
        )}
      </AnimatePresence>

      {/* Stem Cards */}
      <AnimatePresence>
        {status === "complete" && stems.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="space-y-4"
          >
            <div className="flex items-center justify-between">
              <div>
                <p className="tech-label">OUTPUT CHANNELS</p>
                <p className="text-xs text-muted-foreground font-mono mt-1">
                  {stems.length} STEMS • htdemucs_6s
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {stems.map((stem, idx) => (
                <div key={stem.name} className="p-4 rounded-lg bg-card border border-border flex flex-col items-center">
                  <span className="font-bold text-lg mb-2 text-foreground">{stem.name.charAt(0).toUpperCase() + stem.name.slice(1)}</span>
                  <audio controls src={stem.url} className="w-full mb-2" />
                  <span className="text-xs text-muted-foreground">Duration: {Math.round(stem.duration)}s</span>
                  <span className="text-xs text-muted-foreground">RMS: {stem.rms_db} dB, Peak: {stem.peak_db} dB</span>
                </div>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default SplitterModule;