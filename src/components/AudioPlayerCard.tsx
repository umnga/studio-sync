import { useState } from "react";
import { motion } from "framer-motion";
import { Play, Pause, Download, Volume2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { WaveformVisualizer } from "./WaveformVisualizer";

interface AudioPlayerCardProps {
  title: string;
  color: string;
  delay?: number;
}

export const AudioPlayerCard = ({ title, color, delay = 0 }: AudioPlayerCardProps) => {
  const [isPlaying, setIsPlaying] = useState(false);
  const [volume, setVolume] = useState([75]);

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ delay, duration: 0.3 }}
      className="glass-card glass-hover rounded-xl p-4"
    >
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <div 
            className="w-3 h-3 rounded-full" 
            style={{ backgroundColor: color }}
          />
          <h4 className="font-medium text-foreground">{title}</h4>
        </div>
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 text-muted-foreground hover:text-foreground"
        >
          <Download className="h-4 w-4" />
        </Button>
      </div>

      <WaveformVisualizer isActive={isPlaying} barCount={24} className="mb-4" />

      <div className="flex items-center gap-3">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => setIsPlaying(!isPlaying)}
          className="h-10 w-10 rounded-full bg-primary/10 hover:bg-primary/20 text-primary"
        >
          {isPlaying ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4 ml-0.5" />}
        </Button>

        <div className="flex-1 flex items-center gap-2">
          <Volume2 className="h-4 w-4 text-muted-foreground" />
          <Slider
            value={volume}
            onValueChange={setVolume}
            max={100}
            step={1}
            className="flex-1"
          />
        </div>
      </div>
    </motion.div>
  );
};
