import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { Youtube, AlertCircle } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

interface YouTubeInputProps {
  onSubmit: (url: string) => void;
  disabled?: boolean;
}

export const YouTubeInput: React.FC<YouTubeInputProps> = ({ onSubmit, disabled }) => {
  const [url, setUrl] = useState("");
  const [error, setError] = useState("");

  const validateYouTubeUrl = (url: string): boolean => {
    const patterns = [
      /^https?:\/\/(www\.)?youtube\.com\/watch\?v=[\w-]+/,
      /^https?:\/\/(www\.)?youtu\.be\/[\w-]+/,
      /^https?:\/\/(www\.)?youtube\.com\/embed\/[\w-]+/,
      /^https?:\/\/(www\.)?youtube\.com\/v\/[\w-]+/,
    ];
    return patterns.some(pattern => pattern.test(url));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    const trimmedUrl = url.trim();
    
    if (!trimmedUrl) {
      setError("Please enter a YouTube URL");
      return;
    }

    if (!validateYouTubeUrl(trimmedUrl)) {
      setError("Please enter a valid YouTube URL");
      return;
    }

    setError("");
    onSubmit(trimmedUrl);
    setUrl(""); // Clear input after submission
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setUrl(e.target.value);
    if (error) setError(""); // Clear error when user starts typing
  };

  return (
    <div className="text-center">
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        className="inline-flex items-center gap-2 mb-6"
      >
        <div className="relative">
          <div className="absolute inset-0 bg-red-500/20 rounded-full blur-xl"></div>
          <div className="relative p-6 rounded-2xl bg-gradient-to-br from-red-500 to-red-600 text-white">
            <Youtube className="h-8 w-8" />
          </div>
        </div>
      </motion.div>

      <h3 className="text-2xl font-bold mb-2 text-foreground">
        Paste YouTube URL
      </h3>
      <p className="text-muted-foreground mb-6">
        Enter any YouTube video URL to extract and separate the audio
      </p>

      <form onSubmit={handleSubmit} className="max-w-md mx-auto space-y-4">
        <div className="relative">
          <input
            type="text"
            placeholder="https://youtube.com/watch?v=..."
            value={url}
            onChange={handleChange}
            disabled={disabled}
            className="w-full px-4 py-2 rounded-md border border-input bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
          />
          <Youtube className="absolute right-3 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground pointer-events-none" />
        </div>

        <AnimatePresence>
          {error && (
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="flex items-center gap-2 text-red-500 text-sm justify-center"
            >
              <AlertCircle className="h-4 w-4" />
              <span>{error}</span>
            </motion.div>
          )}
        </AnimatePresence>

        <Button
          type="submit"
          disabled={disabled || !url.trim()}
          className="btn-primary w-full h-12 text-base"
        >
          <Youtube className="mr-2 h-5 w-5" />
          Process YouTube Video
        </Button>
      </form>

      <div className="mt-6 text-xs text-muted-foreground">
        <p>Supported formats:</p>
        <p className="font-mono mt-1">
          youtube.com/watch?v=... • youtu.be/...
        </p>
      </div>
    </div>
  );
};