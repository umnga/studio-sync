import React, { useState, useRef, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { 
  Play, 
  Pause, 
  RotateCcw, 
  Volume2, 
  Guitar, 
  Piano,
  BookOpen,
  ChevronLeft,
  ChevronRight
} from "lucide-react";
import PianoKeyboard from "./PianoKeyboard";
import PianoRoll from "./PianoRoll";
import usePianoSynthesizer from "../hooks/usePianoSynthesizer";

type PracticeToolsProps = {
  stems?: {
    name: string;
    url: string;
    duration: number;
  }[];
  guitarChord?: string;
  detectedChords?: string[];
  onChordDetect?: (chord: string) => void;
};

type TempoOption = 0.5 | 0.75 | 1 | 1.25 | 1.5;

// Extended chord-to-notes mapping for real-time piano highlighting
const CHORD_NOTE_MAP: Record<string, string[]> = {
  // Major chords
  "C major": ["C", "E", "G"],
  "C# major": ["C#", "F", "G#"],
  "D major": ["D", "F#", "A"],
  "D# major": ["D#", "G", "A#"],
  "E major": ["E", "G#", "B"],
  "F major": ["F", "A", "C"],
  "F# major": ["F#", "A#", "C#"],
  "G major": ["G", "B", "D"],
  "G# major": ["G#", "C", "D#"],
  "A major": ["A", "C#", "E"],
  "A# major": ["A#", "D", "F"],
  "B major": ["B", "D#", "F#"],
  // Minor chords
  "C minor": ["C", "D#", "G"],
  "D minor": ["D", "F", "A"],
  "E minor": ["E", "G", "B"],
  "F minor": ["F", "G#", "C"],
  "G minor": ["G", "A#", "D"],
  "A minor": ["A", "C", "E"],
  "B minor": ["B", "D", "F#"],
  // 7th chords
  "C7": ["C", "E", "G", "A#"],
  "G7": ["G", "B", "D", "F"],
  "D7": ["D", "F#", "A", "C"],
  "A7": ["A", "C#", "E", "G"],
  "E7": ["E", "G#", "B", "D"],
  // Major 7th
  "Cmaj7": ["C", "E", "G", "B"],
  "Fmaj7": ["F", "A", "C", "E"],
  "Gmaj7": ["G", "B", "D", "F#"],
  // Minor 7th
  "Am7": ["A", "C", "E", "G"],
  "Dm7": ["D", "F", "A", "C"],
  "Em7": ["E", "G", "B", "D"],
};

export const PracticeTools: React.FC<PracticeToolsProps> = ({
  stems = [],
  guitarChord = "C major",
  detectedChords = ["C major", "F major", "G major", "Am7"],
  onChordDetect,
}) => {
  const [isPlaying, setIsPlaying] = useState(false);
  const [isTutorialMode, setIsTutorialMode] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [tempo, setTempo] = useState<TempoOption>(1);
  const [volume, setVolume] = useState(0.7);
  const [complexity, setComplexity] = useState<"beginner" | "advanced">("beginner");
  const [viewMode, setViewMode] = useState<"keyboard" | "guitar">("keyboard");
  const [activeNotes, setActiveNotes] = useState<string[]>([]);
  const [currentChordIdx, setCurrentChordIdx] = useState(0);
  const [chordHighlightActive, setChordHighlightActive] = useState(true);

  const audioRef = useRef<HTMLAudioElement>(null);
  const guitarAudioRef = useRef<HTMLAudioElement>(null);
  const chordProgressionInterval = useRef<NodeJS.Timeout | null>(null);
  const synthesizer = usePianoSynthesizer();

  // Get notes from current chord for piano highlighting
  useEffect(() => {
    const chordToUse = detectedChords[currentChordIdx] || guitarChord;
    const notes = CHORD_NOTE_MAP[chordToUse] || ["C", "E", "G"];

    if (complexity === "beginner") {
      // Show basic triad
      setActiveNotes(notes.slice(0, 3));
    } else {
      // Show full chord with extensions
      setActiveNotes(notes);
    }

    // Notify parent of chord change
    onChordDetect?.(chordToUse);
  }, [guitarChord, complexity, currentChordIdx, detectedChords, onChordDetect]);

  // Auto-advance chords during playback
  useEffect(() => {
    if (isPlaying && detectedChords.length > 1) {
      // Calculate chord duration based on tempo (assume 4 beats per chord at 120 BPM base)
      const beatDuration = (60 / 120) * 1000; // ms per beat at 120 BPM
      const chordDuration = (beatDuration * 4) / tempo; // 4 beats per chord, adjusted for tempo

      chordProgressionInterval.current = setInterval(() => {
        setCurrentChordIdx((prev) => (prev + 1) % detectedChords.length);
      }, chordDuration);

      return () => {
        if (chordProgressionInterval.current) {
          clearInterval(chordProgressionInterval.current);
        }
      };
    }
  }, [isPlaying, detectedChords.length, tempo]);

  // Update current time from audio
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const handleTimeUpdate = () => setCurrentTime(audio.currentTime);
    audio.addEventListener("timeupdate", handleTimeUpdate);

    return () => audio.removeEventListener("timeupdate", handleTimeUpdate);
  }, []);

  const handlePlayPause = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) {
      // No audio loaded - just play synthesizer
      if (!isPlaying && chordHighlightActive) {
        synthesizer.playChord(activeNotes, 0.5, 0.6);
      }
      setIsPlaying(!isPlaying);
      return;
    }

    if (isPlaying) {
      audio.pause();
      guitarAudioRef.current?.pause();
    } else {
      audio.play();
      guitarAudioRef.current?.play();

      // Play synthesized chord guide
      if (chordHighlightActive) {
        synthesizer.playChord(activeNotes, 0.5, 0.6);
      }
    }
    setIsPlaying(!isPlaying);
  }, [isPlaying, activeNotes, chordHighlightActive, synthesizer]);

  const handleReset = () => {
    if (audioRef.current) {
      audioRef.current.currentTime = 0;
      setCurrentTime(0);
    }
    if (guitarAudioRef.current) {
      guitarAudioRef.current.currentTime = 0;
    }
    setCurrentChordIdx(0);
    setIsPlaying(false);
  };

  const handleTempoChange = (newTempo: TempoOption) => {
    setTempo(newTempo);
    if (audioRef.current) {
      audioRef.current.playbackRate = newTempo;
    }
    if (guitarAudioRef.current) {
      guitarAudioRef.current.playbackRate = newTempo;
    }
  };

  const handleVolumeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newVolume = parseFloat(e.target.value);
    setVolume(newVolume);
    if (audioRef.current) {
      audioRef.current.volume = newVolume * 0.5;
    }
    if (guitarAudioRef.current) {
      guitarAudioRef.current.volume = newVolume * 0.5;
    }
  };

  // Tutorial Mix - plays at 75% speed with highlighted chords
  const handleTutorialMix = useCallback(() => {
    setIsTutorialMode(true);
    setTempo(0.75);
    setChordHighlightActive(true);
    
    if (audioRef.current) {
      audioRef.current.playbackRate = 0.75;
      audioRef.current.currentTime = 0;
      audioRef.current.play();
    }
    if (guitarAudioRef.current) {
      guitarAudioRef.current.playbackRate = 0.75;
      guitarAudioRef.current.currentTime = 0;
      guitarAudioRef.current.play();
    }
    
    setCurrentChordIdx(0);
    setIsPlaying(true);
    
    // Play first chord on synthesizer
    synthesizer.playChord(activeNotes, 0.5, 0.6);
  }, [activeNotes, synthesizer]);

  const handlePrevChord = () => {
    setCurrentChordIdx((prev) => (prev - 1 + detectedChords.length) % detectedChords.length);
    if (chordHighlightActive) {
      const prevIdx = (currentChordIdx - 1 + detectedChords.length) % detectedChords.length;
      const chord = detectedChords[prevIdx];
      const notes = CHORD_NOTE_MAP[chord] || ["C", "E", "G"];
      synthesizer.playChord(notes.slice(0, 3), 0.3, 0.5);
    }
  };

  const handleNextChord = () => {
    setCurrentChordIdx((prev) => (prev + 1) % detectedChords.length);
    if (chordHighlightActive) {
      const nextIdx = (currentChordIdx + 1) % detectedChords.length;
      const chord = detectedChords[nextIdx];
      const notes = CHORD_NOTE_MAP[chord] || ["C", "E", "G"];
      synthesizer.playChord(notes.slice(0, 3), 0.3, 0.5);
    }
  };

  const pianoStem = stems.find(
    (s) => s.name.toLowerCase().includes("piano") || s.name.toLowerCase().includes("keyboard")
  );
  const guitarStem = stems.find((s) => s.name.toLowerCase().includes("guitar"));

  return (
    <div className="w-full h-full space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <p className="tech-label mb-2">PRACTICE STUDIO</p>
          <h2 className="text-2xl font-bold text-foreground">Keyboard Tutorial</h2>
        </div>
        
        {/* Tutorial Mix Button */}
        <motion.button
          onClick={handleTutorialMix}
          className={`px-4 py-2 rounded-lg font-mono text-sm uppercase tracking-widest flex items-center gap-2 transition-all ${
            isTutorialMode
              ? "bg-primary text-black"
              : "bg-primary/10 border border-primary/40 text-primary hover:bg-primary/20"
          }`}
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
        >
          <BookOpen className="w-4 h-4" />
          TUTORIAL MIX // 0.75x
        </motion.button>
      </div>

      {/* Controls Card */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-card border border-border rounded-lg p-6 space-y-6"
      >
        {/* Chord Display with Navigation */}
        <div className="flex items-center justify-between p-4 bg-background/50 rounded-lg border border-primary/20">
          <div className="flex items-center gap-4">
            {/* Chord Navigation */}
            <motion.button
              onClick={handlePrevChord}
              className="w-8 h-8 rounded-full bg-background border border-primary/30 flex items-center justify-center hover:bg-primary/10"
              whileHover={{ scale: 1.1 }}
              whileTap={{ scale: 0.9 }}
            >
              <ChevronLeft className="w-4 h-4 text-primary" />
            </motion.button>

            <div className="text-center min-w-[140px]">
              <p className="text-xs uppercase tracking-widest text-muted-foreground mb-1">
                DETECTED CHORD
              </p>
              <p className="text-2xl font-bold text-primary font-mono">
                {detectedChords[currentChordIdx] || guitarChord}
              </p>
              {detectedChords.length > 1 && (
                <p className="text-xs text-muted-foreground mt-1 font-mono">
                  {currentChordIdx + 1} // {detectedChords.length}
                </p>
              )}
            </div>

            <motion.button
              onClick={handleNextChord}
              className="w-8 h-8 rounded-full bg-background border border-primary/30 flex items-center justify-center hover:bg-primary/10"
              whileHover={{ scale: 1.1 }}
              whileTap={{ scale: 0.9 }}
            >
              <ChevronRight className="w-4 h-4 text-primary" />
            </motion.button>
          </div>

          <div className="flex gap-2">
            {["beginner", "advanced"].map((level) => (
              <motion.button
                key={level}
                onClick={() => setComplexity(level as "beginner" | "advanced")}
                className={`px-4 py-2 rounded-lg font-mono text-xs uppercase tracking-widest transition-all ${
                  complexity === level
                    ? "bg-primary text-black"
                    : "bg-background border border-primary/30 text-primary hover:bg-primary/10"
                }`}
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
              >
                {level}
              </motion.button>
            ))}
          </div>
        </div>

        {/* Playback Controls */}
        <div className="flex items-center gap-4">
          <motion.button
            onClick={handlePlayPause}
            className="w-12 h-12 rounded-full bg-primary/20 border border-primary/40 flex items-center justify-center haptic hover:bg-primary/30"
            whileHover={{ scale: 1.1 }}
            whileTap={{ scale: 0.9 }}
          >
            {isPlaying ? (
              <Pause className="w-6 h-6 text-primary" />
            ) : (
              <Play className="w-6 h-6 text-primary ml-1" />
            )}
          </motion.button>

          <motion.button
            onClick={handleReset}
            className="w-12 h-12 rounded-full bg-background border border-primary/30 flex items-center justify-center haptic hover:bg-primary/10"
            whileHover={{ scale: 1.1 }}
            whileTap={{ scale: 0.9 }}
          >
            <RotateCcw className="w-5 h-5 text-primary" />
          </motion.button>

          {/* Tempo Controls */}
          <div className="flex gap-2">
            {([0.5, 0.75, 1, 1.25, 1.5] as TempoOption[]).map((t) => (
              <motion.button
                key={t}
                onClick={() => handleTempoChange(t)}
                className={`px-3 py-1.5 rounded-lg font-mono text-xs uppercase transition-all ${
                  tempo === t
                    ? "bg-primary text-black"
                    : "bg-background border border-primary/30 text-primary hover:bg-primary/10"
                }`}
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
              >
                {t}x
              </motion.button>
            ))}
          </div>

          {/* Volume Control */}
          <div className="flex items-center gap-2 ml-auto">
            <Volume2 className="w-4 h-4 text-muted-foreground" />
            <input
              type="range"
              min="0"
              max="1"
              step="0.01"
              value={volume}
              onChange={handleVolumeChange}
              className="w-24 h-1 bg-background rounded-full appearance-none cursor-pointer
                [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:h-3 
                [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-primary
                [&::-moz-range-thumb]:w-3 [&::-moz-range-thumb]:h-3 
                [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:bg-primary
                [&::-moz-range-thumb]:border-0"
            />
            <span className="text-xs font-mono text-muted-foreground w-8">
              {Math.round(volume * 100)}%
            </span>
          </div>
        </div>

        {/* View Mode Toggle */}
        <div className="flex gap-2 border-t border-border pt-4">
          {(["keyboard", "guitar"] as const).map((mode) => (
            <motion.button
              key={mode}
              onClick={() => setViewMode(mode)}
              className={`flex-1 py-2 rounded-lg font-mono text-sm uppercase tracking-widest transition-all flex items-center justify-center gap-2 ${
                viewMode === mode
                  ? "bg-primary text-black"
                  : "bg-background border border-primary/30 text-primary hover:bg-primary/10"
              }`}
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
            >
              {mode === "keyboard" ? (
                <Piano className="w-4 h-4" />
              ) : (
                <Guitar className="w-4 h-4" />
              )}
              {mode === "keyboard" ? "PIANO // KEYS" : "GUITAR // FRETS"}
            </motion.button>
          ))}
        </div>
      </motion.div>

      {/* Audio Elements */}
      {pianoStem && (
        <audio ref={audioRef} src={`http://localhost:8000${pianoStem.url}`} />
      )}
      {guitarStem && (
        <audio ref={guitarAudioRef} src={`http://localhost:8000${guitarStem.url}`} />
      )}

      {/* Main Content */}
      <AnimatePresence mode="wait">
        {viewMode === "keyboard" ? (
          <motion.div
            key="keyboard"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="space-y-6"
          >
            <PianoKeyboard 
              activeNotes={activeNotes} 
              complexity={complexity}
              onKeyClick={(note) => synthesizer.playNote(note, 0.3, 0.7)}
            />
            {pianoStem && (
              <PianoRoll
                notes={activeNotes.map((note, idx) => ({
                  name: note,
                  startTime: currentTime + idx * 0.5,
                  duration: 1,
                  velocity: 0.8,
                }))}
                currentTime={currentTime}
                totalDuration={pianoStem.duration}
                tempo={tempo}
              />
            )}
          </motion.div>
        ) : (
          <motion.div
            key="guitar"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="bg-card border border-border rounded-lg p-6 space-y-4"
          >
            <div className="flex items-center gap-2 mb-4">
              <Guitar className="w-5 h-5 text-primary" />
              <p className="text-lg font-bold text-primary uppercase tracking-widest">
                GUITAR // PERFORMANCE
              </p>
            </div>

            {/* Chord Progression Viewer */}
            <div className="space-y-3">
              <p className="text-xs uppercase tracking-widest text-muted-foreground">
                CHORD PROGRESSION
              </p>
              <div className="flex flex-wrap gap-2">
                {detectedChords.map((chord, idx) => (
                  <motion.button
                    key={idx}
                    onClick={() => {
                      setCurrentChordIdx(idx);
                      const notes = CHORD_NOTE_MAP[chord] || ["C", "E", "G"];
                      synthesizer.playChord(notes.slice(0, 3), 0.3, 0.5);
                    }}
                    className={`px-4 py-2 rounded-lg font-mono text-sm uppercase transition-all ${
                      currentChordIdx === idx
                        ? "bg-primary text-black"
                        : "bg-background border border-primary/30 text-primary hover:bg-primary/10"
                    }`}
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                  >
                    {chord}
                  </motion.button>
                ))}
              </div>
            </div>

            {/* Current Chord Display */}
            <div className="bg-background/50 rounded-lg p-8 border border-primary/20 text-center">
              <p className="text-5xl font-black text-primary font-mono">
                {detectedChords[currentChordIdx] || guitarChord}
              </p>
              <p className="text-xs text-muted-foreground mt-3 uppercase tracking-widest">
                CURRENT CHORD // {activeNotes.join(" - ")}
              </p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Tips */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.3 }}
        className="bg-primary/5 border border-primary/20 rounded-lg p-4 text-sm text-muted-foreground"
      >
        <p className="font-bold text-primary mb-2 uppercase tracking-widest text-xs">
          PRACTICE TIP // LEARNING MODE
        </p>
        <ul className="list-none space-y-1 text-xs font-mono">
          <li className="flex items-center gap-2">
            <span className="text-primary">&#9655;</span>
            Use TUTORIAL MIX for 0.75x speed with chord highlighting
          </li>
          <li className="flex items-center gap-2">
            <span className="text-primary">&#9655;</span>
            BEGINNER mode shows root, 3rd, and 5th only
          </li>
          <li className="flex items-center gap-2">
            <span className="text-primary">&#9655;</span>
            Click piano keys to hear individual notes
          </li>
          <li className="flex items-center gap-2">
            <span className="text-primary">&#9655;</span>
            Use chord navigation arrows to step through progression
          </li>
        </ul>
      </motion.div>
    </div>
  );
};

export default PracticeTools;
