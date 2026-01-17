import { useEffect, useMemo, useState } from "react";

const NOISE_FLOOR = 0.004;
const FFT_SIZE = 2048;

type AudioState = {
  isReady: boolean;
  isRunning: boolean;
  powerOn: boolean;
  rms: number;
  phase: number;
  waveform: Float32Array;
  sampleRate: number;
  baseLatency: number;
  gain: number;
  error?: string;
  startSession: () => Promise<void>;
  togglePower: () => Promise<void>;
  setGain: (value: number) => void;
};

type Listener = (state: AudioState) => void;

type Shared = {
  context?: AudioContext;
  analyser?: AnalyserNode;
  gainNode?: GainNode;
  source?: MediaStreamAudioSourceNode;
  waveform: Float32Array;
  rms: number;
  phase: number;
  gain: number;
  isReady: boolean;
  isRunning: boolean;
  powerOn: boolean;
  baseLatency: number;
  sampleRate: number;
  error?: string;
  rafId?: number;
  listeners: Set<Listener>;
};

const shared: Shared = {
  waveform: new Float32Array(FFT_SIZE),
  rms: 0,
  phase: 0,
  gain: 0.7,
  isReady: false,
  isRunning: false,
  powerOn: false,
  baseLatency: 0,
  sampleRate: 48000,
  listeners: new Set(),
};

function notify() {
  const snapshot = getState();
  shared.listeners.forEach((listener) => listener(snapshot));
}

function getState(): AudioState {
  return {
    isReady: shared.isReady,
    isRunning: shared.isRunning,
    powerOn: shared.powerOn,
    rms: shared.rms,
    phase: shared.phase,
    waveform: shared.waveform,
    sampleRate: shared.sampleRate,
    baseLatency: shared.baseLatency,
    gain: shared.gain,
    error: shared.error,
    startSession,
    togglePower,
    setGain,
  };
}

async function ensureContext() {
  if (!shared.context) {
    const ctx = new AudioContext();
    const analyser = ctx.createAnalyser();
    analyser.fftSize = FFT_SIZE;
    analyser.smoothingTimeConstant = 0.85;
    const gain = ctx.createGain();
    gain.gain.value = shared.gain;

    shared.context = ctx;
    shared.analyser = analyser;
    shared.gainNode = gain;
    shared.baseLatency = ctx.baseLatency ?? 0;
    shared.sampleRate = ctx.sampleRate ?? 48000;
    shared.isReady = true;
    startLoop();
  }
}

async function startSession() {
  try {
    await ensureContext();
    const ctx = shared.context!;
    const analyser = shared.analyser!;
    const gain = shared.gainNode!;

    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const source = ctx.createMediaStreamSource(stream);
    shared.source = source;
    source.connect(gain);
    gain.connect(analyser);
    // we do not connect to destination to avoid feedback
    if (ctx.state === "suspended") {
      await ctx.resume();
    }
    shared.isRunning = true;
    shared.powerOn = true;
    notify();
  } catch (error) {
    shared.error = (error as Error).message;
    notify();
  }
}

async function togglePower() {
  try {
    await ensureContext();
    const ctx = shared.context!;
    if (ctx.state === "running") {
      await ctx.suspend();
      shared.isRunning = false;
      shared.powerOn = false;
    } else {
      await ctx.resume();
      shared.isRunning = true;
      shared.powerOn = true;
    }
    notify();
  } catch (error) {
    shared.error = (error as Error).message;
    notify();
  }
}

function setGain(value: number) {
  shared.gain = value;
  if (shared.gainNode) {
    shared.gainNode.gain.value = value;
  }
  notify();
}

function startLoop() {
  if (shared.rafId) return;

  const buffer = new Float32Array(FFT_SIZE);
  const step = () => {
    if (shared.analyser && shared.context && shared.context.state === "running") {
      shared.analyser.getFloatTimeDomainData(buffer);
      let sum = 0;
      for (let i = 0; i < buffer.length; i += 1) {
        const v = buffer[i];
        sum += v * v;
      }
      const rms = Math.sqrt(sum / buffer.length);
      // phase approximation: average sign changes mapped to -1..1
      let crossings = 0;
      for (let i = 1; i < buffer.length; i += 1) {
        if ((buffer[i - 1] > 0 && buffer[i] < 0) || (buffer[i - 1] < 0 && buffer[i] > 0)) {
          crossings += 1;
        }
      }
      const normCross = crossings / buffer.length;
      const phase = 1 - Math.min(1, normCross * 4);

      shared.waveform.set(buffer);
      shared.rms = rms;
      shared.phase = phase;
    } else {
      // noise floor when suspended
      for (let i = 0; i < buffer.length; i += 1) {
        buffer[i] = (Math.random() - 0.5) * NOISE_FLOOR;
      }
      shared.waveform.set(buffer);
      shared.rms = NOISE_FLOOR;
      shared.phase = 0;
    }

    notify();
    shared.rafId = requestAnimationFrame(step);
  };

  shared.rafId = requestAnimationFrame(step);
}

export function useAudioAnalyzer(): AudioState {
  const [state, setState] = useState<AudioState>(() => getState());

  useEffect(() => {
    const listener: Listener = (next) => setState(next);
    shared.listeners.add(listener);
    return () => {
      shared.listeners.delete(listener);
    };
  }, []);

  return useMemo(() => ({ ...state, startSession, togglePower, setGain }), [state]);
}
