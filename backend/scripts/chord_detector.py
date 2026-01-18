"""
Chord Detection Module
Analyzes audio stems to detect chords using pitch detection
"""

from typing import Dict, List, Optional, Tuple
import numpy as np
import librosa
from pathlib import Path

# Chromatic scale for pitch detection
CHROMATIC_SCALE = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']

# Common chord patterns (semitone intervals from root)
CHORD_PATTERNS = {
    'maj': [0, 4, 7],
    'min': [0, 3, 7],
    'maj7': [0, 4, 7, 11],
    'min7': [0, 3, 7, 10],
    '7': [0, 4, 7, 10],
    'dim': [0, 3, 6],
    'aug': [0, 4, 8],
    'sus2': [0, 2, 7],
    'sus4': [0, 5, 7],
}

# A440 reference
A4_FREQ = 440.0


def hz_to_semitone(freq: float, ref_freq: float = A4_FREQ) -> float:
    """
    Convert frequency to semitones relative to A4 (69)
    
    Args:
        freq: Frequency in Hz
        ref_freq: Reference frequency (default: A4 = 440 Hz)
        
    Returns:
        MIDI note number (69 = A4)
    """
    if freq <= 0:
        return 0
    return 69 + 12 * np.log2(freq / ref_freq)


def semitone_to_note_name(semitone: float) -> str:
    """
    Convert MIDI note number to note name
    
    Args:
        semitone: MIDI note number
        
    Returns:
        Note name (e.g., 'C4', 'C#5')
    """
    semitone = int(round(semitone))
    octave = (semitone // 12) - 1
    note_idx = semitone % 12
    return f"{CHROMATIC_SCALE[note_idx]}{octave}"


def detect_predominant_frequency(y: np.ndarray, sr: int, fmin: float = 50, fmax: float = 400) -> Optional[float]:
    """
    Detect the predominant frequency in audio using spectral centroid
    
    Args:
        y: Audio time series
        sr: Sample rate
        fmin: Minimum frequency to consider (Hz)
        fmax: Maximum frequency to consider (Hz)
        
    Returns:
        Predominant frequency or None if detection failed
    """
    if len(y) < sr:  # Need at least 1 second of audio
        return None
    
    try:
        # Compute STFT
        S = librosa.stft(y)
        magnitude = np.abs(S)
        
        # Compute spectral centroid for each frame
        freqs = librosa.fft_frequencies(sr=sr)
        spec_centroid = librosa.feature.spectral_centroid(S=magnitude, sr=sr)[0]
        
        # Get average centroid, filtered by frequency range
        mask = (freqs >= fmin) & (freqs <= fmax)
        if not mask.any():
            return None
        
        avg_freq = np.mean(spec_centroid[spec_centroid >= fmin])
        if avg_freq <= 0:
            return None
        
        return avg_freq
        
    except Exception as e:
        print(f"Frequency detection error: {e}")
        return None


def detect_chord_from_stem(stem_path: str, sr: int = 44100) -> Dict:
    """
    Detect chord from an audio stem (guitar or keyboard)
    
    Args:
        stem_path: Path to audio stem file
        sr: Sample rate
        
    Returns:
        Dictionary with detected chord information
    """
    try:
        # Load stem
        if not Path(stem_path).exists():
            return {"error": f"Stem file not found: {stem_path}"}
        
        y, sr_actual = librosa.load(stem_path, sr=sr, mono=True)
        
        # Detect predominant frequency (find root note)
        freq = detect_predominant_frequency(y, sr_actual)
        
        if freq is None:
            return {
                "detected": False,
                "reason": "Could not detect clear pitch",
                "confidence": 0.0
            }
        
        # Convert frequency to MIDI note
        midi_note = hz_to_semitone(freq)
        root_note = semitone_to_note_name(midi_note)
        root_semitone = int(round(midi_note)) % 12
        
        # For now, default to major chord (can be enhanced with harmonic analysis)
        chord_type = 'maj'
        chord_intervals = CHORD_PATTERNS[chord_type]
        
        # Calculate chord notes
        chord_notes = [
            CHROMATIC_SCALE[(root_semitone + interval) % 12]
            for interval in chord_intervals
        ]
        
        return {
            "detected": True,
            "root_note": root_note.split('0123456789')[-1] if root_note else 'C',
            "root_semitone": root_semitone,
            "frequency": float(freq),
            "chord_type": chord_type,
            "notes": chord_notes,
            "intervals": chord_intervals,
            "confidence": min(0.95, 0.5 + (abs(freq - A4_FREQ) / 500)),  # Mock confidence
            "notation": f"{root_note.split('0123456789')[-1] if root_note else 'C'}{chord_type}"
        }
        
    except Exception as e:
        return {
            "detected": False,
            "reason": str(e),
            "confidence": 0.0
        }


def analyze_chord_progression(stems: Dict[str, str], sr: int = 44100) -> Dict:
    """
    Analyze chord progression across multiple stems
    
    Args:
        stems: Dictionary of stem names to file paths
        sr: Sample rate
        
    Returns:
        Dictionary with progression analysis
    """
    guitar_chord = {"detected": False}
    piano_chord = {"detected": False}
    
    # Try to detect from guitar stem
    if 'guitar' in stems or 'Guitar' in stems:
        guitar_path = stems.get('guitar', stems.get('Guitar', ''))
        if guitar_path:
            guitar_chord = detect_chord_from_stem(guitar_path, sr)
    
    # Try to detect from piano stem (for reference)
    if 'piano' in stems or 'Piano' in stems or 'keyboard' in stems or 'Keyboard' in stems:
        piano_key = next((k for k in stems.keys() if 'piano' in k.lower() or 'keyboard' in k.lower()), None)
        if piano_key:
            piano_chord = detect_chord_from_stem(stems[piano_key], sr)
    
    return {
        "guitar_chord": guitar_chord,
        "piano_chord": piano_chord,
        "progression": [guitar_chord] if guitar_chord.get("detected") else []
    }


if __name__ == "__main__":
    import sys
    if len(sys.argv) > 1:
        stem_file = sys.argv[1]
        result = detect_chord_from_stem(stem_file)
        print(result)
