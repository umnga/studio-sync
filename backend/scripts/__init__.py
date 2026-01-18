"""
Scripts package for Studio Sync audio processing
"""

from .buzz_detector import detect_buzz
from .tuner import detect_frequency, get_tuning_deviation
from .chord_converter import convert_chord, get_chord_variations
from .chord_detector import detect_chord_from_stem, analyze_chord_progression
from .audio_splitter import split_audio, get_stem_info, SplitterEngine

__all__ = [
    "detect_buzz",
    "detect_frequency",
    "get_tuning_deviation",
    "convert_chord",
    "get_chord_variations",
    "detect_chord_from_stem",
    "analyze_chord_progression",
    "split_audio",
    "get_stem_info",
    "SplitterEngine"
]
