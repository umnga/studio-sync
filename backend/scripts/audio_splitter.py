#!/usr/bin/env python3
"""
Audio Splitter Engine - Professional stem separation with caching support
"""
import os
import sys
import hashlib

# Prevent OpenMP thread-locking on Apple Silicon
os.environ["OMP_NUM_THREADS"] = "1"
os.environ["MKL_NUM_THREADS"] = "1"
os.environ["OPENBLAS_NUM_THREADS"] = "1"

import logging
from contextlib import contextmanager
from pathlib import Path
from typing import Dict, List, Callable, Optional, Tuple

# ============================================================================
# Configure logging
# ============================================================================
logger = logging.getLogger("studio-sync.splitter")

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


def compute_file_hash(file_path: str, chunk_size: int = 8192) -> str:
    """
    Compute SHA256 hash of a file for cache key generation.
    
    Args:
        file_path: Path to the file
        chunk_size: Size of chunks to read
        
    Returns:
        Hex digest of the file hash (first 16 chars for brevity)
    """
    sha256_hash = hashlib.sha256()
    with open(file_path, "rb") as f:
        for chunk in iter(lambda: f.read(chunk_size), b""):
            sha256_hash.update(chunk)
    return sha256_hash.hexdigest()[:16]


# ============================================================================
# Heavy imports (after environment setup)
# ============================================================================
import numpy as np
import soundfile as sf
import torch
import librosa

# Demucs imports with error handling
try:
    from demucs.pretrained import get_model
    from demucs.apply import apply_model
    DEMUCS_AVAILABLE = True
    logger.info("✅ Demucs library loaded successfully")
except ImportError as e:
    logger.error(f"❌ Demucs not available: {e}")
    logger.error("   Install with: pip install demucs")
    DEMUCS_AVAILABLE = False


