from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

app = FastAPI()

# CORS configuration
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Your Vercel frontend URL
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/")
async def root():
    return {"status": "ok", "message": "Backend is running"}

@app.get("/health")
async def health():
    return {"status": "healthy"}
import shutil
import tempfile
import threading
import logging
import queue
import asyncio
import psutil
from pathlib import Path
from typing import Dict, Optional, AsyncGenerator, Callable, Any, TYPE_CHECKING
from contextlib import contextmanager, asynccontextmanager
from enum import Enum

# ============================================================================
# Configure logging BEFORE importing heavy libraries
# ============================================================================
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger("studio-sync")
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
from fastapi import FastAPI, UploadFile, File, HTTPException, Query, Form, Body
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, StreamingResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

# ============================================================================
# Import audio processing modules (AFTER environment setup)
# ============================================================================
AUDIO_SPLITTER_AVAILABLE = False

# Import with proper fallback
try:
    from scripts.audio_splitter import SplitterEngine, get_stem_info, compute_file_hash
    AUDIO_SPLITTER_AVAILABLE = True
    logger.info("✅ Audio splitter module loaded successfully")
except ImportError as e:
    logger.warning(f"⚠️  Audio splitter import failed: {e}")
    logger.warning("    Attempting to import from current directory...")
    try:
        # Try importing from current directory (if script is in same folder)
        sys.path.insert(0, str(Path(__file__).parent))
        from audio_splitter import SplitterEngine, get_stem_info, compute_file_hash  # type: ignore
        AUDIO_SPLITTER_AVAILABLE = True
        logger.info("✅ Audio splitter loaded from current directory")
    except ImportError as e2:
        logger.error(f"❌ Could not load audio splitter module: {e2}")
        logger.error("    API will run in limited mode without audio processing")
        
        # Define dummy class and functions for type safety
        class SplitterEngine:  # type: ignore
            def __init__(self, *args: Any, **kwargs: Any) -> None:
                raise RuntimeError("SplitterEngine not available - audio_splitter.py not found")
        
        def get_stem_info(*args: Any, **kwargs: Any) -> Dict[str, Any]:  # type: ignore
            raise HTTPException(status_code=501, detail="Audio splitter module not available")
        
        def compute_file_hash(*args: Any, **kwargs: Any) -> str:  # type: ignore
            raise HTTPException(status_code=501, detail="Audio splitter module not available")

import torch

# ============================================================================
# YouTube Download Support (Optional)
# ============================================================================
try:
    from scripts import async_download_youtube_audio, YOUTUBE_DIR
    YOUTUBE_SUPPORT = True
    logger.info("✅ YouTube download support available")
except ImportError:
    logger.warning("⚠️  YouTube download support not available")
    YOUTUBE_SUPPORT = False
    YOUTUBE_DIR = None
    async def async_download_youtube_audio(*args, **kwargs):
        raise HTTPException(status_code=501, detail="YouTube support not installed")

# ============================================================================
# Directory Setup
# ============================================================================
UPLOAD_DIR = Path(tempfile.gettempdir()) / "studio-sync-uploads"
UPLOAD_DIR.mkdir(exist_ok=True)

OUTPUT_DIR = Path(tempfile.gettempdir()) / "studio-sync-outputs"
OUTPUT_DIR.mkdir(exist_ok=True)

# ============================================================================
# Enums and Models
# ============================================================================
class SplitMode(str, Enum):
    FAST = "fast"       # htdemucs - 4 stems
    DETAILED = "detailed"  # htdemucs_6s - 6 stems


class ChordVariationRequest(BaseModel):
    root: str
    chord_type: Optional[str] = "maj"


# ============================================================================
# SSE Progress Streaming Classes
# ============================================================================
class ProgressStreamer:
    """Thread-safe progress event streamer for SSE"""
    
    def __init__(self):
        self.queue: queue.Queue = queue.Queue()
        self.done = threading.Event()
    
    def send_progress(self, percent: int, stage: str, detail: str = ""):
        """Send progress event"""
        event = {
            "type": "progress",
            "percent": percent,
            "stage": stage,
            "detail": detail
        }
        self.queue.put(event)
    
    def send_complete(self, data: dict):
        """Send completion event"""
        event = {
            "type": "complete",
            "data": data
        }
        self.queue.put(event)
        self.done.set()
    
    def send_error(self, error: str):
        """Send error event"""
        event = {
            "type": "error",
            "error": error
        }
        self.queue.put(event)
        self.done.set()
    
    def send_metadata(self, metadata: dict):
        """Send metadata event (for YouTube info)"""
        event = {
            "type": "metadata",
            **metadata
        }
        self.queue.put(event)


