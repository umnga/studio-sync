from fastapi import FastAPI, UploadFile, File, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel
from pathlib import Path
import shutil
import os
import uuid
import time
import threading
from typing import Dict, Optional
import tempfile

# Import audio processing modules
from scripts.buzz_detector import detect_buzz
from scripts.tuner import detect_frequency, get_tuning_deviation
from scripts.chord_converter import convert_chord, get_chord_variations
from scripts.audio_splitter import split_audio, get_stem_info, SplitterEngine

# Initialize FastAPI app
app = FastAPI(
    title="Studio Sync API",
    description="Audio processing API for music tools",
    version="1.0.0"
)

# Add CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://localhost:3000", "*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Create directories for uploads and outputs
UPLOAD_DIR = Path(tempfile.gettempdir()) / "studio-sync-uploads"
UPLOAD_DIR.mkdir(exist_ok=True)

OUTPUT_DIR = Path(tempfile.gettempdir()) / "studio-sync-outputs"
OUTPUT_DIR.mkdir(exist_ok=True)

# Mount static files for stem downloads
app.mount("/outputs", StaticFiles(directory=str(OUTPUT_DIR)), name="outputs")

# Initialize splitter engine (use htdemucs_6s for 6-stem separation)
splitter_engine = SplitterEngine(model_name="htdemucs_6s", mock_mode=False)

# Cleanup old sessions periodically
def cleanup_old_outputs(max_age_hours: int = 24):
    """Remove output directories older than max_age_hours"""
    while True:
        try:
            now = time.time()
            for session_dir in OUTPUT_DIR.iterdir():
                if session_dir.is_dir():
                    age_hours = (now - session_dir.stat().st_mtime) / 3600
                    if age_hours > max_age_hours:
                        shutil.rmtree(session_dir, ignore_errors=True)
        except Exception as e:
            print(f"Cleanup error: {e}")
        time.sleep(3600)  # Run every hour

# Start cleanup thread
cleanup_thread = threading.Thread(target=cleanup_old_outputs, daemon=True)
cleanup_thread.start()


# Pydantic models
class ChordRequest(BaseModel):
    chord: str
    output_format: Optional[str] = "notes"


class TunerRequest(BaseModel):
    target_note: Optional[str] = "A4"


class ChordVariationRequest(BaseModel):
    root: str
    chord_type: Optional[str] = "maj"


# Health check
@app.get("/health")
async def health_check():
    """Check if API is running"""
    return {"status": "ok", "message": "Studio Sync API is running"}


# ==================== BUZZ DETECTOR ENDPOINTS ====================

@app.post("/api/buzz-detector/analyze")
async def analyze_buzz(file: UploadFile = File(...)):
    """
    Analyze audio file for buzz/humming
    
    Returns:
        - detected_frequencies: List of detected buzz frequencies
        - severity: Buzz severity (0-1)
        - is_buzzing: Boolean indicating presence of buzz
    """
    try:
        # Save uploaded file
        file_path = UPLOAD_DIR / file.filename
        with open(file_path, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)
        
        # Analyze buzz
        result = detect_buzz(str(file_path))
        
        # Clean up
        file_path.unlink()
        
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ==================== TUNER ENDPOINTS ====================

@app.post("/api/tuner/detect-frequency")
async def detect_pitch(file: UploadFile = File(...)):
    """
    Detect fundamental frequency in audio
    
    Returns:
        - frequency: Detected frequency in Hz
        - note: Nearest musical note
        - confidence: Detection confidence (0-1)
    """
    try:
        file_path = UPLOAD_DIR / file.filename
        with open(file_path, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)
        
        result = detect_frequency(str(file_path))
        
        file_path.unlink()
        
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/tuner/get-deviation")
async def get_deviation(file: UploadFile = File(...), target_note: str = "A4"):
    """
    Calculate tuning deviation from target note
    
    Returns:
        - deviation_cents: Deviation in cents
        - status: 'sharp', 'flat', or 'in_tune'
        - is_in_tune: Boolean
    """
    try:
        file_path = UPLOAD_DIR / file.filename
        with open(file_path, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)
        
        # First detect frequency
        freq_result = detect_frequency(str(file_path))
        
        if "error" in freq_result or freq_result.get("frequency", 0) <= 0:
            raise HTTPException(status_code=400, detail="Could not detect frequency")
        
        # Calculate deviation
        result = get_tuning_deviation(freq_result["frequency"], target_note)
        
        file_path.unlink()
        
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ==================== CHORD CONVERTER ENDPOINTS ====================

