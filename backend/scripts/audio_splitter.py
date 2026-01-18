import os
from pathlib import Path
from typing import Dict, List, Callable, Optional
import numpy as np
import soundfile as sf
import torch
import librosa
from demucs.pretrained import get_model
from demucs.apply import apply_model


class SplitterEngine:
    """Professional audio stem separation engine with UI integration hooks"""
    
    def __init__(self, model_name: str = "htdemucs_6s", mock_mode: bool = False):
        """
        Initialize the splitter engine
        
        Args:
            model_name: Demucs model to use (htdemucs_6s supports 6 stems including guitar & piano)
            mock_mode: If True, simulates processing without loading models (for UI testing)
        """
        self.model_name = model_name
        self.mock_mode = mock_mode
        self.model = None
        self.device = None
        
        if not mock_mode:
            self._initialize_model()
    
    def _initialize_model(self):
        """Load and configure the demucs model"""
        self.model = get_model(self.model_name)
        self.model.eval()
        self.device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
        self.model = self.model.to(self.device)
    
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
            
            if progress_callback:
                progress_callback(5)
            
            # Mock mode for UI testing
            if self.mock_mode:
                return self._mock_split(audio_path, progress_callback)
            
            # Load audio with librosa (handles mp3, flac, m4a via ffmpeg)
            if progress_callback:
                progress_callback(10)
            
            waveform, sr = librosa.load(str(audio_path), sr=44100, mono=False)
            
            # CRITICAL: Enforce stereo for demucs
            waveform = self._enforce_stereo(waveform)
            
            if progress_callback:
                progress_callback(20)
            
            # Convert to torch tensor
            waveform_tensor = torch.from_numpy(waveform).float().to(self.device)
            waveform_tensor = waveform_tensor.unsqueeze(0)  # Add batch dimension
            
            # Apply model with progress tracking
            if progress_callback:
                progress_callback(30)
            
            with torch.no_grad():
                sources = apply_model(
                    self.model, 
                    waveform_tensor, 
                    device=self.device, 
                    progress=False
                )[0]
            
            if progress_callback:
                progress_callback(60)
            
            # Setup output directory
            if output_dir is None:
                output_dir = audio_path.parent / f"{audio_path.stem}_stems"
            else:
                output_dir = Path(output_dir)
            
            output_dir.mkdir(exist_ok=True)
            
            # Extract and save stems with professional naming
            stems = {}
            stem_names = self.model.sources  # ['drums', 'bass', 'other', 'vocals']
            
            progress_per_stem = 35 / len(stem_names)
            
            for idx, (stem_name, source) in enumerate(zip(stem_names, sources)):
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
                    progress_callback(int(60 + (idx + 1) * progress_per_stem))
            
            # Clear GPU memory
            if self.device.type == "cuda":
                del sources, waveform_tensor
                torch.cuda.empty_cache()
            
            if progress_callback:
                progress_callback(100)
            
            return {
                "success": True,
                "stems": stems,
                "output_directory": str(output_dir),
                "sample_rate": sr,
                "model_used": self.model_name,
                "input_file": str(audio_path)
            }
            
        except Exception as e:
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
        return {
            "error": str(e),
            "can_split": False
        }


if __name__ == "__main__":
    import sys
    if len(sys.argv) > 1:
        audio_file = sys.argv[1]
        
        # Example with progress callback
        def progress(pct):
            print(f"Progress: {pct}%")
        
        # Use htdemucs_6s for 6-stem separation (vocals, drums, bass, guitar, piano, other)
        engine = SplitterEngine(model_name="htdemucs_6s", mock_mode=False)
        result = engine.split_audio(audio_file, progress_callback=progress)
        print(result)
