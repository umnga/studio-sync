#!/usr/bin/env python3
import os
import sys

os.environ["OMP_NUM_THREADS"] = "1"
os.environ["MKL_NUM_THREADS"] = "1"
os.environ["OPENBLAS_NUM_THREADS"] = "1"

# Silence low-level library logs
os.environ['MPG123_VERBOSE'] = '0'
os.environ['MPG123_QUIET'] = '1'

# Force spawn method on macOS to prevent fork issues with PyTorch
if sys.platform == 'darwin':
    import multiprocessing
    try:
        multiprocessing.set_start_method('spawn', force=True)
    except RuntimeError:
        pass  # Already set

# ============================================================================
# Standard library imports
# ============================================================================
import ctypes
import uuid
import time
import shutil
import tempfile
import threading
import logging
from pathlib import Path
from typing import Dict, Optional
from contextlib import contextmanager

# ============================================================================
# Configure logging BEFORE importing heavy libraries
# ============================================================================
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger("studio-sync")

# Enable verbose Demucs logging
logging.getLogger("demucs").setLevel(logging.DEBUG)


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
# Import audio libraries with stderr suppressed
# ============================================================================
with suppress_c_stderr():
    import librosa
    import soundfile

import warnings
warnings.filterwarnings("ignore", message=".*id3.*")
logging.getLogger("pydub").setLevel(logging.ERROR)

# ============================================================================
# FastAPI and Pydantic imports
# ============================================================================
from fastapi import FastAPI, UploadFile, File, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

# ============================================================================
# Import audio processing modules (AFTER environment setup)
# ============================================================================
from scripts.buzz_detector import detect_buzz
from scripts.tuner import detect_frequency, get_tuning_deviation
from scripts.chord_converter import convert_chord, get_chord_variations
from scripts.audio_splitter import SplitterEngine, get_stem_info

# Import torch for error handling
import torch

# ============================================================================
# FastAPI Application Setup
# ============================================================================
app = FastAPI(
    title="Studio Sync API",
    description="Audio processing API for music tools - Mac-Safe Edition",
    version="1.1.0"
)

# Add CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://localhost:3000", "http://localhost:8080", "*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ============================================================================
# Directory Setup
# ============================================================================
UPLOAD_DIR = Path(tempfile.gettempdir()) / "studio-sync-uploads"
UPLOAD_DIR.mkdir(exist_ok=True)

OUTPUT_DIR = Path(tempfile.gettempdir()) / "studio-sync-outputs"
OUTPUT_DIR.mkdir(exist_ok=True)

# Mount static files for stem downloads
app.mount("/outputs", StaticFiles(directory=str(OUTPUT_DIR)), name="outputs")

# ============================================================================
# Global Splitter Engine with Thread Lock (Mac-Safe)
# ============================================================================
_splitter_engine: Optional[SplitterEngine] = None
_splitter_lock = threading.Lock()
_model_ready = threading.Event()


def get_splitter_engine() -> SplitterEngine:
    """
    Thread-safe singleton access to the splitter engine.
    Prevents multiple model loads and race conditions.
    """
    global _splitter_engine
    
    if _splitter_engine is None:
        with _splitter_lock:
            # Double-check after acquiring lock
            if _splitter_engine is None:
                logger.info("Creating new SplitterEngine instance...")
                _splitter_engine = SplitterEngine(
                    model_name="htdemucs_6s", 
                    mock_mode=False
                )
                _model_ready.set()
                logger.info("SplitterEngine ready!")
    
    return _splitter_engine