class SplitterEngine:
    """Professional audio stem separation engine with UI integration hooks"""
    
    # Expected stems per model
    MODEL_STEMS = {
        "htdemucs": ["drums", "bass", "other", "vocals"],
        "htdemucs_6s": ["drums", "bass", "vocals", "guitar", "piano", "other"]
    }
    
    def __init__(self, model_name: str = "htdemucs_6s", mock_mode: bool = False):
        """
        Initialize the splitter engine
        
        Args:
            model_name: Demucs model to use (htdemucs_6s supports 6 stems)
            mock_mode: If True, simulates processing without loading models
        """
        self.model_name = model_name
        self.mock_mode = mock_mode
        self.model = None
        self.device = None
        
        if not DEMUCS_AVAILABLE:
            logger.warning("⚠️  Demucs not available, forcing mock mode")
            self.mock_mode = True
        
        if not mock_mode and DEMUCS_AVAILABLE:
            self._initialize_model()
        elif not DEMUCS_AVAILABLE:
            logger.warning("⚠️  Running in mock mode - Demucs not installed")
    
    def _initialize_model(self):
        """Load and configure the demucs model with detailed logging"""
        logger.info(f"🔄 Initializing Demucs model: {self.model_name}")
        logger.info("   This may take a few minutes on first run (downloading ~1GB model)...")
        
        try:
            # Log before model download/load
            logger.info("   Step 1/3: Loading model weights...")
            self.model = get_model(self.model_name)
            
            logger.info("   Step 2/3: Setting model to eval mode...")
            self.model.eval()
            
            # Device selection with MPS support for Apple Silicon
            logger.info("   Step 3/3: Configuring compute device...")
            if torch.cuda.is_available():
                self.device = torch.device("cuda")
                logger.info(f"   ✅ Using CUDA GPU: {torch.cuda.get_device_name(0)}")
            elif hasattr(torch.backends, 'mps') and torch.backends.mps.is_available():
                # MPS can be unstable with Demucs, use CPU for reliability
                self.device = torch.device("cpu")
                logger.info("   ℹ️  MPS available but using CPU for Demucs stability")
            else:
                self.device = torch.device("cpu")
                logger.info("   ℹ️  Using CPU (this will be slower)")
            
            self.model = self.model.to(self.device)
            
            logger.info(f"✅ Model loaded successfully!")
            logger.info(f"   Available stems: {self.model.sources}")
            
        except Exception as e:
            logger.error(f"❌ Failed to load model: {e}")
            logger.error("   Falling back to mock mode")
            self.mock_mode = True
            self.model = None
    
    def _enforce_stereo(self, waveform: np.ndarray) -> np.ndarray:
        """
        Ensure waveform is strictly 2-channel stereo for demucs
        
        Args:
            waveform: Input audio array
            
        Returns:
            Stereo (2, samples) numpy array
        """
        if waveform.ndim == 1:  # Mono to stereo
            waveform = np.stack([waveform, waveform])
        elif waveform.shape[0] == 1:  # Single channel to stereo
            waveform = np.repeat(waveform, 2, axis=0)
        elif waveform.shape[0] > 2:  # Multi-channel to stereo (take first 2)
            waveform = waveform[:2, :]
        
        return waveform
    
    def _normalize_stem(self, audio: np.ndarray, ceiling_db: float = -1.0) -> np.ndarray:
        """
        Peak normalize audio to prevent clipping
        
        Args:
            audio: Input audio array
            ceiling_db: Target peak level in dBFS (default: -1.0 dBFS)
            
        Returns:
            Normalized audio array
        """
        peak = np.abs(audio).max()
        if peak > 0:
            target_peak = 10 ** (ceiling_db / 20.0)
            audio = audio * (target_peak / peak)
        return audio
    
    def _calculate_metrics(self, audio: np.ndarray, sr: int) -> Dict:
        """
        Calculate RMS and peak levels for UI meters
        
        Args:
            audio: Audio array (channels, samples)
            sr: Sample rate
            
        Returns:
            Dictionary with rms_db, peak_db, duration
        """
        rms = np.sqrt(np.mean(audio ** 2))
        rms_db = 20 * np.log10(rms + 1e-10)
        
        peak = np.abs(audio).max()
        peak_db = 20 * np.log10(peak + 1e-10)
        
        duration = audio.shape[1] / sr if audio.ndim > 1 else len(audio) / sr
        
        return {
            "rms_db": float(rms_db),
            "peak_db": float(peak_db),
            "duration": float(duration)
        }
    
    def check_cache(self, audio_path: str, output_base_dir: str, mode: str) -> Tuple[bool, Optional[Dict]]:
        """
        Check if stems for this audio file already exist in cache.
        
        Args:
            audio_path: Path to the input audio file
            output_base_dir: Base directory for outputs
            mode: 'fast' or 'detailed'
            
        Returns:
            Tuple of (cache_hit: bool, result: Dict or None)
        """
        try:
            audio_path = Path(audio_path)
            output_base = Path(output_base_dir)
            
            # Compute file hash
            file_hash = compute_file_hash(str(audio_path))
            
            # Expected cache path: outputs/{hash}/{mode}/
            cache_dir = output_base / file_hash / mode
            
            if not cache_dir.exists():
                logger.info(f"Cache miss: {cache_dir} does not exist")
                return False, None
            
            # Get expected stems for this model
            expected_stems = self.MODEL_STEMS.get(self.model_name, [])
            
            # Check if all stem files exist
            stems = {}
            for stem_name in expected_stems:
                # Look for matching stem file
                matching_files = list(cache_dir.glob(f"*_{stem_name}_*.wav"))
                if not matching_files:
                    logger.info(f"Cache miss: {stem_name} stem not found in {cache_dir}")
                    return False, None
                
                stem_path = matching_files[0]
                
                # Load audio to get metrics
                try:
                    with suppress_c_stderr():
                        audio_data, sr = librosa.load(str(stem_path), sr=None, mono=False)
                    
                    if audio_data.ndim == 1:
                        audio_data = np.stack([audio_data, audio_data])
                    
                    metrics = self._calculate_metrics(audio_data, sr)
                    
                    stems[stem_name] = {
                        "path": str(stem_path),
                        "rms_db": metrics["rms_db"],
                        "peak_db": metrics["peak_db"],
                        "duration": metrics["duration"]
                    }
                except Exception as e:
                    logger.warning(f"Error reading cached stem {stem_path}: {e}")
                    return False, None
            
            # All stems found - cache hit!
            logger.info(f"✅ Cache HIT: Found {len(stems)} stems in {cache_dir}")
            
            return True, {
                "success": True,
                "stems": stems,
                "output_directory": str(cache_dir),
                "sample_rate": sr,
                "model_used": self.model_name,
                "input_file": str(audio_path),
                "cache_hit": True,
                "file_hash": file_hash
            }
            
        except Exception as e:
            logger.error(f"Error checking cache: {e}")
            return False, None
    
    def get_cache_path(self, audio_path: str, output_base_dir: str, mode: str) -> Path:
        """
        Get the cache directory path for an audio file.
        
        Args:
            audio_path: Path to the input audio file
            output_base_dir: Base directory for outputs
            mode: 'fast' or 'detailed'
            
        Returns:
            Path to the cache directory
        """
        file_hash = compute_file_hash(str(audio_path))
        return Path(output_base_dir) / file_hash / mode
    
    def split_audio(
        self, 
        audio_path: str, 
        output_dir: Optional[str] = None,
        progress_callback: Optional[Callable[[int, str], None]] = None,
        check_cache: bool = True,
        output_base_dir: Optional[str] = None,
        mode: str = "detailed"
    ) -> Dict:
        """
        Split audio into separate stems with UI progress hooks
        
        Args:
            audio_path: Path to audio file (supports .wav, .mp3, .flac, .m4a)
            output_dir: Custom output directory (default: uses cache path)
            progress_callback: Function to call with (progress: int, stage: str)
            check_cache: Whether to check for existing cached stems
            output_base_dir: Base directory for cached outputs  
            mode: 'fast' or 'detailed' for cache path
            
        Returns:
            Dictionary with stem paths, metadata, and metrics
        """
        try:
            audio_path = Path(audio_path)
            
            if not audio_path.exists():
                return {"success": False, "error": f"Audio file not found: {audio_path}"}
            
            logger.info(f"Processing: {audio_path.name}")
            
            # Helper to call progress callback with stage info
            def report_progress(pct: int, stage: str):
                if progress_callback:
                    progress_callback(pct, stage)
            
            report_progress(2, "Initializing...")
            
            # Check cache if enabled and output_base_dir provided
            if check_cache and output_base_dir:
                report_progress(3, "Checking cache...")
                cache_hit, cached_result = self.check_cache(str(audio_path), output_base_dir, mode)
                if cache_hit and cached_result:
                    logger.info("✅ Using cached stems - skipping AI processing")
                    report_progress(100, "Complete (cached)")
                    return cached_result
            
            report_progress(5, "Loading audio file...")
            
            # Mock mode for UI testing
            if self.mock_mode:
                logger.info("   Running in mock mode")
                return self._mock_split(audio_path, progress_callback)
            
            # ================================================================
            # Stage 1: Load Audio (5% -> 15%)
            # ================================================================
            logger.info("   Stage 1/4: Loading audio file...")
            report_progress(10, "Analyzing audio waveform...")
            
            with suppress_c_stderr():
                waveform, sr = librosa.load(str(audio_path), sr=44100, mono=False)
            
            # Calculate duration for logging
            duration = waveform.shape[1] / sr if waveform.ndim > 1 else len(waveform) / sr
            logger.info(f"   Audio loaded: {duration:.1f}s @ {sr}Hz")
            
            # CRITICAL: Enforce stereo for demucs
            waveform = self._enforce_stereo(waveform)
            logger.info(f"   Shape after stereo enforcement: {waveform.shape}")
            
            report_progress(15, "Preparing for AI processing...")
            
            # ================================================================
            # Stage 2: Prepare Tensor (15% -> 25%)
            # ================================================================
            logger.info("   Stage 2/4: Preparing tensor for model...")
            
            # Convert to torch tensor
            waveform_tensor = torch.from_numpy(waveform).float().to(self.device)
            waveform_tensor = waveform_tensor.unsqueeze(0)  # Add batch dimension
            
            logger.info(f"   Tensor shape: {waveform_tensor.shape}, Device: {self.device}")
            
            report_progress(20, "Converting to tensor format...")
            
            # Determine output directory - use cache path if output_base_dir provided
            if output_dir is None and output_base_dir:
                file_hash = compute_file_hash(str(audio_path))
                output_dir = Path(output_base_dir) / file_hash / mode
            elif output_dir is None:
                output_dir = audio_path.parent / f"{audio_path.stem}_stems"
            else:
                output_dir = Path(output_dir)
            
            output_dir.mkdir(parents=True, exist_ok=True)
            
            report_progress(25, "Starting neural network inference...")
            
            # ================================================================
            # Stage 3: Model Inference (25% -> 70%)
            # This is the heavy computation
            # ================================================================
            logger.info("   Stage 3/4: Running Demucs model (this takes a while)...")
            logger.info(f"   Processing {len(self.model.sources)} stems: {self.model.sources}")
            
            stem_names = list(self.model.sources)
            num_stems = len(stem_names)
            
            # Create a progress callback that reports stem-by-stem progress
            inference_start_pct = 25
            inference_end_pct = 70
            inference_range = inference_end_pct - inference_start_pct
            
            report_progress(30, f"Separating stems (0/{num_stems})...")
            
            try:
                with torch.no_grad():
                    # The apply_model function handles chunking internally
                    sources = apply_model(
                        self.model, 
                        waveform_tensor, 
                        device=self.device, 
                        progress=True,  # Enable internal progress logging
                        num_workers=0   # Disable multiprocessing workers on macOS
                    )[0]
                
                logger.info("   Model inference complete!")
                
            except RuntimeError as e:
                if "out of memory" in str(e).lower():
                    logger.error(f"   Memory error: {e}")
                    raise MemoryError(f"Out of memory processing audio. Try a shorter file. Original error: {e}")
                raise
            
            report_progress(70, "Model inference complete...")
            
            # ================================================================
            # Stage 4: Save Stems (70% -> 100%)
            # ================================================================
            logger.info("   Stage 4/4: Saving separated stems...")
            
            # Extract and save stems with professional naming
            stems = {}
            
            progress_per_stem = 25 / num_stems
            
            for idx, (stem_name, source) in enumerate(zip(stem_names, sources)):
                stem_pct = int(70 + (idx + 1) * progress_per_stem)
                report_progress(stem_pct, f"Saving {stem_name.capitalize()} stem...")
                logger.info(f"   Saving stem: {stem_name}")
                
                # Convert to numpy and normalize
                stem_audio = source.cpu().numpy()
                stem_audio = self._normalize_stem(stem_audio, ceiling_db=-1.0)
                
                # Professional naming: OriginalName_StemName_ModelName.wav
                stem_filename = f"{audio_path.stem}_{stem_name}_{self.model_name}.wav"
                stem_path = output_dir / stem_filename
                
                # Save stem (transpose for soundfile: samples x channels)
                sf.write(str(stem_path), stem_audio.T, sr)
                
                # Calculate metrics for UI
                metrics = self._calculate_metrics(stem_audio, sr)
                
                stems[stem_name] = {
                    "path": str(stem_path),
                    "rms_db": metrics["rms_db"],
                    "peak_db": metrics["peak_db"],
                    "duration": metrics["duration"]
                }
            
            # Clear memory
            del sources, waveform_tensor, waveform
            if self.device and self.device.type == "cuda":
                torch.cuda.empty_cache()
            
            # Compute file hash for result
            file_hash = compute_file_hash(str(audio_path))
            
            report_progress(100, "Complete!")
            
            logger.info(f"✅ Split complete! {len(stems)} stems saved to {output_dir}")
            
            return {
                "success": True,
                "stems": stems,
                "output_directory": str(output_dir),
                "sample_rate": sr,
                "model_used": self.model_name,
                "input_file": str(audio_path),
                "cache_hit": False,
                "file_hash": file_hash
            }
            
        except MemoryError:
            # Re-raise memory errors for proper handling upstream
            raise
        except Exception as e:
            logger.error(f"Split failed: {e}", exc_info=True)
            
            # Cleanup on failure
            if self.device and self.device.type == "cuda":
                torch.cuda.empty_cache()
            
            return {
                "success": False,
                "error": str(e),
                "stems": {}
            }
    
    def _mock_split(self, audio_path: Path, progress_callback: Optional[Callable[[int, str], None]]) -> Dict:
        """Mock processing for UI testing without GPU - returns 6 stems"""
        import time
        
        # Get stem names for this model
        stem_names = self.MODEL_STEMS.get(self.model_name, ['drums', 'bass', 'vocals', 'guitar', 'piano', 'other'])
        stems = {}
        
        for idx, stem_name in enumerate(stem_names):
            time.sleep(0.3)  # Simulate processing
            pct = int(20 + (idx + 1) * (70 / len(stem_names)))
            if progress_callback:
                progress_callback(pct, f"Separating {stem_name.capitalize()}...")
            logger.info(f"   [MOCK] Processing stem: {stem_name}")
            
            # Fake metadata - adjust levels based on stem type
            rms_variation = {
                'vocals': (-10, 6),
                'drums': (-12, 6),
                'bass': (-16, 6),
                'guitar': (-14, 6),
                'piano': (-18, 6),
                'other': (-20, 6)
            }
            
            rms_min, rms_range = rms_variation.get(stem_name, (-18, 6))
            
            stems[stem_name] = {
                "path": f"/mock/path/{audio_path.stem}_{stem_name}_{self.model_name}.wav",
                "rms_db": rms_min + np.random.rand() * rms_range,
                "peak_db": -3.0 + np.random.rand() * 2,
                "duration": 180.0 + np.random.rand() * 60
            }
        
        if progress_callback:
            progress_callback(100, "Complete!")
        
        return {
            "success": True,
            "stems": stems,
            "output_directory": "/mock/output",
            "sample_rate": 44100,
            "model_used": self.model_name,
            "input_file": str(audio_path),
            "mock_mode": True,
            "cache_hit": False,
            "file_hash": "mock_hash"
        }


