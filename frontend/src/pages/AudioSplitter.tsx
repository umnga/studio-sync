import { useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Upload, FileAudio, Download, Check, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Layout } from "@/components/Layout";
import { AudioPlayerCard } from "@/components/AudioPlayerCard";
import { useToast } from "@/hooks/use-toast";

type ProcessingStatus = "idle" | "uploading" | "processing" | "complete" | "error";

const stems = [
  { title: "Vocals", color: "#8B5CF6" },
  { title: "Drums", color: "#3B82F6" },
  { title: "Bass", color: "#10B981" },
  { title: "Guitar/Other", color: "#F59E0B" },
];

const API_BASE_URL = "http://localhost:8000";

const AudioSplitter = () => {
  const [dragActive, setDragActive] = useState(false);
  const [fileName, setFileName] = useState<string | null>(null);
  const [status, setStatus] = useState<ProcessingStatus>("idle");
  const [progress, setProgress] = useState(0);
  const [stems_data, setStems] = useState<any>(null);
  const { toast } = useToast();

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

      try {
        // Upload file to backend
        const formData = new FormData();
        formData.append("file", file);

        // First, get file info
        setProgress(20);
        const infoResponse = await fetch(
          `${API_BASE_URL}/api/audio-splitter/info`,
          {
            method: "POST",
            body: formData,
          }
        );

        if (!infoResponse.ok) {
          throw new Error("Failed to get audio info");
        }

        const audioInfo = await infoResponse.json();
        console.log("Audio info:", audioInfo);

        setProgress(30);
        setStatus("processing");

        // Upload again for splitting
        const splitFormData = new FormData();
        splitFormData.append("file", file);

        const splitResponse = await fetch(
          `${API_BASE_URL}/api/audio-splitter/split`,
          {
            method: "POST",
            body: splitFormData,
          }
        );

        if (!splitResponse.ok) {
          throw new Error("Failed to split audio");
        }

        const result = await splitResponse.json();
        console.log("Split result:", result);

        // Simulate progress to 100%
        let currentProgress = 30;
        const progressInterval = setInterval(() => {
          currentProgress += Math.random() * 15;
          if (currentProgress >= 100) {
            currentProgress = 100;
            clearInterval(progressInterval);
          }
          setProgress(currentProgress);
        }, 200);

        // Wait a moment before completing
        await new Promise((resolve) => setTimeout(resolve, 2000));
        clearInterval(progressInterval);

        setProgress(100);
        setStatus("complete");
        setStems(result);
        toast({
          title: "Processing complete!",
          description: "Your audio has been separated into stems.",
        });
      } catch (error) {
        console.error("Error:", error);
        setStatus("error");
        toast({
          title: "Error",
          description:
            error instanceof Error
              ? error.message
              : "Failed to process audio",
          variant: "destructive",
        });
      }
    },
    [toast]
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

      if (e.dataTransfer.files && e.dataTransfer.files[0]) {
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

  const getStatusMessage = () => {
    switch (status) {
      case "uploading":
        return "Uploading your file...";
      case "processing":
        return "AI is separating stems...";
      case "complete":
        return "Processing complete!";
      case "error":
        return "An error occurred. Please try again.";
      default:
        return "";
    }
  };

  return (
    <Layout>
      <div className="min-h-screen bg-gradient-subtle py-12 px-4">
        <div className="max-w-5xl mx-auto">
          {/* Header Section */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            className="text-center mb-16"
          >
            <div className="inline-flex items-center gap-2 mb-4 px-4 py-2 bg-primary/10 rounded-full">
              <span className="w-2 h-2 bg-primary rounded-full animate-pulse"></span>
              <p className="text-sm font-medium text-primary">AI-Powered Audio Separation</p>
            </div>
            <h1 className="section-header mb-4">
              Professional <span className="gradient-text">Audio Stem Separation</span>
            </h1>
            <p className="section-subtitle">
              Extract vocals, drums, bass, and instruments from any audio file using advanced AI technology.
              Perfect for music producers, DJs, and content creators.
            </p>
          </motion.div>

          {/* Main Upload Area */}
          <motion.div
            onDragEnter={handleDrag}
            onDragLeave={handleDrag}
            onDragOver={handleDrag}
            onDrop={handleDrop}
            animate={{
              scale: dragActive ? 1.02 : 1,
            }}
            className={`card-premium p-8 md:p-12 border-2 border-dashed transition-all ${
              dragActive ? "border-primary bg-primary/5" : "border-border"
            } ${status !== "idle" && status !== "complete" ? "pointer-events-none opacity-75" : ""}`}
          >
            <div className="text-center">
              {/* Icon */}
              <motion.div
                animate={{ y: dragActive ? -8 : 0 }}
                className="inline-flex mb-6"
              >
                <div className="relative">
                  <div className="absolute inset-0 bg-primary/20 rounded-full blur-xl"></div>
                  <div className="relative bg-gradient-to-br from-primary to-secondary p-6 rounded-2xl text-white">
                    {status === "complete" ? (
                      <Check className="h-8 w-8" />
                    ) : status === "uploading" || status === "processing" ? (
                      <Loader2 className="h-8 w-8 animate-spin" />
                    ) : (
                      <Upload className="h-8 w-8" />
                    )}
                  </div>
                </div>
              </motion.div>

              {/* File Name */}
              <AnimatePresence>
                {fileName && (
                  <motion.div
                    initial={{ opacity: 0, y: -10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0 }}
                    className="flex items-center justify-center gap-2 mb-6 text-sm"
                  >
                    <FileAudio className="h-4 w-4 text-primary" />
                    <span className="font-medium text-foreground truncate max-w-xs">{fileName}</span>
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Status Text */}
              <h3 className="text-2xl font-bold mb-2 text-foreground">
                {status === "idle"
                  ? "Drop your audio file here"
                  : getStatusMessage()}
              </h3>

              {status === "idle" && (
                <p className="text-muted-foreground mb-8">
                  or click the button below to browse. Supports MP3, WAV, FLAC, and more.
                </p>
              )}

              {/* Progress Bar */}
              <AnimatePresence>
                {(status === "uploading" || status === "processing") && (
                  <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0 }}
                    className="max-w-xs mx-auto mb-6"
                  >
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm font-medium text-muted-foreground">
                        {status === "uploading" ? "Uploading" : "Processing"}
                      </span>
                      <span className="text-sm font-semibold text-primary">{Math.round(progress)}%</span>
                    </div>
                    <Progress value={progress} className="h-2.5" />
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Action Buttons */}
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

                {status === "complete" && (
                  <Button
                    onClick={() => {
                      setStatus("idle");
                      setFileName(null);
                      setProgress(0);
                      setStems(null);
                    }}
                    className="btn-secondary"
                  >
                    <Upload className="mr-2 h-4 w-4" />
                    Upload Another File
                  </Button>
                )}

                {status === "error" && (
                  <Button
                    onClick={() => {
                      setStatus("idle");
                      setFileName(null);
                      setProgress(0);
                    }}
                    className="btn-primary"
                  >
                    Try Again
                  </Button>
                )}
              </div>
            </div>
          </motion.div>

          {/* Results Section */}
          <AnimatePresence>
            {status === "complete" && stems_data && (
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                className="mt-16"
              >
                {/* Results Header */}
                <div className="flex items-center justify-between mb-8">
                  <div>
                    <h2 className="text-3xl font-bold text-foreground mb-2">Separated Stems</h2>
                    <p className="text-muted-foreground">Your audio has been successfully separated</p>
                  </div>
                  <Button variant="outline" className="hidden sm:flex border-primary text-primary hover:bg-primary/10">
                    <Download className="mr-2 h-4 w-4" />
                    Download All
                  </Button>
                </div>

                {/* Stems Grid */}
                <div className="grid md:grid-cols-2 gap-6">
                  {stems.map((stem, index) => (
                    <AudioPlayerCard
                      key={stem.title}
                      title={stem.title}
                      color={stem.color}
                      delay={index * 0.1}
                    />
                  ))}
                </div>

                {/* Mobile Download Button */}
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
    </Layout>
  );
};

export default AudioSplitter;
