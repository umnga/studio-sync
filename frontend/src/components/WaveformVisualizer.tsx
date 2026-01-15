import { motion } from "framer-motion";

interface WaveformVisualizerProps {
  isActive?: boolean;
  barCount?: number;
  className?: string;
}

export const WaveformVisualizer = ({ isActive = false, barCount = 32, className = "" }: WaveformVisualizerProps) => {
  return (
    <div className={`flex items-end justify-center gap-0.5 h-16 ${className}`}>
      {Array.from({ length: barCount }).map((_, i) => (
        <motion.div
          key={i}
          className="w-1 bg-gradient-to-t from-primary to-secondary rounded-full"
          animate={isActive ? {
            height: [
              `${20 + Math.random() * 30}%`,
              `${50 + Math.random() * 50}%`,
              `${20 + Math.random() * 30}%`,
            ],
          } : { height: "20%" }}
          transition={{
            duration: 0.5 + Math.random() * 0.5,
            repeat: isActive ? Infinity : 0,
            ease: "easeInOut",
            delay: i * 0.02,
          }}
          style={{ minHeight: "8px" }}
        />
      ))}
    </div>
  );
};