def split_audio(
    audio_path: str, 
    model_name: str = "htdemucs_6s",
    progress_callback: Optional[Callable[[int, str], None]] = None
) -> Dict:
    """
    Legacy function wrapper for backward compatibility
    
    Args:
        audio_path: Path to audio file
        model_name: Demucs model to use
        progress_callback: Optional progress callback (pct, stage)
        
    Returns:
        Dictionary with paths to separated audio files and metadata
    """
    engine = SplitterEngine(model_name=model_name)
    return engine.split_audio(audio_path, progress_callback=progress_callback)


def get_stem_info(audio_path: str) -> Dict:
    """
    Get information about audio file for splitting
    
    Args:
        audio_path: Path to audio file
        
    Returns:
        Dictionary with audio information
    """
    try:
        with suppress_c_stderr():
            y, sr = librosa.load(audio_path, sr=None, mono=False)
        
        # Ensure proper channel detection
        channels = 2 if y.ndim > 1 and y.shape[0] == 2 else 1
        duration = y.shape[1] / sr if y.ndim > 1 else len(y) / sr
        
        return {
            "file": audio_path,
            "duration": float(duration),
            "sample_rate": int(sr),
            "channels": channels,
            "can_split": True,
            "format": Path(audio_path).suffix[1:].upper()
        }
    except Exception as e:
        logger.error(f"Error getting stem info: {e}")
        return {
            "error": str(e),
            "can_split": False
        }


# ============================================================================
# MAIN ENTRY POINT - CRITICAL FOR MACOS MULTIPROCESSING
# ============================================================================
if __name__ == "__main__":
    # This guard prevents recursive process spawning on macOS
    import sys
    
    logging.basicConfig(
        level=logging.DEBUG,
        format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
    )
    
    if len(sys.argv) > 1:
        audio_file = sys.argv[1]
        
        # Example with progress callback
        def progress(pct: int, stage: str):
            print(f"Progress: {pct}% - {stage}")
        
        # Use htdemucs_6s for 6-stem separation
        engine = SplitterEngine(model_name="htdemucs_6s", mock_mode=False)
        result = engine.split_audio(audio_file, progress_callback=progress)
        print(result)
    else:
        print("Usage: python audio_splitter.py <audio_file>")
        print("\nExample:")
        print("  python audio_splitter.py song.mp3")