async def generate_sse_stream(streamer: ProgressStreamer) -> AsyncGenerator[str, None]:
    """
    Generate Server-Sent Events stream from ProgressStreamer
    
    Yields SSE-formatted strings
    """
    while not streamer.done.is_set():
        try:
            # Non-blocking get with timeout
            event = streamer.queue.get(timeout=0.1)
            
            # Format as SSE
            event_type = event.pop("type", "message")
            sse_data = f"event: {event_type}\ndata: {json.dumps(event)}\n\n"
            
            yield sse_data
            
        except queue.Empty:
            # Send keepalive comment every 100ms
            yield ": keepalive\n\n"
            await asyncio.sleep(0.1)
    
    # Drain remaining events
    while not streamer.queue.empty():
        try:
            event = streamer.queue.get_nowait()
            event_type = event.pop("type", "message")
            sse_data = f"event: {event_type}\ndata: {json.dumps(event)}\n\n"
            yield sse_data
        except queue.Empty:
            break


# ============================================================================
# Dual-Mode Engine Management
# ============================================================================
_splitter_engines: Dict[str, Any] = {}
_engine_locks: Dict[str, threading.Lock] = {
    "fast": threading.Lock(),
    "detailed": threading.Lock()
}
_model_ready: Dict[str, threading.Event] = {
    "fast": threading.Event(),
    "detailed": threading.Event()
}

MODEL_CONFIG = {
    "fast": {"name": "htdemucs", "stems": 4, "description": "4-Stem Fast Mode"},
    "detailed": {"name": "htdemucs_6s", "stems": 6, "description": "6-Stem Pro Mode"}
}


def get_splitter_engine(mode: str) -> Any:
    """Thread-safe singleton access to splitter engines by mode"""
    global _splitter_engines
    
    if not AUDIO_SPLITTER_AVAILABLE:
        raise HTTPException(
            status_code=503, 
            detail="Audio splitter module not available. Please check that audio_splitter.py exists in the scripts/ directory."
        )
    
    if mode not in _splitter_engines:
        with _engine_locks[mode]:
            if mode not in _splitter_engines:
                model_name = MODEL_CONFIG[mode]["name"]
                logger.info(f"Creating SplitterEngine for {mode} mode ({model_name})...")
                _splitter_engines[mode] = SplitterEngine(
                    model_name=model_name,
                    mock_mode=False
                )
                _model_ready[mode].set()
                logger.info(f"SplitterEngine [{mode}] ready!")
    
    return _splitter_engines[mode]


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
                        logger.info(f"Cleaning up old session: {session_dir.name}")
                        shutil.rmtree(session_dir, ignore_errors=True)
        except Exception as e:
            logger.error(f"Cleanup error: {e}")
        time.sleep(3600)  # Run every hour


# ============================================================================
# Lifespan Context Manager (Modern FastAPI approach)
# ============================================================================
@asynccontextmanager
async def lifespan(app: FastAPI):
    """Lifespan context manager for startup/shutdown events"""
    # Startup
    logger.info("=" * 60)
    logger.info("Studio Sync API Starting Up...")
    logger.info("=" * 60)
    logger.info(f"Platform: {sys.platform}")
    logger.info(f"Python: {sys.version}")
    logger.info(f"PyTorch: {torch.__version__}")
    logger.info(f"OMP_NUM_THREADS: {os.environ.get('OMP_NUM_THREADS', 'not set')}")
    logger.info(f"YouTube Support: {YOUTUBE_SUPPORT}")
    logger.info(f"Audio Splitter Available: {AUDIO_SPLITTER_AVAILABLE}")
    
    # Pre-load models in background (only if audio splitter is available)
    if AUDIO_SPLITTER_AVAILABLE:
        def preload_models():
            try:
                logger.info("Loading htdemucs_6s model (6-stem detailed)...")
                get_splitter_engine("detailed")
                logger.info("Loading htdemucs model (4-stem fast)...")
                get_splitter_engine("fast")
                logger.info("All models loaded successfully!")
            except Exception as e:
                logger.error(f"Failed to load models: {e}")
        
        model_thread = threading.Thread(target=preload_models, daemon=True)
        model_thread.start()
    else:
        logger.warning("⚠️  Skipping model preload - audio splitter not available")
    
    # Start cleanup thread
    cleanup_thread = threading.Thread(target=cleanup_old_outputs, daemon=True)
    cleanup_thread.start()
    
    logger.info("API endpoints are now available")
    
    yield  # App is running
    
    # Shutdown
    logger.info("Studio Sync API shutting down...")
    global _splitter_engines
    for engine in _splitter_engines.values():
        if hasattr(engine, 'device') and engine.device and engine.device.type == "cuda":
            torch.cuda.empty_cache()
    logger.info("Goodbye!")