# ============================================================================
# Startup and Shutdown Events
# ============================================================================
@app.on_event("startup")
async def startup_event():
    """
    FastAPI startup event - Pre-load and validate the Demucs model.
    This prevents the "frozen at 10%" issue by ensuring model is ready.
    """
    logger.info("=" * 60)
    logger.info("🚀 Studio Sync API Starting Up...")
    logger.info("=" * 60)
    
    # Check system info
    logger.info(f"Platform: {sys.platform}")
    logger.info(f"Python: {sys.version}")
    logger.info(f"OMP_NUM_THREADS: {os.environ.get('OMP_NUM_THREADS', 'not set')}")
    
    # Pre-load model in background thread to not block startup
    def preload_model():
        try:
            logger.info("🔄 Checking/downloading htdemucs_6s model...")
            logger.info("   (This may take 5-10 minutes on first run as the model is ~1GB)")
            
            engine = get_splitter_engine()
            
            if engine.model is not None:
                logger.info("✅ Model htdemucs_6s loaded successfully!")
                logger.info(f"   Device: {engine.device}")
                logger.info(f"   Stems: {engine.model.sources}")
            else:
                logger.warning("⚠️  Model loaded in mock mode")
                
        except Exception as e:
            logger.error(f"❌ Failed to load model: {e}")
            logger.error("   The API will still run, but splitting will fail.")
    
    # Start model loading in background
    model_thread = threading.Thread(target=preload_model, daemon=True)
    model_thread.start()
    
    # Start cleanup thread
    cleanup_thread = threading.Thread(target=cleanup_old_outputs, daemon=True)
    cleanup_thread.start()
    
    logger.info("🎵 API endpoints are now available")
    logger.info("   Model loading continues in background...")


@app.on_event("shutdown")
async def shutdown_event():
    """Cleanup on shutdown"""
    logger.info("🛑 Studio Sync API shutting down...")
    
    global _splitter_engine
    if _splitter_engine is not None:
        # Clear any GPU memory
        if _splitter_engine.device and _splitter_engine.device.type == "cuda":
            torch.cuda.empty_cache()
        _splitter_engine = None
    
    logger.info("👋 Goodbye!")


# ============================================================================
# Background Tasks
# ============================================================================
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
                        logger.debug(f"Cleaned up old session: {session_dir.name}")
        except Exception as e:
            logger.error(f"Cleanup error: {e}")
        time.sleep(3600)  # Run every hour


# ============================================================================
# Pydantic Models
# ============================================================================
class ChordRequest(BaseModel):
    chord: str
    output_format: Optional[str] = "notes"


class TunerRequest(BaseModel):
    target_note: Optional[str] = "A4"


class ChordVariationRequest(BaseModel):
    root: str
    chord_type: Optional[str] = "maj"


# ============================================================================
# Health Check Endpoints
# ============================================================================
@app.get("/health")
async def health_check():
    """Check if API is running and model status"""
    model_status = "ready" if _model_ready.is_set() else "loading"
    return {
        "status": "ok", 
        "message": "Studio Sync API is running",
        "model_status": model_status,
        "platform": sys.platform
    }


@app.get("/api/model-status")
async def model_status():
    """Get detailed model loading status"""
    global _splitter_engine
    
    if _splitter_engine is None:
        return {
            "ready": False,
            "status": "initializing",
            "message": "Model is being loaded... This may take a few minutes on first run."
        }
    
    if _splitter_engine.model is None:
        return {
            "ready": False,
            "status": "mock_mode",
            "message": "Running in mock mode (no GPU/model)"
        }
    
    return {
        "ready": True,
        "status": "ready",
        "model_name": _splitter_engine.model_name,
        "device": str(_splitter_engine.device),
        "stems": list(_splitter_engine.model.sources) if _splitter_engine.model else []
    }