@app.post("/api/chord-converter/convert")
async def convert_chord_endpoint(request: ChordRequest):
    """
    Convert chord notation
    
    Args:
        chord: Chord string (e.g., 'Cmaj7')
        output_format: Output format (default 'notes')
        
    Returns:
        - standard_notation: Standard chord notation
        - notes: Notes in the chord
        - intervals: Semitone intervals
    """
    try:
        result = convert_chord(request.chord, request.output_format)
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/chord-converter/variations/{root}/{chord_type}")
async def get_variations(root: str, chord_type: str = "maj"):
    """
    Get chord variations (inversions, etc.)
    
    Returns:
        - root_position: Root position voicing
        - first_inversion: First inversion voicing
        - second_inversion: Second inversion voicing
    """
    try:
        result = get_chord_variations(root.upper(), chord_type)
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ==================== AUDIO SPLITTER ENDPOINTS ====================

@app.post("/api/split")
async def split_audio_endpoint(
    file: UploadFile = File(...),
    session_id: Optional[str] = None
):
    """
    Split audio into separate stems with URLs for streaming/download
    
    Args:
        file: Audio file (supports .wav, .mp3, .flac, .m4a)
        session_id: Optional session ID (auto-generated if not provided)
    
    Returns:
        - success: Boolean indicating success
        - session_id: Unique session identifier
        - stems: Array of stem objects, each containing:
            - name: Stem name (vocals, drums, bass, other)
            - url: Download/streaming URL
            - mime_type: MIME type (audio/wav)
            - duration: Duration in seconds
            - rms_db: RMS level in dB (for UI meters)
            - peak_db: Peak level in dB
        - sample_rate: Sample rate of output files
    """
    try:
        # Generate session ID if not provided
        if not session_id:
            session_id = str(uuid.uuid4())
        
        # Create session output directory
        session_output_dir = OUTPUT_DIR / session_id
        session_output_dir.mkdir(exist_ok=True)
        
        # Save uploaded file
        file_path = UPLOAD_DIR / f"{session_id}_{file.filename}"
        with open(file_path, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)
        
        # Process audio with splitter engine
        result = splitter_engine.split_audio(
            str(file_path),
            output_dir=str(session_output_dir)
        )
        
        if not result.get("success"):
            raise HTTPException(status_code=500, detail=result.get("error", "Processing failed"))
        
        # Transform response to use URLs instead of file paths
        stems_array = []
        for stem_name, stem_data in result["stems"].items():
            # Convert file path to URL
            stem_filename = Path(stem_data["path"]).name
            stem_url = f"/outputs/{session_id}/{stem_filename}"
            
            stems_array.append({
                "name": stem_name,
                "url": stem_url,
                "mime_type": "audio/wav",
                "duration": stem_data["duration"],
                "rms_db": stem_data["rms_db"],
                "peak_db": stem_data["peak_db"]
            })
        
        # Clean up uploaded file
        file_path.unlink(missing_ok=True)
        
        return {
            "success": True,
            "session_id": session_id,
            "stems": stems_array,
            "sample_rate": result["sample_rate"],
            "model_used": result["model_used"]
        }
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# Legacy endpoint for backward compatibility
@app.post("/api/audio-splitter/split")
async def split_audio_legacy(file: UploadFile = File(...)):
    """Legacy endpoint - redirects to /api/split"""
    return await split_audio_endpoint(file)


@app.post("/api/audio-splitter/info")
async def get_audio_info(file: UploadFile = File(...)):
    """
    Get information about audio file
    
    Returns:
        - duration: Duration in seconds
        - sample_rate: Sample rate in Hz
        - channels: Number of channels
        - can_split: Whether file can be split
    """
    try:
        file_path = UPLOAD_DIR / file.filename
        with open(file_path, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)
        
        result = get_stem_info(str(file_path))
        
        file_path.unlink()
        
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/audio-splitter/download/{stem_file}")
async def download_stem(stem_file: str):
    """
    Download a stem file
    """
    try:
        # Prevent directory traversal
        file_path = UPLOAD_DIR / stem_file
        if not file_path.exists():
            raise HTTPException(status_code=404, detail="File not found")
        
        return FileResponse(file_path, media_type="audio/wav")
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ==================== ROOT ENDPOINT ====================

@app.get("/")
async def root():
    """API documentation"""
    return {
        "name": "Studio Sync API",
        "version": "1.0.0",
        "endpoints": {
            "health": "/health",
            "buzz_detector": "/api/buzz-detector/analyze",
            "tuner": {
                "detect_frequency": "/api/tuner/detect-frequency",
                "get_deviation": "/api/tuner/get-deviation"
            },
            "chord_converter": {
                "convert": "/api/chord-converter/convert",
                "variations": "/api/chord-converter/variations/{root}/{chord_type}"
            },
            "audio_splitter": {
                "split": "/api/audio-splitter/split",
                "info": "/api/audio-splitter/info",
                "download": "/api/audio-splitter/download/{stem_file}"
            }
        }
    }


if __name__ == "__main__":
    import uvicorn
    
    uvicorn.run(
        "api:app",
        host="0.0.0.0",
        port=8000,
        reload=True,
        log_level="info"
    )
