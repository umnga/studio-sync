import os
from pathlib import Path
from typing import Dict, List
import numpy as np
import soundfile as sf
import torch
import librosa
from demucs.pretrained import get_model
from demucs.apply import apply_model


def split_audio(audio_path: str, model_name: str = "htdemucs") -> Dict:
    """
    Split audio into separate stems using Demucs
    
    Args:
        audio_path: Path to audio file
        model_name: Demucs model to use (e.g., 'htdemucs', 'tasnet_extra')
        
    Returns:
        Dictionary with paths to separated audio files
    """
    try:
        audio_path = Path(audio_path)
        
        if not audio_path.exists():
            return {"error": f"Audio file not found: {audio_path}"}
        
        # Load model
        model = get_model(model_name)
        model.eval()
        
        # Use GPU if available
        device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
        model = model.to(device)
        
        # Load audio
        waveform, sr = librosa.load(str(audio_path), sr=44100, mono=False)
        
        # Convert to torch tensor
        if waveform.ndim == 1:
            waveform = np.expand_dims(waveform, axis=0)
        
        waveform_tensor = torch.from_numpy(waveform).float().to(device)
        
        # Apply model
        with torch.no_grad():
            sources = apply_model(model, waveform_tensor[None], device=device, progress=False)[0]
        
        # Extract stems
        stems = {}
        stem_names = model.sources  # ['vocals', 'drums', 'bass', 'other']
        
        output_dir = audio_path.parent / f"{audio_path.stem}_stems"
        output_dir.mkdir(exist_ok=True)
        
        for stem_name, source in zip(stem_names, sources):
            # Convert to numpy
            stem_audio = source.cpu().numpy()
            
            # Save stem
            stem_path = output_dir / f"{stem_name}.wav"
            sf.write(str(stem_path), stem_audio.T, sr)
            
            stems[stem_name] = str(stem_path)
        
        return {
            "success": True,
            "stems": stems,
            "output_directory": str(output_dir),
            "sample_rate": sr,
            "model_used": model_name
        }
        
    except Exception as e:
        return {
            "success": False,
            "error": str(e),
            "stems": {}
        }


def get_stem_info(audio_path: str) -> Dict:
    """
    Get information about audio file for splitting
    
    Args:
        audio_path: Path to audio file
        
    Returns:
        Dictionary with audio information
    """
    try:
        y, sr = librosa.load(audio_path, sr=None)
        
        return {
            "file": audio_path,
            "duration": float(len(y) / sr),
            "sample_rate": sr,
            "channels": 1 if y.ndim == 1 else y.shape[0],
            "can_split": True
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
        result = split_audio(audio_file)
        print(result)