# ============================================================================
# FastAPI Application Setup
# ============================================================================
app = FastAPI(
    title="Studio Sync API",
    description="Real-time audio processing API with SSE streaming",
    version="2.0.0",
    lifespan=lifespan
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://localhost:3000", "http://localhost:8080", "*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Mount outputs directory for serving stems
app.mount("/outputs", StaticFiles(directory=str(OUTPUT_DIR)), name="outputs")


# ============================================================================
# Helper Functions
# ============================================================================
def run_split_with_progress(
    file_path: Path,
    session_id: str,
    mode: str,
    streamer: ProgressStreamer
):
    """Run audio splitting in a thread with progress updates and smart caching"""
    try:
        engine = get_splitter_engine(mode)
        
        # Progress callback that sends SSE events
        def progress_callback(pct: int, stage: str):
            stem_count = MODEL_CONFIG[mode]["stems"]
            detail = f"{stem_count}-stem separation"
            streamer.send_progress(pct, stage, detail)
        
        # Run the split with cache checking
        result = engine.split_audio(
            str(file_path),
            progress_callback=progress_callback,
            check_cache=True,
            output_base_dir=str(OUTPUT_DIR),
            mode=mode
        )
        
        if not result.get("success"):
            streamer.send_error(result.get("error", "Processing failed"))
            return
        
        # Get the file hash for URL construction
        file_hash = result.get("file_hash", session_id)
        cache_hit = result.get("cache_hit", False)
        
        # Transform response
        stems_array = []
        for stem_name, stem_data in result["stems"].items():
            stem_path = Path(stem_data["path"])
            # URL path reflects cache structure: /outputs/{hash}/{mode}/{filename}
            stem_url = f"/outputs/{file_hash}/{mode}/{stem_path.name}"
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
        
        streamer.send_complete({
            "success": True,
            "session_id": session_id,
            "file_hash": file_hash,
            "stems": stems_array,
            "sample_rate": result["sample_rate"],
            "model_used": result["model_used"],
            "mode": mode,
            "cache_hit": cache_hit
        })
        
    except MemoryError as me:
        logger.error(f"MemoryError during split: {me}")
        streamer.send_error("Out of memory. Try a shorter audio file (under 3 minutes).")
    except Exception as e:
        logger.error(f"Error during split: {e}", exc_info=True)
        streamer.send_error(str(e))


# ============================================================================
# MAIN ENDPOINTS
# ============================================================================

@app.get("/")
async def root():
    return {
        "name": "Studio Sync API",
        "version": "2.0.0",
        "features": ["SSE streaming", "Dual-mode engine", "Real-time progress", "Smart caching"],
        "audio_splitter_available": AUDIO_SPLITTER_AVAILABLE,
        "endpoints": {
            "health": "/health",
            "status": "/api/status",
            "split_stream": "/api/split/stream (POST with SSE)" if AUDIO_SPLITTER_AVAILABLE else "disabled",
            "split": "/api/split (POST)" if AUDIO_SPLITTER_AVAILABLE else "disabled",
            "split_youtube": "/api/split-youtube/stream (POST with SSE)" if (YOUTUBE_SUPPORT and AUDIO_SPLITTER_AVAILABLE) else "disabled",
            "model_status": "/api/model-status"
        }
    }


@app.get("/health")
async def health_check():
    """Check if API is running"""
    return {
        "status": "ok",
        "message": "Studio Sync API is running",
        "audio_splitter_available": AUDIO_SPLITTER_AVAILABLE,
        "models": {
            "fast": _model_ready["fast"].is_set() if AUDIO_SPLITTER_AVAILABLE else False,
            "detailed": _model_ready["detailed"].is_set() if AUDIO_SPLITTER_AVAILABLE else False
        }
    }


@app.get("/api/status")
async def get_system_status():
    """Get comprehensive system status including memory usage"""
    process = psutil.Process()
    memory_info = process.memory_info()
    
    # Get model info
    models_info = {}
    if AUDIO_SPLITTER_AVAILABLE:
        for mode, config in MODEL_CONFIG.items():
            is_ready = _model_ready[mode].is_set()
            engine = _splitter_engines.get(mode)
            models_info[mode] = {
                "ready": is_ready,
                "model_name": config["name"],
                "stems": config["stems"],
                "description": config["description"],
                "device": str(engine.device) if engine and hasattr(engine, 'device') else "not loaded"
            }
    else:
        models_info = {
            "error": "Audio splitter module not available"
        }
    
    return {
        "online": True,
        "platform": sys.platform,
        "python_version": sys.version.split()[0],
        "pytorch_version": torch.__version__,
        "memory": {
            "rss_mb": round(memory_info.rss / 1024 / 1024, 1),
            "vms_mb": round(memory_info.vms / 1024 / 1024, 1),
            "percent": round(process.memory_percent(), 1)
        },
        "cpu_percent": round(process.cpu_percent(), 1),
        "models": models_info,
        "mps_available": torch.backends.mps.is_available() if hasattr(torch.backends, 'mps') else False,
        "cuda_available": torch.cuda.is_available(),
        "youtube_support": YOUTUBE_SUPPORT,
        "audio_splitter_available": AUDIO_SPLITTER_AVAILABLE
    }


@app.get("/api/model-status")
async def model_status():
    """Get detailed model loading status"""
    if not AUDIO_SPLITTER_AVAILABLE:
        return {
            "error": "Audio splitter module not available",
            "models": {}
        }
    
    models = {}
    for mode, config in MODEL_CONFIG.items():
        engine = _splitter_engines.get(mode)
        models[mode] = {
            "ready": _model_ready[mode].is_set(),
            "model_name": config["name"],
            "stems": config["stems"],
            "device": str(engine.device) if engine and hasattr(engine, 'device') and engine.device else "not loaded",
            "sources": list(engine.model.sources) if engine and hasattr(engine, 'model') and engine.model else []
        }
    return {"models": models}


# ============================================================================
# SSE STREAMING ENDPOINTS
# ============================================================================

@app.post("/api/split/stream")
async def split_audio_stream(
    file: UploadFile = File(...),
    mode: str = Form(default="detailed"),
    session_id: Optional[str] = Form(default=None)
):
    """
    Split audio with real-time SSE progress streaming
    
    Args:
        file: Audio file to split
        mode: 'fast' (4-stem) or 'detailed' (6-stem)
        session_id: Optional session ID
    
    Returns:
        StreamingResponse with SSE events
    """
    # Check if audio splitter is available
    if not AUDIO_SPLITTER_AVAILABLE:
        raise HTTPException(
            status_code=503,
            detail="Audio splitter module not available. Please ensure audio_splitter.py is in the scripts/ directory."
        )
    
    # Validate mode
    if mode not in ["fast", "detailed"]:
        raise HTTPException(status_code=400, detail=f"Invalid mode: {mode}. Use 'fast' or 'detailed'")
    
    # Check if model is ready
    if not _model_ready[mode].is_set():
        raise HTTPException(
            status_code=503,
            detail=f"Model for {mode} mode is still loading. Please wait."
        )
    
    # Generate session ID
    if not session_id:
        session_id = str(uuid.uuid4())
    
    logger.info(f"Starting SSE split for session: {session_id} (mode: {mode})")
    
    # Save uploaded file
    file_path = UPLOAD_DIR / f"{session_id}_{file.filename}"
    with open(file_path, "wb") as buffer:
        shutil.copyfileobj(file.file, buffer)
    
    logger.info(f"File saved: {file_path.name} ({file_path.stat().st_size / 1024 / 1024:.1f} MB)")
    
    # Create progress streamer
    streamer = ProgressStreamer()
    
    # Start processing in background thread
    thread = threading.Thread(
        target=run_split_with_progress,
        args=(file_path, session_id, mode, streamer)
    )
    thread.start()
    
    # Return SSE stream
    return StreamingResponse(
        generate_sse_stream(streamer),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no"  # Disable nginx buffering
        }
    )


