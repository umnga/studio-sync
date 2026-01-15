import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Mic, MicOff, Check, AlertTriangle, Settings, HelpCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

export const BuzzDetector = () => {
  const [isListening, setIsListening] = useState(false);
  const [buzzDetected, setBuzzDetected] = useState(false);
  const [sensitivity, setSensitivity] = useState([50]);
  const [inputDevice, setInputDevice] = useState("default");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [frequencyData, setFrequencyData] = useState<number[]>(Array(16).fill(0));

  const startBuzzDetector = () => {
    setIsListening(true);
  };

  const stopBuzzDetector = () => {
    setIsListening(false);
    setBuzzDetected(false);
  };

  // Simulate frequency data when listening
  useEffect(() => {
    if (!isListening) {
      setFrequencyData(Array(16).fill(0));
      return;
    }

    const interval = setInterval(() => {
      const newData = Array(16).fill(0).map(() => Math.random() * 100);
      setFrequencyData(newData);
      
      // Randomly simulate buzz detection
      if (Math.random() > 0.9) {
        setBuzzDetected(true);
        setTimeout(() => setBuzzDetected(false), 1000);
      }
    }, 100);

    return () => clearInterval(interval);
  }, [isListening]);

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-6"
    >
      {/* Main Visualization */}
      <div className="glass-card rounded-2xl p-8 text-center">
        {/* Circular Visualization */}
        <div className="relative w-48 h-48 mx-auto mb-8">
          {/* Outer rings */}
          {[1, 2, 3].map((ring) => (
            <motion.div
              key={ring}
              className={`absolute inset-0 rounded-full border-2 ${
                buzzDetected ? "border-destructive" : "border-primary/30"
              }`}
              style={{
                transform: `scale(${1 + ring * 0.15})`,
              }}
              animate={isListening ? {
                opacity: [0.3, 0.6, 0.3],
                scale: [1 + ring * 0.15, 1 + ring * 0.18, 1 + ring * 0.15],
              } : { opacity: 0.2 }}
              transition={{
                duration: 1.5,
                repeat: Infinity,
                delay: ring * 0.2,
              }}
            />
          ))}

          {/* Center circle */}
          <motion.div
            animate={{
              boxShadow: isListening
                ? buzzDetected
                  ? "0 0 60px hsl(0 84% 60% / 0.5)"
                  : "0 0 40px hsl(263 70% 66% / 0.5)"
                : "0 0 0px transparent",
            }}
            className={`absolute inset-0 rounded-full flex items-center justify-center ${
              buzzDetected 
                ? "bg-gradient-to-br from-destructive/20 to-destructive/10" 
                : "bg-gradient-to-br from-primary/20 to-secondary/20"
            }`}
          >
            <motion.div
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
            >
              {isListening ? (
                <Mic className={`h-12 w-12 ${buzzDetected ? "text-destructive" : "text-primary"}`} />
              ) : (
                <MicOff className="h-12 w-12 text-muted-foreground" />
              )}
            </motion.div>
          </motion.div>
        </div>

        {/* Status Indicator */}
        <AnimatePresence mode="wait">
          <motion.div
            key={buzzDetected ? "buzz" : "clean"}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="flex items-center justify-center gap-2 mb-6"
          >
            {isListening ? (
              buzzDetected ? (
                <>
                  <div className="w-3 h-3 rounded-full bg-destructive animate-pulse" />
                  <span className="text-destructive font-medium">Buzz/Mute Detected!</span>
                </>
              ) : (
                <>
                  <div className="w-3 h-3 rounded-full bg-success" />
                  <span className="text-success font-medium flex items-center gap-1">
                    Clean <Check className="h-4 w-4" />
                  </span>
                </>
              )
            ) : (
              <span className="text-muted-foreground">Detector inactive</span>
            )}
          </motion.div>
        </AnimatePresence>

        {/* Start/Stop Button */}
        <Button
          size="lg"
          onClick={isListening ? stopBuzzDetector : startBuzzDetector}
          className={`px-8 ${
            isListening
              ? "bg-destructive hover:bg-destructive/90"
              : "bg-gradient-to-r from-primary to-secondary hover:opacity-90"
          }`}
        >
          {isListening ? (
            <>
              <MicOff className="mr-2 h-5 w-5" />
              Stop Listening
            </>
          ) : (
            <>
              <Mic className="mr-2 h-5 w-5" />
              Start Listening
            </>
          )}
        </Button>
      </div>

      {/* Feedback Panel */}
      <div className="glass-card rounded-2xl p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-semibold">Frequency Spectrum</h3>
          <Tooltip>
            <TooltipTrigger>
              <HelpCircle className="h-4 w-4 text-muted-foreground" />
            </TooltipTrigger>
            <TooltipContent>
              <p>Visual representation of audio frequencies</p>
            </TooltipContent>
          </Tooltip>
        </div>

        {/* Frequency Bars */}
        <div className="flex items-end justify-between h-24 gap-1 mb-6">
          {frequencyData.map((value, index) => (
            <motion.div
              key={index}
              className="flex-1 bg-gradient-to-t from-primary to-secondary rounded-t"
              animate={{ height: `${Math.max(value, 5)}%` }}
              transition={{ duration: 0.1 }}
            />
          ))}
        </div>

        {/* Text Feedback */}
        <div className="grid md:grid-cols-2 gap-4">
          <div className="p-4 rounded-lg bg-muted/30">
            <p className="text-sm text-muted-foreground mb-1">String Clarity</p>
            <p className={`font-semibold ${isListening && !buzzDetected ? "text-success" : "text-muted-foreground"}`}>
              {isListening ? (buzzDetected ? "Poor" : "Good") : "—"}
            </p>
          </div>
          <div className="p-4 rounded-lg bg-muted/30">
            <p className="text-sm text-muted-foreground mb-1">Detected Issues</p>
            <div className="flex items-center gap-2">
              {isListening && buzzDetected ? (
                <span className="flex items-center gap-1 text-destructive text-sm">
                  <AlertTriangle className="h-4 w-4" />
                  String buzz on 3rd fret
                </span>
              ) : (
                <p className="font-semibold text-muted-foreground">
                  {isListening ? "None" : "—"}
                </p>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Settings Panel */}
      <Collapsible open={settingsOpen} onOpenChange={setSettingsOpen}>
        <CollapsibleTrigger asChild>
          <Button variant="ghost" className="w-full justify-between">
            <div className="flex items-center gap-2">
              <Settings className="h-4 w-4" />
              <span>Settings</span>
            </div>
            <motion.div animate={{ rotate: settingsOpen ? 180 : 0 }}>
              <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </motion.div>
          </Button>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <div className="glass-card rounded-xl p-6 mt-2 space-y-6">
            <div>
              <div className="flex items-center justify-between mb-3">
                <label className="text-sm font-medium">Sensitivity</label>
                <span className="text-sm text-muted-foreground">
                  {sensitivity[0] < 33 ? "Low" : sensitivity[0] < 66 ? "Medium" : "High"}
                </span>
              </div>
              <Slider
                value={sensitivity}
                onValueChange={setSensitivity}
                max={100}
                step={1}
              />
            </div>

            <div>
              <label className="text-sm font-medium mb-3 block">Input Device</label>
              <Select value={inputDevice} onValueChange={setInputDevice}>
                <SelectTrigger>
                  <SelectValue placeholder="Select device" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="default">Default Microphone</SelectItem>
                  <SelectItem value="external">External Audio Interface</SelectItem>
                  <SelectItem value="usb">USB Microphone</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CollapsibleContent>
      </Collapsible>
    </motion.div>
  );
};
