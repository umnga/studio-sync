"""
Scripts package for Studio Sync audio processing
"""

__version__ = "1.0.0"
__all__ = []

# Try to import audio_splitter components
try:
    from .audio_splitter import split_audio, get_stem_info, SplitterEngine, compute_file_hash
    __all__.extend(["split_audio", "get_stem_info", "SplitterEngine", "compute_file_hash"])
except ImportError as e:
    print(f"Warning: Could not import audio_splitter: {e}")
    split_audio = None
    get_stem_info = None
    SplitterEngine = None
    compute_file_hash = None

# Try to import YouTube downloader (optional)
try:
    from .youtube_downloader import download_youtube_audio, YOUTUBE_DIR
    import asyncio
    
    async def async_download_youtube_audio(url: str, output_dir=None):
        """Async wrapper for YouTube download"""
        loop = asyncio.get_event_loop()
        return await loop.run_in_executor(
            None,
            lambda: download_youtube_audio(url, output_dir or YOUTUBE_DIR)
        )
    
    __all__.extend(["download_youtube_audio", "YOUTUBE_DIR", "async_download_youtube_audio"])
except ImportError:
    # YouTube support is optional
    download_youtube_audio = None
    YOUTUBE_DIR = None
    async_download_youtube_audio = None

# Note: Other modules (buzz_detector, tuner, chord_converter, chord_detector) 
# have been removed from this version