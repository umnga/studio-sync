#!/usr/bin/env python3
"""
Audio Splitter Module - Mac-Safe Demucs Integration

Professional audio stem separation engine with proper multiprocessing guards,
enhanced logging, and memory protection for macOS/Apple Silicon.
"""

# ============================================================================
# CRITICAL: Environment setup MUST come before ANY other imports
# ============================================================================
import os
import sys

# Prevent OpenMP thread-locking on Apple Silicon
os.environ["OMP_NUM_THREADS"] = "1"
os.environ["MKL_NUM_THREADS"] = "1"
os.environ["OPENBLAS_NUM_THREADS"] = "1"

# ============================================================================
# Standard library imports
# ============================================================================
import logging
from contextlib import contextmanager
from pathlib import Path
from typing import Dict, List, Callable, Optional

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
except ImportError as e:
    logger.error(f"Demucs not available: {e}")
    DEMUCS_AVAILABLE = False


class SplitterEngine:
    """Professional audio stem separation engine with UI integration hooks"""
    
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
            logger.warning("Demucs not available, forcing mock mode")
            self.mock_mode = True
        
        if not mock_mode:
            self._initialize_model()
    
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
    
    def split_audio(
        self, 
        audio_path: str, 
        output_dir: Optional[str] = None,
        progress_callback: Optional[Callable[[int], None]] = None
    ) -> Dict:
        """
        Split audio into separate stems with UI progress hooks
        
        Args:
            audio_path: Path to audio file (supports .wav, .mp3, .flac, .m4a)
            output_dir: Custom output directory (default: {filename}_stems)
            progress_callback: Function to call with progress percentage (0-100)
            
        Returns:
            Dictionary with stem paths, metadata, and metrics
        """
        try:
            audio_path = Path(audio_path)
            
            if not audio_path.exists():
                return {"success": False, "error": f"Audio file not found: {audio_path}"}
            
            logger.info(f"🎵 Processing: {audio_path.name}")
            
            if progress_callback:
                progress_callback(5)
            
            # Mock mode for UI testing
            if self.mock_mode:
                logger.info("   Running in mock mode")
                return self._mock_split(audio_path, progress_callback)
            
            # ================================================================
            # Stage 1: Load Audio (5% -> 15%)
            # ================================================================
            logger.info("   Stage 1/4: Loading audio file...")
            if progress_callback:
                progress_callback(10)
            
            with suppress_c_stderr():
                waveform, sr = librosa.load(str(audio_path), sr=44100, mono=False)
            
            # Calculate duration for logging
            duration = waveform.shape[1] / sr if waveform.ndim > 1 else len(waveform) / sr
            logger.info(f"   Audio loaded: {duration:.1f}s @ {sr}Hz")
            
            # CRITICAL: Enforce stereo for demucs
            waveform = self._enforce_stereo(waveform)
            logger.info(f"   Shape after stereo enforcement: {waveform.shape}")
            
            if progress_callback:
                progress_callback(15)
            
            # ================================================================
            # Stage 2: Prepare Tensor (15% -> 25%)
            # ================================================================
            logger.info("   Stage 2/4: Preparing tensor for model...")
            
            # Convert to torch tensor
            waveform_tensor = torch.from_numpy(waveform).float().to(self.device)
            waveform_tensor = waveform_tensor.unsqueeze(0)  # Add batch dimension
            
            logger.info(f"   Tensor shape: {waveform_tensor.shape}, Device: {self.device}")
            
            if progress_callback:
                progress_callback(25)
            
            # ================================================================
            # Stage 3: Model Inference (25% -> 70%)
            # This is the heavy computation
            # ================================================================
            logger.info("   Stage 3/4: Running Demucs model (this takes a while)...")
            logger.info(f"   Processing {len(self.model.sources)} stems: {self.model.sources}")
            
            if progress_callback:
                progress_callback(30)
            
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
                    logger.error(f"   ❌ Memory error: {e}")
                    raise MemoryError(f"Out of memory processing audio. Try a shorter file. Original error: {e}")
                raise
            
            if progress_callback:
                progress_callback(70)
            
            # ================================================================
            # Stage 4: Save Stems (70% -> 100%)
            # ================================================================
            logger.info("   Stage 4/4: Saving separated stems...")
            
            # Setup output directory
            if output_dir is None:
                output_dir = audio_path.parent / f"{audio_path.stem}_stems"
            else:
                output_dir = Path(output_dir)
            
            output_dir.mkdir(exist_ok=True)
            
            # Extract and save stems with professional naming
            stems = {}
            stem_names = self.model.sources
            
            progress_per_stem = 25 / len(stem_names)
            
            for idx, (stem_name, source) in enumerate(zip(stem_names, sources)):
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
                
                if progress_callback:
                    progress_callback(int(70 + (idx + 1) * progress_per_stem))
            
            # Clear memory
            del sources, waveform_tensor, waveform
            if self.device.type == "cuda":
                torch.cuda.empty_cache()
            
            if progress_callback:
                progress_callback(100)
            
            logger.info(f"✅ Split complete! {len(stems)} stems saved to {output_dir}")
            
            return {
                "success": True,
                "stems": stems,
                "output_directory": str(output_dir),
                "sample_rate": sr,
                "model_used": self.model_name,
                "input_file": str(audio_path)
            }
            
        except MemoryError:
            # Re-raise memory errors for proper handling upstream
            raise
        except Exception as e:
            logger.error(f"❌ Split failed: {e}", exc_info=True)
            
            # Cleanup on failure
            if self.device and self.device.type == "cuda":
                torch.cuda.empty_cache()
            
            return {
                "success": False,
                "error": str(e),
                "stems": {}
            }
    
    def _mock_split(self, audio_path: Path, progress_callback: Optional[Callable[[int], None]]) -> Dict:
        """Mock processing for UI testing without GPU - returns 6 stems"""
        import time
        
        # htdemucs_6s model returns 6 stems
        stem_names = ['drums', 'bass', 'vocals', 'guitar', 'piano', 'other']
        stems = {}
        
        for idx, stem_name in enumerate(stem_names):
            time.sleep(0.3)  # Simulate processing
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
                progress_callback(int(20 + (idx + 1) * 12))
        
        if progress_callback:
            progress_callback(100)
        
        return {
            "success": True,
            "stems": stems,
            "output_directory": "/mock/output",
            "sample_rate": 44100,
            "model_used": self.model_name,
            "input_file": str(audio_path),
            "mock_mode": True
        }


def split_audio(
    audio_path: str, 
    model_name: str = "htdemucs_6s",
    progress_callback: Optional[Callable[[int], None]] = None
) -> Dict:
    """
    Legacy function wrapper for backward compatibility
    
    Args:
        audio_path: Path to audio file
        model_name: Demucs model to use
        progress_callback: Optional progress callback
        
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
        def progress(pct):
            print(f"Progress: {pct}%")
        
        # Use htdemucs_6s for 6-stem separation
        engine = SplitterEngine(model_name="htdemucs_6s", mock_mode=False)
        result = engine.split_audio(audio_file, progress_callback=progress)
        print(result)
    else:
        print("Usage: python audio_splitter.py <audio_file>")