# ============================================================================
# BUZZ DETECTOR ENDPOINTS
# ============================================================================
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
        file_path = UPLOAD_DIR / file.filename
        with open(file_path, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)
        
        result = detect_buzz(str(file_path))
        file_path.unlink()
        
        return result
    except Exception as e:
        logger.error(f"Buzz detection error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# ============================================================================
# TUNER ENDPOINTS
# ============================================================================
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
        logger.error(f"Frequency detection error: {e}")
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
        
        freq_result = detect_frequency(str(file_path))
        
        if "error" in freq_result or freq_result.get("frequency", 0) <= 0:
            raise HTTPException(status_code=400, detail="Could not detect frequency")
        
        result = get_tuning_deviation(freq_result["frequency"], target_note)
        file_path.unlink()
        
        return result
    except Exception as e:
        logger.error(f"Tuning deviation error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# ============================================================================
# CHORD CONVERTER ENDPOINTS
# ============================================================================
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
        logger.error(f"Chord conversion error: {e}")
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
        logger.error(f"Chord variations error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# ============================================================================
# AUDIO SPLITTER ENDPOINTS (Mac-Safe with Memory Protection)
# ============================================================================
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
        - stems: Array of stem objects
        - sample_rate: Sample rate of output files
    """
    # Check if model is ready
    if not _model_ready.is_set():
        logger.warning("Split requested but model still loading...")
        raise HTTPException(
            status_code=503,
            detail="Model is still loading. Please wait and try again in a moment. Check /api/model-status for progress."
        )
    
    try:
        # Generate session ID if not provided
        if not session_id:
            session_id = str(uuid.uuid4())
        
        logger.info(f"🎵 Starting split for session: {session_id}")
        
        # Create session output directory
        session_output_dir = OUTPUT_DIR / session_id
        session_output_dir.mkdir(exist_ok=True)
        
        # Save uploaded file
        file_path = UPLOAD_DIR / f"{session_id}_{file.filename}"
        with open(file_path, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)
        
        logger.info(f"   File saved: {file_path.name} ({file_path.stat().st_size / 1024 / 1024:.1f} MB)")
        
        # Get the thread-safe splitter engine
        engine = get_splitter_engine()
        
        # Progress callback for logging
        def log_progress(pct: int):
            logger.info(f"   Progress: {pct}%")
        
        # Process audio with the splitter engine
        # Wrapped in try/except for MemoryError protection
        try:
            result = engine.split_audio(
                str(file_path),
                output_dir=str(session_output_dir),
                progress_callback=log_progress
            )
        except MemoryError as me:
            logger.error(f"❌ MemoryError during split: {me}")
            logger.error("   This is common on MacBook Air with limited RAM.")
            logger.error("   Try a shorter audio file or close other applications.")
            raise HTTPException(
                status_code=500,
                detail="Out of memory. Try a shorter audio file (under 3 minutes) or close other applications."
            )
        except torch.cuda.OutOfMemoryError as oom:
            logger.error(f"❌ GPU OutOfMemoryError: {oom}")
            raise HTTPException(
                status_code=500,
                detail="GPU out of memory. Try a shorter audio file."
            )
        
        if not result.get("success"):
            logger.error(f"   Split failed: {result.get('error')}")
            raise HTTPException(status_code=500, detail=result.get("error", "Processing failed"))
        
        # Transform response to use URLs instead of file paths
        stems_array = []
        for stem_name, stem_data in result["stems"].items():
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
        
        logger.info(f"✅ Split complete for session: {session_id}")
        
        return {
            "success": True,
            "session_id": session_id,
            "stems": stems_array,
            "sample_rate": result["sample_rate"],
            "model_used": result["model_used"]
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"❌ Unexpected error during split: {e}", exc_info=True)
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
        logger.error(f"Audio info error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/audio-splitter/download/{stem_file}")
async def download_stem(stem_file: str):
    """Download a stem file"""
    try:
        file_path = UPLOAD_DIR / stem_file
        if not file_path.exists():
            raise HTTPException(status_code=404, detail="File not found")
        
        return FileResponse(file_path, media_type="audio/wav")
    except Exception as e:
        logger.error(f"Download error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# ============================================================================
# ROOT ENDPOINT
# ============================================================================
@app.get("/")
async def root():
    """API documentation"""
    return {
        "name": "Studio Sync API",
        "version": "1.1.0",
        "platform": sys.platform,
        "model_ready": _model_ready.is_set(),
        "endpoints": {
            "health": "/health",
            "model_status": "/api/model-status",
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
                "split": "/api/split",
                "info": "/api/audio-splitter/info",
                "download": "/api/audio-splitter/download/{stem_file}"
            }
        }
    }


# ============================================================================
# MAIN ENTRY POINT - CRITICAL FOR MACOS MULTIPROCESSING
# ============================================================================
# This guard prevents recursive process spawning on macOS
if __name__ == "__main__":
    import uvicorn
    
    # Log torch info
    logger.info(f"PyTorch version: {torch.__version__}")
    logger.info(f"MPS available: {torch.backends.mps.is_available() if hasattr(torch.backends, 'mps') else 'N/A'}")
    logger.info(f"CUDA available: {torch.cuda.is_available()}")
    
    # Run the server
    uvicorn.run(
        "api:app",
        host="0.0.0.0",
        port=8000,
        reload=True,
        log_level="info",
        workers=1  # CRITICAL: Single worker to prevent multiprocessing issues
    )
