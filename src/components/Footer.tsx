import { Github, Heart, Music2 } from "lucide-react";
import { motion } from "framer-motion";

export const Footer = () => {
  return (
    <footer className="border-t border-border/30 bg-card/30 backdrop-blur-sm">
      <div className="container mx-auto px-4 py-8">
        <div className="flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2 text-muted-foreground">
            <Music2 className="h-4 w-4 text-primary" />
            <span className="text-sm">
              Built with <Heart className="inline h-3 w-3 text-destructive mx-1" /> for guitarists and pianists
            </span>
          </div>
          
          <motion.a
            href="https://github.com"
            target="_blank"
            rel="noopener noreferrer"
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            <Github className="h-4 w-4" />
            <span>View on GitHub</span>
          </motion.a>
        </div>
      </div>
    </footer>
  );
};
