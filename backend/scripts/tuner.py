"""
Tuner Script
Detects frequency and tuning deviation for instruments
"""

import os
import sys
from contextlib import contextmanager
import numpy as np
import librosa
from typing import Dict, Tuple


@contextmanager
def suppress_c_stderr():
    """Context manager to suppress stderr from C libraries like libmpg123"""
    stderr_fd = sys.stderr.fileno()
    saved_stderr = os.dup(stderr_fd)
    try:
        devnull = os.open(os.devnull, os.O_WRONLY)
        os.dup2(devnull, stderr_fd)
        os.close(devnull)
        yield
    finally:
        os.dup2(saved_stderr, stderr_fd)
        os.close(saved_stderr)


# Standard note frequencies (A4 = 440 Hz)
NOTE_FREQUENCIES = {
    'C': 16.35, 'C#': 17.32, 'D': 18.35, 'D#': 19.45, 'E': 20.60, 'F': 21.83,
    'F#': 23.12, 'G': 24.50, 'G#': 25.96, 'A': 27.50, 'A#': 29.14, 'B': 30.87
}

# Cents in a semitone
CENTS_PER_SEMITONE = 100


def note_to_frequency(note: str) -> float:
    """Convert note name to frequency (e.g., 'A4' -> 440 Hz)"""
    if len(note) < 2:
        return 0
    
    note_name = note[:-1].upper()
    octave = int(note[-1])
    
    if note_name not in NOTE_FREQUENCIES:
        return 0
    
    base_freq = NOTE_FREQUENCIES[note_name]
    # Each octave doubles the frequency
    return base_freq * (2 ** octave)


def frequency_to_note(freq: float) -> Tuple[str, float]:
    """Convert frequency to nearest note and deviation in cents"""
    if freq <= 0:
        return "?", 0
    
    # A4 = 440 Hz
    a4_freq = 440.0
    
    # Calculate semitones from A4
    semitones = 12 * np.log2(freq / a4_freq)
    
    # Get nearest note
    semitone_offset = round(semitones)
    nearest_note_semitone = semitone_offset
    
    # Calculate cents deviation
    cents = (semitones - semitone_offset) * CENTS_PER_SEMITONE
    
    # Map semitone offset to note
    notes = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']
    note_index = (9 + nearest_note_semitone) % 12  # A is index 9
    octave = 4 + (9 + nearest_note_semitone) // 12
    
    note_name = f"{notes[note_index]}{octave}"
    
    return note_name, cents


def detect_frequency(audio_path: str, sr: int = 22050) -> Dict:
    """
    Detect the fundamental frequency of input audio
    
    Args:
        audio_path: Path to audio file
        sr: Sample rate (default 22050 Hz)
        
    Returns:
        Dictionary with frequency detection results including:
        - frequency: Detected fundamental frequency in Hz
        - note: Nearest musical note
        - confidence: Confidence of detection (0-1)
    """
    try:
        # Load audio file (suppress libmpg123 warnings)
        with suppress_c_stderr():
            y, sr = librosa.load(audio_path, sr=sr)
        
        # Use piptrack to detect pitch
        f0 = librosa.yin(y, fmin=50, fmax=2000, sr=sr)
        
        # Get the most stable frequency (median of detected frequencies)
        valid_f0 = f0[f0 > 0]
        if len(valid_f0) == 0:
            return {
                "frequency": 0,
                "note": "?",
                "confidence": 0,
                "error": "No frequency detected"
            }
        
        detected_freq = np.median(valid_f0)
        note_name, cents = frequency_to_note(detected_freq)
        
        # Calculate confidence based on variance
        variance = np.var(valid_f0)
        confidence = min(1.0, 1.0 / (1.0 + variance / detected_freq ** 2))
        
        return {
            "frequency": float(detected_freq),
            "note": note_name,
            "cents": float(cents),
            "confidence": float(confidence),
            "details": {
                "sample_rate": sr,
                "duration": len(y) / sr
            }
        }
    except Exception as e:
        return {
            "frequency": 0,
            "note": "?",
            "confidence": 0,
            "error": str(e)
        }


def get_tuning_deviation(detected_freq: float, target_note: str) -> Dict:
    """
    Calculate tuning deviation from target note
    
    Args:
        detected_freq: The detected frequency in Hz
        target_note: The target note (e.g., 'A4')
        
    Returns:
        Dictionary with tuning deviation info
    """
    try:
        target_freq = note_to_frequency(target_note)
        
        if target_freq <= 0 or detected_freq <= 0:
            return {"error": "Invalid frequency or note"}
        
        # Calculate cents deviation
        cents = CENTS_PER_SEMITONE * np.log2(detected_freq / target_freq)
        
        # Determine if sharp, flat, or in tune
        if abs(cents) < 5:
            status = "in_tune"
        elif cents > 0:
            status = "sharp"
        else:
            status = "flat"
        
        return {
            "detected_frequency": float(detected_freq),
            "target_note": target_note,
            "target_frequency": float(target_freq),
            "deviation_cents": float(cents),
            "status": status,
            "is_in_tune": abs(cents) < 5  # Within 5 cents is considered in tune
        }
    except Exception as e:
        return {"error": str(e)}


if __name__ == "__main__":
    import sys
    if len(sys.argv) > 1:
        audio_file = sys.argv[1]
        result = detect_frequency(audio_file)
        print(result)
