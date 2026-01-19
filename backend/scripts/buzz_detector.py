"""
Buzz Detector Script
Detects buzzing/humming frequencies in audio using FFT analysis
"""

import os
import sys
from contextlib import contextmanager
import numpy as np
import librosa
from scipy import signal
from typing import Dict, List, Tuple


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


def detect_buzz(audio_path: str, sr: int = 22050, threshold: float = -40.0) -> Dict:
    """
    Detect buzz in audio data using spectral analysis
    
    Args:
        audio_path: Path to audio file
        sr: Sample rate (default 22050 Hz)
        threshold: Frequency threshold in dB (default -40)
        
    Returns:
        Dictionary with buzz detection results including:
        - detected_frequencies: List of detected buzz frequencies
        - severity: Buzz severity (0-1)
        - is_buzzing: Boolean indicating if buzz is present
        - details: Detailed analysis
    """
    try:
        # Load audio file (suppress libmpg123 warnings)
        with suppress_c_stderr():
            y, sr = librosa.load(audio_path, sr=sr)
        
        # Compute STFT (Short-Time Fourier Transform)
        D = librosa.stft(y)
        S_db = librosa.power_to_db(np.abs(D) ** 2, ref=np.max)
        
        # Get magnitude spectrum
        magnitude = np.abs(D)
        freqs = librosa.fft_frequencies(sr=sr)
        
        # Find peaks in frequency spectrum
        mean_spectrum = np.mean(magnitude, axis=1)
        peaks, properties = signal.find_peaks(mean_spectrum, height=np.max(mean_spectrum) * 0.1)
        
        # Convert peak indices to frequencies
        buzz_frequencies = freqs[peaks].tolist()
        
        # Calculate severity based on energy at buzz frequencies
        total_energy = np.sum(magnitude)
        buzz_energy = np.sum(magnitude[peaks])
        severity = min(1.0, buzz_energy / total_energy if total_energy > 0 else 0.0)
        
        # Determine if buzzing is detected (common buzz frequencies are 50-250 Hz)
        common_buzz_freq = [f for f in buzz_frequencies if 50 <= f <= 250]
        is_buzzing = len(common_buzz_freq) > 0 and severity > 0.05
        
        return {
            "detected_frequencies": buzz_frequencies,
            "common_buzz_frequencies": common_buzz_freq,
            "severity": float(severity),
            "is_buzzing": bool(is_buzzing),
            "details": {
                "sample_rate": sr,
                "duration": len(y) / sr,
                "total_peaks": len(peaks)
            }
        }
    except Exception as e:
        return {
            "error": str(e),
            "detected_frequencies": [],
            "severity": 0.0,
            "is_buzzing": False
        }


if __name__ == "__main__":
    # Example usage
    import sys
    if len(sys.argv) > 1:
        audio_file = sys.argv[1]
        result = detect_buzz(audio_file)
        print(result)

