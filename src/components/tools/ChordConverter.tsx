import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { Mic, MicOff, Play, Download, Volume2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { useToast } from "@/hooks/use-toast";

const PIANO_KEYS = [
  { note: "C", type: "white" },
  { note: "C#", type: "black" },
  { note: "D", type: "white" },
  { note: "D#", type: "black" },
  { note: "E", type: "white" },
  { note: "F", type: "white" },
  { note: "F#", type: "black" },
  { note: "G", type: "white" },
  { note: "G#", type: "black" },
  { note: "A", type: "white" },
  { note: "A#", type: "black" },
  { note: "B", type: "white" },
  { note: "C2", type: "white" },
  { note: "C#2", type: "black" },
  { note: "D2", type: "white" },
  { note: "D#2", type: "black" },
  { note: "E2", type: "white" },
];

const CHORD_NOTES: Record<string, string[]> = {
  "C Major": ["C", "E", "G"],
  "G Major": ["G", "B", "D2"],
  "A Minor": ["A", "C2", "E2"],
  "D Major": ["D", "F#", "A"],
  "E Minor": ["E", "G", "B"],
};

const DETECTED_CHORDS = ["C Major", "G Major", "A Minor", "E Minor", "D Major"];

export const ChordConverter = () => {
  const [isRecording, setIsRecording] = useState(false);
  const [detectedChord, setDetectedChord] = useState<string | null>(null);
  const [pattern, setPattern] = useState("block");
  const [audioLevel, setAudioLevel] = useState(0);
  const [timeline, setTimeline] = useState<{ chord: string; time: number }[]>([]);
  const { toast } = useToast();

  const startChordRecording = () => {
    setIsRecording(true);
    setTimeline([]);
  };

  const stopChordRecording = () => {
    setIsRecording(false);
  };

  const playPattern = () => {
    toast({
      title: "Playing pattern",
      description: `Playing ${detectedChord} as ${pattern}`,
    });
  };

  const downloadMIDI = () => {
    toast({
      title: "Downloading MIDI",
      description: "Your MIDI file is being prepared...",
    });
  };

  // Simulate chord detection when recording
  useEffect(() => {
    if (!isRecording) {
      setAudioLevel(0);
      return;
    }

    const levelInterval = setInterval(() => {
      setAudioLevel(Math.random() * 100);
    }, 50);

    const chordInterval = setInterval(() => {
      const randomChord = DETECTED_CHORDS[Math.floor(Math.random() * DETECTED_CHORDS.length)];
      setDetectedChord(randomChord);
      setTimeline((prev) => [
        ...prev,
        { chord: randomChord, time: Date.now() },
      ].slice(-10));
    }, 2000);

    return () => {
      clearInterval(levelInterval);
      clearInterval(chordInterval);
    };
  }, [isRecording]);

  const activeNotes = detectedChord ? CHORD_NOTES[detectedChord] || [] : [];

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-6"
    >
      <div className="grid lg:grid-cols-2 gap-6">
        {/* Left Column - Guitar Input */}
        <div className="glass-card rounded-2xl p-6">
          <h3 className="font-semibold mb-6 flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-primary" />
            Your Guitar
          </h3>

          {/* Recording Button */}
          <div className="text-center mb-6">
            <Button
              size="lg"
              onClick={isRecording ? stopChordRecording : startChordRecording}
              className={`px-8 ${
                isRecording
                  ? "bg-destructive hover:bg-destructive/90"
                  : "bg-gradient-to-r from-primary to-secondary hover:opacity-90"
              }`}
            >
              {isRecording ? (
                <>
                  <MicOff className="mr-2 h-5 w-5" />
                  Stop Recording
                </>
              ) : (
                <>
                  <Mic className="mr-2 h-5 w-5" />
                  Start Recording
                </>
              )}
            </Button>
          </div>

          {/* Audio Level Meter */}
          <div className="mb-6">
            <div className="flex items-center gap-2 mb-2">
              <Volume2 className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm text-muted-foreground">Input Level</span>
            </div>
            <div className="h-3 bg-muted rounded-full overflow-hidden">
              <motion.div
                className="h-full bg-gradient-to-r from-success via-primary to-destructive"
                animate={{ width: `${audioLevel}%` }}
                transition={{ duration: 0.05 }}
              />
            </div>
          </div>

          {/* Detected Chord */}
          <div className="text-center p-6 rounded-xl bg-muted/30">
            <p className="text-sm text-muted-foreground mb-2">Detected Chord</p>
            <motion.p
              key={detectedChord}
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              className="text-4xl font-bold gradient-text"
            >
              {detectedChord || "—"}
            </motion.p>
          </div>

          {/* Strum Pattern Visualization */}
          <div className="mt-6">
            <p className="text-sm text-muted-foreground mb-3">Strum Pattern</p>
            <div className="flex items-end justify-center gap-1 h-16">
              {Array(8).fill(0).map((_, i) => (
                <motion.div
                  key={i}
                  className="w-4 bg-gradient-to-t from-primary/50 to-primary rounded-t"
                  animate={{
                    height: isRecording
                      ? `${30 + Math.random() * 70}%`
                      : "20%",
                  }}
                  transition={{ duration: 0.2, delay: i * 0.05 }}
                />
              ))}
            </div>
          </div>
        </div>

        {/* Right Column - Keyboard Output */}
        <div className="glass-card rounded-2xl p-6">
          <h3 className="font-semibold mb-6 flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-secondary" />
            Keyboard Output
          </h3>

          {/* Virtual Piano */}
          <div className="relative h-32 mb-6 overflow-hidden rounded-lg">
            <div className="flex h-full">
              {PIANO_KEYS.filter(k => k.type === "white").map((key) => (
                <motion.div
                  key={key.note}
                  className={`relative flex-1 border-r border-border/30 rounded-b flex items-end justify-center pb-2 ${
                    activeNotes.includes(key.note)
                      ? "bg-gradient-to-b from-primary/80 to-primary text-white"
                      : "bg-card hover:bg-muted/50"
                  }`}
                  animate={{
                    scale: activeNotes.includes(key.note) ? 0.98 : 1,
                  }}
                >
                  <span className="text-xs font-mono">{key.note.replace("2", "")}</span>
                </motion.div>
              ))}
            </div>
            {/* Black keys */}
            <div className="absolute top-0 left-0 right-0 h-[60%] flex pointer-events-none">
              {PIANO_KEYS.map((key, index) => {
                if (key.type !== "black") return null;
                const whiteIndex = PIANO_KEYS.slice(0, index).filter(k => k.type === "white").length;
                const leftPercent = ((whiteIndex + 0.6) / PIANO_KEYS.filter(k => k.type === "white").length) * 100;
                return (
                  <motion.div
                    key={key.note}
                    className={`absolute w-[6%] h-full rounded-b pointer-events-auto ${
                      activeNotes.includes(key.note)
                        ? "bg-gradient-to-b from-primary to-primary/80"
                        : "bg-foreground hover:bg-foreground/80"
                    }`}
                    style={{ left: `${leftPercent}%`, transform: "translateX(-50%)" }}
                    animate={{
                      scale: activeNotes.includes(key.note) ? 0.95 : 1,
                    }}
                  />
                );
              })}
            </div>
          </div>

          {/* Pattern Selector */}
          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium mb-2 block">Pattern Style</label>
              <Select value={pattern} onValueChange={setPattern}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="block">Block Chord</SelectItem>
                  <SelectItem value="broken">Broken Chord</SelectItem>
                  <SelectItem value="arpeggio-up">Arpeggio Up</SelectItem>
                  <SelectItem value="arpeggio-down">Arpeggio Down</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="flex gap-3">
              <Button
                onClick={playPattern}
                disabled={!detectedChord}
                className="flex-1 bg-gradient-to-r from-primary to-secondary hover:opacity-90"
              >
                <Play className="mr-2 h-4 w-4" />
                Play Pattern
              </Button>
              <Button
                onClick={downloadMIDI}
                disabled={timeline.length === 0}
                variant="outline"
                className="border-border"
              >
                <Download className="mr-2 h-4 w-4" />
                MIDI
              </Button>
            </div>
          </div>
        </div>
      </div>

      {/* Timeline */}
      <div className="glass-card rounded-2xl p-6">
        <h3 className="font-semibold mb-4">Chord Timeline</h3>
        <div className="flex items-center gap-2 overflow-x-auto pb-2">
          {timeline.length > 0 ? (
            timeline.map((item, index) => (
              <motion.div
                key={item.time}
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                className="flex-shrink-0 px-4 py-2 rounded-lg bg-primary/10 border border-primary/30"
              >
                <span className="text-sm font-medium text-primary">{item.chord}</span>
              </motion.div>
            ))
          ) : (
            <p className="text-muted-foreground text-sm">
              Start recording to see detected chords here
            </p>
          )}
        </div>
      </div>
    </motion.div>
  );
};
