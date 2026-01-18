import { useState, useRef, useEffect } from "react";
import { motion } from "framer-motion";
import { 
  Play, 
  Pause, 
  Download, 
  Volume2, 
  Mic2, 
  Drum, 
  Music, 
  Guitar, 
  Piano, 
  Waves 
} from "lucide-react";

type StemCardProps = {
  name: string;
  url: string;
  duration: number;
  rmsDb: number;
  peakDb: number;
  isGuitar?: boolean;
  isPiano?: boolean;
};

// Stem configuration with icons and labels
type StemConfig = {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  sublabel: string;
};

const STEM_CONFIG: Record<string, StemConfig> = {
  vocals: { icon: Mic2, label: "VOCALS", sublabel: "// VOX" },
  drums: { icon: Drum, label: "DRUMS", sublabel: "// KIT" },
  bass: { icon: Music, label: "BASS", sublabel: "// LOW" },
  guitar: { icon: Guitar, label: "GUITAR", sublabel: "// AC" },
  piano: { icon: Piano, label: "KEYBOARD", sublabel: "// MIDI" },
  other: { icon: Waves, label: "OTHER", sublabel: "// FX" },
};

// Get stem configuration
const getStemConfig = (name: string): StemConfig => {
  return STEM_CONFIG[name.toLowerCase()] || { 
    icon: Waves, 
    label: name.toUpperCase(), 
    sublabel: "// TRACK" 
  };
};

export const StemCard: React.FC<StemCardProps> = ({ 
  name, 
  url, 
  duration, 
  rmsDb, 
  peakDb,
  isGuitar = false,
  isPiano = false
}) => {
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [volume, setVolume] = useState(0.8);
  const audioRef = useRef<HTMLAudioElement>(null);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    audio.volume = volume;

    const updateTime = () => setCurrentTime(audio.currentTime);
    const handleEnded = () => setIsPlaying(false);

    audio.addEventListener("timeupdate", updateTime);
    audio.addEventListener("ended", handleEnded);

    return () => {
      audio.removeEventListener("timeupdate", updateTime);
      audio.removeEventListener("ended", handleEnded);
    };
  }, [volume]);

  const togglePlayPause = () => {
    const audio = audioRef.current;
    if (!audio) return;

    if (isPlaying) {
      audio.pause();
    } else {
      audio.play();
    }
    setIsPlaying(!isPlaying);
  };

  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const audio = audioRef.current;
    if (!audio) return;

    const newTime = parseFloat(e.target.value);
    audio.currentTime = newTime;
    setCurrentTime(newTime);
  };

  const handleVolumeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newVolume = parseFloat(e.target.value);
    setVolume(newVolume);
    if (audioRef.current) {
      audioRef.current.volume = newVolume;
    }
  };

  const handleDownload = () => {
    const link = document.createElement("a");
    link.href = `http://localhost:8000${url}`;
    link.setAttribute("download", `${name}.wav`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

  // Calculate meter position from dB values
  const meterHeight = Math.max(5, Math.min(100, ((rmsDb + 60) / 60) * 100));

  // Get stem configuration
  const stemConfig = getStemConfig(name);
  const StemIcon = stemConfig.icon;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="bg-card border border-border rounded-lg p-4 space-y-3"
    >
      {/* Hidden audio element */}
      <audio ref={audioRef} src={`http://localhost:8000${url}`} preload="metadata" />

      {/* Header with stem name and download */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          {/* VU Meter */}
          <div className="w-2 h-20 bg-background rounded-full overflow-hidden">
            <motion.div
              className="w-full bg-primary rounded-full"
              style={{ height: `${meterHeight}%` }}
              initial={{ height: 0 }}
              animate={{ height: `${meterHeight}%` }}
              transition={{ type: "spring", stiffness: 100, damping: 20 }}
            />
          </div>

          {/* Stem Icon */}
          <div className="w-10 h-10 rounded-lg bg-primary/10 border border-primary/30 flex items-center justify-center">
            <StemIcon className="w-5 h-5 text-primary" />
          </div>

          <div>
            <h3 className="text-sm font-bold uppercase tracking-widest text-foreground flex items-center gap-2">
              {stemConfig.label}
              <span className="text-[10px] text-muted-foreground font-mono tracking-wider">
                {stemConfig.sublabel}
              </span>
            </h3>
            <p className="text-xs text-muted-foreground font-mono">
              {formatTime(duration)} • {rmsDb.toFixed(1)}dB RMS
            </p>
          </div>
        </div>

        <motion.button
          onClick={handleDownload}
          className="p-2 rounded-full bg-background hover:bg-primary/20 border border-border haptic"
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
        >
          <Download className="w-4 h-4 text-primary" />
        </motion.button>
      </div>

      {/* Playback controls */}
      <div className="space-y-2">
        <div className="flex items-center gap-3">
          {/* Play/Pause button */}
          <motion.button
            onClick={togglePlayPause}
            className="w-10 h-10 rounded-full bg-primary/10 hover:bg-primary/20 border border-primary/30 flex items-center justify-center haptic"
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
          >
            {isPlaying ? (
              <Pause className="w-5 h-5 text-primary" />
            ) : (
              <Play className="w-5 h-5 text-primary ml-0.5" />
            )}
          </motion.button>

          {/* Seek bar */}
          <div className="flex-1">
            <input
              type="range"
              min="0"
              max={duration}
              step="0.1"
              value={currentTime}
              onChange={handleSeek}
              className="w-full h-1 bg-background rounded-full appearance-none cursor-pointer 
                [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:h-3 
                [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-primary
                [&::-webkit-slider-thumb]:shadow-[0_0_8px_var(--primary)]
                [&::-moz-range-thumb]:w-3 [&::-moz-range-thumb]:h-3 
                [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:bg-primary
                [&::-moz-range-thumb]:border-0"
            />
            <div className="flex justify-between text-[10px] text-muted-foreground font-mono mt-1">
              <span>{formatTime(currentTime)}</span>
              <span>{formatTime(duration)}</span>
            </div>
          </div>
        </div>

        {/* Volume control */}
        <div className="flex items-center gap-2">
          <Volume2 className="w-3.5 h-3.5 text-muted-foreground" />
          <input
            type="range"
            min="0"
            max="1"
            step="0.01"
            value={volume}
            onChange={handleVolumeChange}
            className="w-24 h-1 bg-background rounded-full appearance-none cursor-pointer
              [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-2.5 [&::-webkit-slider-thumb]:h-2.5 
              [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-primary/70
              [&::-moz-range-thumb]:w-2.5 [&::-moz-range-thumb]:h-2.5 
              [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:bg-primary/70
              [&::-moz-range-thumb]:border-0"
          />
          <span className="text-[10px] text-muted-foreground font-mono w-8">
            {Math.round(volume * 100)}%
          </span>
        </div>
      </div>
    </motion.div>
  );
};

export default StemCard;
