import { useState, useCallback, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Upload,
  FileAudio,
  Download,
  Check,
  Loader2,
  Zap,
  Layers,
  Activity,
  AlertCircle,
  Youtube,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { ServerStatusBar } from "@/components/ServerStatusBar";
import { YouTubeInput } from "@/components/YouTubeInput";
import { useToast } from "@/hooks/use-toast";

type ProcessingStatus = "idle" | "uploading" | "processing" | "complete" | "error";
type SplitMode = "fast" | "detailed";
type UploadMode = "file" | "youtube";

interface StemData {
  name: string;
  url: string;
  mime_type: string;
  duration: number;
  rms_db: number;
  peak_db: number;
}

interface SplitResult {
  success: boolean;
  session_id: string;
  stems: StemData[];
  sample_rate: number;
  model_used: string;
  mode: string;
  cache_hit?: boolean;
}

interface YouTubeMetadata {
  title: string;
  thumbnail: string;
  duration: number;
  cached?: boolean;
}

const STEM_COLORS: Record<string, string> = {
  vocals: "#8B5CF6",
  drums: "#3B82F6",
  bass: "#10B981",
  guitar: "#F59E0B",
  piano: "#EC4899",
  other: "#6B7280",
};

const API_BASE_URL = "http://localhost:8000";

const AudioSplitter = () => {
  const [dragActive, setDragActive] = useState(false);
  const [fileName, setFileName] = useState<string | null>(null);
  const [status, setStatus] = useState<ProcessingStatus>("idle");
  const [progress, setProgress] = useState(0);
  const [stage, setStage] = useState<string>("");
  const [splitResult, setSplitResult] = useState<SplitResult | null>(null);
  const [splitMode, setSplitMode] = useState<SplitMode>("detailed");
  const [uploadMode, setUploadMode] = useState<UploadMode>("file");
  const [youtubeMetadata, setYoutubeMetadata] = useState<YouTubeMetadata | null>(null);
  const { toast } = useToast();
  const abortControllerRef = useRef<AbortController | null>(null);

  const processStream = useCallback(
    async (response: Response) => {
      const reader = response.body?.getReader();
      const decoder = new TextDecoder();

      if (!reader) {
        throw new Error("Failed to get response stream");
      }

      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();

        if (done) break;

        buffer += decoder.decode(value, { stream: true });

        // Split by double newline (SSE message separator)
        const messages = buffer.split("\n\n");
        buffer = messages.pop() || "";

        for (const message of messages) {
          if (!message.trim()) continue;

          // Parse SSE format: "event: eventname\ndata: {json}"
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
            } else if (line.startsWith(": ")) {
              // Keepalive comment, ignore
              continue;
            }
          }

          if (!eventData) continue;

          // Handle different event types
          if (eventType === "metadata") {
            setYoutubeMetadata({
              title: eventData.title,
              thumbnail: eventData.thumbnail,
              duration: eventData.duration,
              cached: eventData.cached,
            });
            setFileName(eventData.title);
            if (eventData.cached) {
              toast({
                title: "Using cached audio",
                description: "This video was previously downloaded",
              });
            }
          } else if (eventType === "progress") {
            setProgress(eventData.percent || 0);
            setStage(eventData.stage || "Processing...");
          } else if (eventType === "complete") {
            setProgress(100);
            setStage("Complete!");
            setStatus("complete");
            setSplitResult(eventData.data);

            const cacheMsg = eventData.data.cache_hit ? " (using cached stems)" : "";

            toast({
              title: "Processing complete!" + cacheMsg,
              description: `Your audio has been separated into ${eventData.data.stems.length} stems.`,
            });
          } else if (eventType === "error") {
            throw new Error(eventData.error || "Processing failed");
          }
        }
      }
    },
    [toast]
  );

  const handleFileUpload = useCallback(
    async (file: File) => {
      if (!file.type.includes("audio")) {
        toast({
          title: "Invalid file type",
          description: "Please upload an audio file (MP3, WAV, etc.)",
          variant: "destructive",
        });
        return;
      }

      setFileName(file.name);
      setStatus("uploading");
      setProgress(0);
      setStage("Preparing upload...");
      setSplitResult(null);
      setYoutubeMetadata(null);

      try {
        const formData = new FormData();
        formData.append("file", file);
        formData.append("mode", splitMode);

        setProgress(5);
        setStage("Uploading file...");
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
          toast({
            title: "Cancelled",
            description: "Processing was cancelled.",
          });
          return;
        }

        console.error("Error:", error);
        setStatus("error");
        setStage("An error occurred");
        toast({
          title: "Error",
          description: error instanceof Error ? error.message : "Failed to process audio",
          variant: "destructive",
        });
      }
    },
    [toast, splitMode, processStream]
  );

  const handleYouTubeSubmit = useCallback(
    async (url: string) => {
      setFileName("Fetching from YouTube...");
      setStatus("uploading");
      setProgress(0);
      setStage("Fetching from YouTube...");
      setSplitResult(null);
      setYoutubeMetadata(null);

      try {
        setProgress(5);
        setStage("Downloading audio from YouTube...");
        setStatus("processing");

        abortControllerRef.current = new AbortController();

        const response = await fetch(`${API_BASE_URL}/api/split-youtube/stream`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            url: url,
            mode: splitMode,
          }),
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
          setYoutubeMetadata(null);
          toast({
            title: "Cancelled",
            description: "Processing was cancelled.",
          });
          return;
        }

        console.error("Error:", error);
        setStatus("error");
        setStage("An error occurred");
        toast({
          title: "Error",
          description: error instanceof Error ? error.message : "Failed to process YouTube audio",
          variant: "destructive",
        });
      }
    },
    [toast, splitMode, processStream]
  );

  const handleCancel = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
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

      if (e.dataTransfer.files && e.dataTransfer.files[0]) {
        setUploadMode("file");
        handleFileUpload(e.dataTransfer.files[0]);
      }
    },
    [handleFileUpload]
  );

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      handleFileUpload(e.target.files[0]);
    }
  };

  const handleReset = () => {
    setStatus("idle");
    setFileName(null);
    setProgress(0);
    setStage("");
    setSplitResult(null);
    setYoutubeMetadata(null);
  };

  return (
    <div className="min-h-screen bg-gradient-subtle py-12 px-4">
        <div className="max-w-5xl mx-auto">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            className="text-center mb-12"
          >
            <div className="inline-flex items-center gap-2 mb-4 px-4 py-2 bg-primary/10 rounded-full">
              <Activity className="w-4 h-4 text-primary animate-pulse" />
              <p className="text-sm font-medium text-primary">AI-Powered Audio Separation</p>
            </div>
            <h1 className="section-header mb-4">
              Professional <span className="gradient-text">Stem Separation</span>
            </h1>
            <p className="section-subtitle">
              Extract vocals, drums, bass, and instruments from any audio file or YouTube video using
              advanced AI.
            </p>
          </motion.div>

          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.2 }}
            className="mb-8"
          >
            <ServerStatusBar />
          </motion.div>

          <div className="flex justify-center mb-8">
            <button
              onClick={() => setSplitMode("fast")}
              disabled={status === "processing"}
              className={`px-6 py-2.5 rounded-lg font-semibold text-sm mr-2 ${splitMode === "fast" ? "bg-yellow-500/20 text-yellow-500" : "text-muted-foreground hover:text-foreground"}`}
            >
              <Zap className="h-4 w-4 inline-block mr-1" /> Fast Mode
            </button>
            <button
              onClick={() => setSplitMode("detailed")}
              disabled={status === "processing"}
              className={`px-6 py-2.5 rounded-lg font-semibold text-sm ${splitMode === "detailed" ? "bg-purple-500/20 text-purple-500" : "text-muted-foreground hover:text-foreground"}`}
            >
              <Layers className="h-4 w-4 inline-block mr-1" /> Pro Mode
            </button>
          </div>

          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.4 }}
            className="flex justify-center mb-6"
          >
            <div className="inline-flex gap-2 p-1 bg-card/50 backdrop-blur-sm border border-border rounded-lg">
              <button
                onClick={() => setUploadMode("file")}
                disabled={status === "processing"}
                className={`px-4 py-2 rounded-md transition-all flex items-center gap-2 ${
                  uploadMode === "file"
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                <Upload className="h-4 w-4" />
                File Upload
              </button>
              <button
                onClick={() => setUploadMode("youtube")}
                disabled={status === "processing"}
                className={`px-4 py-2 rounded-md transition-all flex items-center gap-2 ${
                  uploadMode === "youtube"
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                <Youtube className="h-4 w-4" />
                YouTube URL
              </button>
            </div>
          </motion.div>

          <AnimatePresence mode="wait">
            {uploadMode === "file" ? (
              <motion.div
                key="file-upload"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                transition={{ duration: 0.3 }}
                onDragEnter={handleDrag}
                onDragLeave={handleDrag}
                onDragOver={handleDrag}
                onDrop={handleDrop}
                className={`card-premium p-8 md:p-12 border-2 border-dashed transition-all ${
                  dragActive ? "border-primary bg-primary/5" : "border-border"
                } ${
                  status !== "idle" && status !== "complete" && status !== "error"
                    ? "pointer-events-none"
                    : ""
                }`}
              >
                <div className="text-center">
                  <motion.div animate={{ y: dragActive ? -8 : 0 }} className="inline-flex mb-6">
                    <div className="relative">
                      <div className="absolute inset-0 bg-primary/20 rounded-full blur-xl"></div>
                      <div
                        className={`relative p-6 rounded-2xl text-white ${
                          status === "error"
                            ? "bg-red-500"
                            : "bg-gradient-to-br from-primary to-secondary"
                        }`}
                      >
                        {status === "complete" ? (
                          <Check className="h-8 w-8" />
                        ) : status === "error" ? (
                          <AlertCircle className="h-8 w-8" />
                        ) : status === "uploading" || status === "processing" ? (
                          <Loader2 className="h-8 w-8 animate-spin" />
                        ) : (
                          <Upload className="h-8 w-8" />
                        )}
                      </div>
                    </div>
                  </motion.div>

                  <AnimatePresence>
                    {fileName && (
                      <motion.div
                        initial={{ opacity: 0, y: -10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0 }}
                        className="flex items-center justify-center gap-2 mb-6 text-sm"
                      >
                        <FileAudio className="h-4 w-4 text-primary" />
                        <span className="font-medium text-foreground truncate max-w-xs">
                          {fileName}
                        </span>
                      </motion.div>
                    )}
                  </AnimatePresence>

                  <h3 className="text-2xl font-bold mb-2 text-foreground">
                    {status === "idle" && "Drop your audio file here"}
                    {status === "uploading" && "Uploading..."}
                    {status === "processing" && stage}
                    {status === "complete" && "Processing complete!"}
                    {status === "error" && "An error occurred"}
                  </h3>

                  {status === "idle" && (
                    <p className="text-muted-foreground mb-8">
                      or click the button below to browse. Supports MP3, WAV, FLAC, and more.
                    </p>
                  )}

                  <AnimatePresence>
                    {(status === "uploading" || status === "processing") && (
                      <motion.div
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0 }}
                        className="max-w-md mx-auto mb-6"
                      >
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-sm text-muted-foreground font-mono">
                            {stage || "Processing..."}
                          </span>
                          <span className="text-sm font-mono font-bold text-primary tabular-nums">
                            {Math.round(progress)}%
                          </span>
                        </div>
                        <Progress value={progress} className="h-3" />

                        <div className="flex items-center justify-center gap-2 mt-4 text-muted-foreground text-sm">
                          <Activity className="h-4 w-4 animate-pulse" />
                          <span>
                            {splitMode === "fast" ? "4-Stem" : "6-Stem"} separation in progress...
                          </span>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>

                  <div className="flex flex-col sm:flex-row gap-3 justify-center">
                    {status === "idle" && (
                      <label>
                        <input
                          type="file"
                          accept="audio/*"
                          onChange={handleInputChange}
                          className="hidden"
                        />
                        <Button className="btn-primary cursor-pointer">
                          <Upload className="mr-2 h-4 w-4" />
                          Choose Audio File
                        </Button>
                      </label>
                    )}

                    {status === "processing" && (
                      <Button onClick={handleCancel} variant="destructive">
                        Cancel
                      </Button>
                    )}

                    {status === "complete" && (
                      <Button onClick={handleReset} className="btn-secondary">
                        <Upload className="mr-2 h-4 w-4" />
                        Process Another File
                      </Button>
                    )}

                    {status === "error" && (
                      <Button onClick={handleReset} className="btn-primary">
                        Try Again
                      </Button>
                    )}
                  </div>
                </div>
              </motion.div>
            ) : (
              <motion.div
                key="youtube-input"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                transition={{ duration: 0.3 }}
                className="card-premium p-8 md:p-12"
              >
                <AnimatePresence>
                  {youtubeMetadata && (
                    <motion.div
                      initial={{ opacity: 0, scale: 0.95 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0, scale: 0.95 }}
                      className="mb-6 p-4 bg-card rounded-lg border border-border flex items-center gap-4"
                    >
                      {youtubeMetadata.thumbnail && (
                        <img
                          src={youtubeMetadata.thumbnail}
                          alt={youtubeMetadata.title}
                          className="w-24 h-16 object-cover rounded"
                        />
                      )}
                      <div className="flex-1 min-w-0">
                        <h4 className="font-semibold text-foreground truncate">
                          {youtubeMetadata.title}
                        </h4>
                        <p className="text-sm text-muted-foreground">
                          Duration: {Math.floor(youtubeMetadata.duration / 60)}:
                          {String(Math.floor(youtubeMetadata.duration % 60)).padStart(2, "0")}
                          {youtubeMetadata.cached && " • Cached"}
                        </p>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>

                <AnimatePresence>
                  {(status === "uploading" || status === "processing") && (
                    <motion.div
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0 }}
                      className="mb-6"
                    >
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-sm text-muted-foreground font-mono">
                          {stage || "Processing..."}
                        </span>
                        <span className="text-sm font-mono font-bold text-primary tabular-nums">
                          {Math.round(progress)}%
                        </span>
                      </div>
                      <Progress value={progress} className="h-3" />

                      <div className="flex items-center justify-center gap-2 mt-4 text-muted-foreground text-sm">
                        <Activity className="h-4 w-4 animate-pulse" />
                        <span>
                          {splitMode === "fast" ? "4-Stem" : "6-Stem"} separation in progress...
                        </span>
                      </div>

                      <div className="mt-4 flex justify-center">
                        <Button onClick={handleCancel} variant="destructive" size="sm">
                          Cancel
                        </Button>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>

                {status === "idle" || status === "error" ? (
                  <YouTubeInput onSubmit={handleYouTubeSubmit} />
                ) : status === "complete" ? (
                  <div className="text-center">
                    <h3 className="text-2xl font-bold mb-4 text-foreground">Processing complete!</h3>
                    <Button onClick={handleReset} className="btn-secondary">
                      <Youtube className="mr-2 h-4 w-4" />
                      Process Another Video
                    </Button>
                  </div>
                ) : null}
              </motion.div>
            )}
          </AnimatePresence>

          <AnimatePresence>
            {status === "complete" && splitResult && (
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                className="mt-16"
              >
                <div className="flex items-center justify-between mb-8">
                  <div>
                    <h2 className="text-3xl font-bold text-foreground mb-2">Separated Stems</h2>
                    <p className="text-muted-foreground">
                      {splitResult.stems.length} stems extracted using {splitResult.model_used}
                      {splitResult.cache_hit && " (from cache)"}
                    </p>
                  </div>
                  <Button
                    variant="outline"
                    className="hidden sm:flex border-primary text-primary hover:bg-primary/10"
                  >
                    <Download className="mr-2 h-4 w-4" />
                    Download All
                  </Button>
                </div>

                <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {splitResult.stems.map((stem) => (
                    <div key={stem.name} className="p-4 rounded-lg bg-card border border-border flex flex-col items-center">
                      <span className="font-bold text-lg mb-2 text-foreground">{stem.name.charAt(0).toUpperCase() + stem.name.slice(1)}</span>
                      <audio controls src={`${API_BASE_URL}${stem.url}`} className="w-full mb-2" />
                      <span className="text-xs text-muted-foreground">Duration: {Math.round(stem.duration)}s</span>
                    </div>
                  ))}
                </div>

                <Button
                  variant="outline"
                  className="w-full mt-6 sm:hidden border-primary text-primary hover:bg-primary/10"
                >
                  <Download className="mr-2 h-4 w-4" />
                  Download All
                </Button>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
  );
};

export default AudioSplitter;