@app.post("/api/split-youtube/stream")
async def split_youtube_stream(
    body: dict = Body(...)
):
    """
    Download YouTube audio and split into stems with SSE progress and smart persistence.
    
    Args:
        body: {"url": str, "mode": "fast"|"detailed"}
    
    Returns:
        StreamingResponse with SSE events
    """
    if not YOUTUBE_SUPPORT:
        raise HTTPException(status_code=501, detail="YouTube support not installed")
    
    if not AUDIO_SPLITTER_AVAILABLE:
        raise HTTPException(status_code=503, detail="Audio splitter module not available")
    
    url = body.get("url")
    mode = body.get("mode", "detailed")
    
    if not url:
        raise HTTPException(status_code=400, detail="Missing YouTube URL")
    if mode not in ["fast", "detailed"]:
        raise HTTPException(status_code=400, detail=f"Invalid mode: {mode}")
    if not _model_ready[mode].is_set():
        raise HTTPException(status_code=503, detail=f"Model for {mode} mode is still loading.")

    session_id = str(uuid.uuid4())
    streamer = ProgressStreamer()

    async def process():
        try:
            streamer.send_progress(2, "Downloading from YouTube...")
            result = await async_download_youtube_audio(url, YOUTUBE_DIR)
            file_path = result["file_path"]
            
            # Send metadata
            streamer.send_metadata({
                "title": result["title"],
                "thumbnail": result.get("thumbnail", ""),
                "duration": result["duration"],
                "cached": result.get("cached", False)
            })
            
            # Check for cached stems
            engine = get_splitter_engine(mode)
            file_hash = compute_file_hash(str(file_path))
            cache_dir = OUTPUT_DIR / file_hash / mode
            
            if cache_dir.exists() and any(cache_dir.glob("*.wav")):
                # Return cached stems immediately
                stems_array = []
                for stem_file in cache_dir.glob("*.wav"):
                    stem_name = stem_file.stem.split("_")[1] if "_" in stem_file.stem else stem_file.stem
                    stems_array.append({
                        "name": stem_name,
                        "url": f"/outputs/{file_hash}/{mode}/{stem_file.name}",
                        "mime_type": "audio/wav",
                        "duration": None,
                        "rms_db": None,
                        "peak_db": None
                    })
                
                streamer.send_complete({
                    "success": True,
                    "session_id": session_id,
                    "file_hash": file_hash,
                    "stems": stems_array,
                    "sample_rate": None,
                    "model_used": mode,
                    "mode": mode,
                    "cache_hit": True
                })
                return
            
            # Not cached, run splitter
            def cb(pct, stage):
                streamer.send_progress(pct, stage)
            
            split_result = engine.split_audio(
                file_path,
                progress_callback=cb,
                check_cache=True,
                output_base_dir=str(OUTPUT_DIR),
                mode=mode
            )
            
            if not split_result.get("success"):
                streamer.send_error(split_result.get("error", "Processing failed"))
                return
            
            file_hash = split_result.get("file_hash", session_id)
            stems_array = []
            for stem_name, stem_data in split_result["stems"].items():
                stem_path = Path(stem_data["path"])
                stem_url = f"/outputs/{file_hash}/{mode}/{stem_path.name}"
                stems_array.append({
                    "name": stem_name,
                    "url": stem_url,
                    "mime_type": "audio/wav",
                    "duration": stem_data["duration"],
                    "rms_db": stem_data["rms_db"],
                    "peak_db": stem_data["peak_db"]
                })
            
            streamer.send_complete({
                "success": True,
                "session_id": session_id,
                "file_hash": file_hash,
                "stems": stems_array,
                "sample_rate": split_result["sample_rate"],
                "model_used": split_result["model_used"],
                "mode": mode,
                "cache_hit": split_result.get("cache_hit", False)
            })
            
        except Exception as e:
            logger.error(f"YouTube split error: {e}", exc_info=True)
            streamer.send_error(str(e))

    # Start processing task
    asyncio.create_task(process())

    return StreamingResponse(
        generate_sse_stream(streamer),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no"
        }
    )


