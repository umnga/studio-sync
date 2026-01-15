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

const AudioSplitter = () => {
  const [dragActive, setDragActive] = useState(false);
  const [fileName, setFileName] = useState<string | null>(null);
  const [status, setStatus] = useState<ProcessingStatus>("idle");
  const [progress, setProgress] = useState(0);
  const { toast } = useToast();

  const handleFileUpload = useCallback((file: File) => {
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

    // Simulate upload
    const uploadInterval = setInterval(() => {
      setProgress((prev) => {
        if (prev >= 30) {
          clearInterval(uploadInterval);
          setStatus("processing");
          simulateProcessing();
          return 30;
        }
        return prev + 5;
      });
    }, 100);
  }, [toast]);

  const simulateProcessing = () => {
    const processInterval = setInterval(() => {
      setProgress((prev) => {
        if (prev >= 100) {
          clearInterval(processInterval);
          setStatus("complete");
          toast({
            title: "Processing complete!",
            description: "Your audio has been separated into stems.",
          });
          return 100;
        }
        return prev + 2;
      });
    }, 150);
  };

  const handleDrag = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFileUpload(e.dataTransfer.files[0]);
    }
  }, [handleFileUpload]);

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
      <div className="container mx-auto px-4 py-12">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="max-w-4xl mx-auto"
        >
          {/* Header */}
          <div className="text-center mb-10">
            <h1 className="text-3xl md:text-4xl font-bold mb-4">
              Audio <span className="gradient-text">Splitter</span>
            </h1>
            <p className="text-muted-foreground max-w-xl mx-auto">
              Separate any song into individual stems using AI-powered audio separation.
              Extract vocals, drums, bass, and more.
            </p>
          </div>

          {/* Upload Zone */}
          <motion.div
            onDragEnter={handleDrag}
            onDragLeave={handleDrag}
            onDragOver={handleDrag}
            onDrop={handleDrop}
            animate={{
              borderColor: dragActive ? "hsl(263 70% 66%)" : "hsl(217 33% 30% / 0.5)",
              scale: dragActive ? 1.02 : 1,
            }}
            className={`glass-card rounded-2xl p-8 md:p-12 border-2 border-dashed transition-colors ${
              status !== "idle" && status !== "complete" ? "pointer-events-none" : ""
            }`}
          >
            <div className="text-center">
              <motion.div
                animate={{ y: dragActive ? -5 : 0 }}
                className="inline-flex p-4 rounded-full bg-primary/10 mb-6"
              >
                {status === "complete" ? (
                  <Check className="h-10 w-10 text-success" />
                ) : status === "uploading" || status === "processing" ? (
                  <Loader2 className="h-10 w-10 text-primary animate-spin" />
                ) : (
                  <Upload className="h-10 w-10 text-primary" />
                )}
              </motion.div>

              {fileName && (
                <motion.div
                  initial={{ opacity: 0, y: -10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="flex items-center justify-center gap-2 mb-4 text-foreground"
                >
                  <FileAudio className="h-4 w-4" />
                  <span className="font-medium">{fileName}</span>
                </motion.div>
              )}

              <h3 className="text-xl font-semibold mb-2">
                {status === "idle" 
                  ? "Drop your audio file here" 
                  : getStatusMessage()}
              </h3>
              
              {status === "idle" && (
                <p className="text-muted-foreground mb-6">
                  or click to browse your files
                </p>
              )}

              {/* Progress Bar */}
              <AnimatePresence>
                {(status === "uploading" || status === "processing") && (
                  <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0 }}
                    className="max-w-md mx-auto mb-6"
                  >
                    <Progress value={progress} className="h-2" />
                    <p className="text-sm text-muted-foreground mt-2">{progress}%</p>
                  </motion.div>
                )}
              </AnimatePresence>

              {status === "idle" && (
                <label>
                  <input
                    type="file"
                    accept="audio/*"
                    onChange={handleInputChange}
                    className="hidden"
                  />
                  <Button asChild className="bg-gradient-to-r from-primary to-secondary hover:opacity-90">
                    <span>
                      <Upload className="mr-2 h-4 w-4" />
                      Upload Audio
                    </span>
                  </Button>
                </label>
              )}

              {status === "complete" && (
                <Button
                  onClick={() => {
                    setStatus("idle");
                    setFileName(null);
                    setProgress(0);
                  }}
                  variant="outline"
                  className="border-border"
                >
                  Upload Another File
                </Button>
              )}
            </div>
          </motion.div>

          {/* Results Section */}
          <AnimatePresence>
            {status === "complete" && (
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                className="mt-10"
              >
                <div className="flex items-center justify-between mb-6">
                  <h2 className="text-xl font-semibold">Separated Stems</h2>
                  <Button variant="outline" className="border-border">
                    <Download className="mr-2 h-4 w-4" />
                    Download All
                  </Button>
                </div>

                <div className="grid md:grid-cols-2 gap-4">
                  {stems.map((stem, index) => (
                    <AudioPlayerCard
                      key={stem.title}
                      title={stem.title}
                      color={stem.color}
                      delay={index * 0.1}
                    />
                  ))}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>
      </div>
    </Layout>
  );
};

export default AudioSplitter;