# ============================================================================
# LEGACY / NON-STREAMING ENDPOINTS
# ============================================================================

@app.post("/api/split")
async def split_audio_endpoint(
    file: UploadFile = File(...),
    mode: str = Query(default="detailed"),
    session_id: Optional[str] = Query(default=None)
):
    """
    Split audio (non-streaming version for backward compatibility)
    """
    if not AUDIO_SPLITTER_AVAILABLE:
        raise HTTPException(
            status_code=503,
            detail="Audio splitter module not available"
        )
    
    if mode not in ["fast", "detailed"]:
        raise HTTPException(status_code=400, detail=f"Invalid mode: {mode}")
    
    if not _model_ready[mode].is_set():
        raise HTTPException(status_code=503, detail=f"Model for {mode} mode is still loading.")
    
    if not session_id:
        session_id = str(uuid.uuid4())
    
    logger.info(f"Starting split for session: {session_id} (mode: {mode})")
    
    file_path = UPLOAD_DIR / f"{session_id}_{file.filename}"
    with open(file_path, "wb") as buffer:
        shutil.copyfileobj(file.file, buffer)
    
    try:
        engine = get_splitter_engine(mode)
        
        def log_progress(pct: int, stage: str):
            logger.info(f"Progress: {pct}% - {stage}")
        
        result = engine.split_audio(
            str(file_path),
            progress_callback=log_progress,
            check_cache=True,
            output_base_dir=str(OUTPUT_DIR),
            mode=mode
        )
        
        if not result.get("success"):
            raise HTTPException(status_code=500, detail=result.get("error", "Processing failed"))
        
        file_hash = result.get("file_hash", session_id)
        cache_hit = result.get("cache_hit", False)
        
        stems_array = []
        for stem_name, stem_data in result["stems"].items():
            stem_path = Path(stem_data["path"])
            stem_url = f"/outputs/{file_hash}/{mode}/{stem_path.name}"
            stems_array.append({
                "name": stem_name,
                "url": stem_url,
                "mime_type": "audio/wav",
                "duration": stem_data["duration"],
                "rms_db": stem_data["rms_db"],
                "peak_db": stem_data["peak_db"]
            })
        
        file_path.unlink(missing_ok=True)
        
        return {
            "success": True,
            "session_id": session_id,
            "file_hash": file_hash,
            "stems": stems_array,
            "sample_rate": result["sample_rate"],
            "model_used": result["model_used"],
            "mode": mode,
            "cache_hit": cache_hit
        }
        
    except MemoryError:
        raise HTTPException(status_code=500, detail="Out of memory. Try a shorter audio file.")
    except Exception as e:
        logger.error(f"Error during split: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


# Legacy endpoint alias
@app.post("/api/audio-splitter/split")
async def split_audio_legacy(file: UploadFile = File(...)):
    """Legacy endpoint for backward compatibility"""
    return await split_audio_endpoint(file)


# ============================================================================
# OTHER AUDIO TOOL ENDPOINTS
# ============================================================================

@app.post("/api/audio-splitter/info")
async def get_audio_info(file: UploadFile = File(...)):
    """Get audio file information"""
    if not AUDIO_SPLITTER_AVAILABLE:
        raise HTTPException(status_code=503, detail="Audio splitter module not available")
    
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
# MAIN ENTRY POINT (macOS safe)
# ============================================================================
if __name__ == "__main__":
    import uvicorn
    logger.info(f"PyTorch version: {torch.__version__}")
    logger.info(f"MPS available: {torch.backends.mps.is_available() if hasattr(torch.backends, 'mps') else 'N/A'}")
    logger.info(f"CUDA available: {torch.cuda.is_available()}")
    
    uvicorn.run(
        "api:app",
        host="0.0.0.0",
        port=8000,
        reload=True,
        log_level="info",
        workers=1
    )