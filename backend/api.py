import sys, os, json, time, uuid, shutil, tempfile, threading, logging, queue, asyncio, psutil, warnings
from pathlib import Path
from typing import Dict, Optional, AsyncGenerator, Any
from contextlib import contextmanager, asynccontextmanager
from enum import Enum

from fastapi import FastAPI, UploadFile, File, HTTPException, Query, Form, Body
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, StreamingResponse
from fastapi.staticfiles import StaticFiles
import torch

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger("studio-sync")
logging.getLogger("demucs").setLevel(logging.DEBUG)

@contextmanager
def suppress_c_stderr():
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

with suppress_c_stderr():
    import librosa
    import soundfile

warnings.filterwarnings("ignore", message=".*id3.*")
logging.getLogger("pydub").setLevel(logging.ERROR)

AUDIO_SPLITTER_AVAILABLE = False
try:
    from scripts.audio_splitter import SplitterEngine, get_stem_info, compute_file_hash
    AUDIO_SPLITTER_AVAILABLE = True
    logger.info("✅ Audio splitter module loaded")
except ImportError:
    try:
        sys.path.insert(0, str(Path(__file__).parent))
        from audio_splitter import SplitterEngine, get_stem_info, compute_file_hash
        AUDIO_SPLITTER_AVAILABLE = True
        logger.info("✅ Audio splitter loaded from current directory")
    except ImportError as e:
        logger.error(f"❌ Could not load audio splitter: {e}")
        class SplitterEngine:
            def __init__(self, *args: Any, **kwargs: Any) -> None:
                raise RuntimeError("SplitterEngine not available")
        def get_stem_info(*args: Any, **kwargs: Any) -> Dict[str, Any]:
            raise HTTPException(status_code=501, detail="Audio splitter not available")
        def compute_file_hash(*args: Any, **kwargs: Any) -> str:
            raise HTTPException(status_code=501, detail="Audio splitter not available")

try:
    from scripts import async_download_youtube_audio, YOUTUBE_DIR
    YOUTUBE_SUPPORT = True
    logger.info("✅ YouTube download support available")
except ImportError:
    logger.warning("⚠️ YouTube download support not available")
    YOUTUBE_SUPPORT = False
    YOUTUBE_DIR = None
    async def async_download_youtube_audio(*args, **kwargs):
        raise HTTPException(status_code=501, detail="YouTube support not installed")

UPLOAD_DIR = Path(tempfile.gettempdir()) / "studio-sync-uploads"
UPLOAD_DIR.mkdir(exist_ok=True)
OUTPUT_DIR = Path(tempfile.gettempdir()) / "studio-sync-outputs"
OUTPUT_DIR.mkdir(exist_ok=True)

class SplitMode(str, Enum):
    FAST = "fast"
    DETAILED = "detailed"

class ProgressStreamer:
    def __init__(self):
        self.queue: queue.Queue = queue.Queue()
        self.done = threading.Event()
    
    def send_progress(self, percent: int, stage: str, detail: str = ""):
        self.queue.put({"type": "progress", "percent": percent, "stage": stage, "detail": detail})
    
    def send_complete(self, data: dict):
        self.queue.put({"type": "complete", "data": data})
        self.done.set()
    
    def send_error(self, error: str):
        self.queue.put({"type": "error", "error": error})
        self.done.set()
    
    def send_metadata(self, metadata: dict):
        self.queue.put({"type": "metadata", **metadata})

async def generate_sse_stream(streamer: ProgressStreamer) -> AsyncGenerator[str, None]:
    while not streamer.done.is_set():
        try:
            event = streamer.queue.get(timeout=0.1)
            event_type = event.pop("type", "message")
            yield f"event: {event_type}\ndata: {json.dumps(event)}\n\n"
        except queue.Empty:
            yield ": keepalive\n\n"
            await asyncio.sleep(0.1)
    
    while not streamer.queue.empty():
        try:
            event = streamer.queue.get_nowait()
            event_type = event.pop("type", "message")
            yield f"event: {event_type}\ndata: {json.dumps(event)}\n\n"
        except queue.Empty:
            break

_splitter_engines: Dict[str, Any] = {}
_engine_locks = {"fast": threading.Lock(), "detailed": threading.Lock()}
_model_ready = {"fast": threading.Event(), "detailed": threading.Event()}
MODEL_CONFIG = {
    "fast": {"name": "htdemucs", "stems": 4, "description": "4-Stem Fast Mode"},
    "detailed": {"name": "htdemucs_6s", "stems": 6, "description": "6-Stem Pro Mode"}
}

def get_splitter_engine(mode: str) -> Any:
    global _splitter_engines
    if not AUDIO_SPLITTER_AVAILABLE:
        raise HTTPException(status_code=503, detail="Audio splitter not available")
    if mode not in _splitter_engines:
        with _engine_locks[mode]:
            if mode not in _splitter_engines:
                model_name = MODEL_CONFIG[mode]["name"]
                logger.info(f"Creating SplitterEngine for {mode} mode ({model_name})...")
                _splitter_engines[mode] = SplitterEngine(model_name=model_name, mock_mode=False)
                _model_ready[mode].set()
                logger.info(f"SplitterEngine [{mode}] ready!")
    return _splitter_engines[mode]

def cleanup_old_outputs(max_age_hours: int = 24):
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
        time.sleep(3600)

@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("Studio Sync API Starting...")
    logger.info(f"Platform: {sys.platform}, Python: {sys.version.split()[0]}, PyTorch: {torch.__version__}")
    
    if AUDIO_SPLITTER_AVAILABLE:
        def preload_models():
            try:
                get_splitter_engine("detailed")
                get_splitter_engine("fast")
                logger.info("All models loaded!")
            except Exception as e:
                logger.error(f"Failed to load models: {e}")
        threading.Thread(target=preload_models, daemon=True).start()
    
    threading.Thread(target=cleanup_old_outputs, daemon=True).start()
    logger.info("API ready")
    yield
    logger.info("Shutting down...")
    for engine in _splitter_engines.values():
        if hasattr(engine, 'device') and engine.device and engine.device.type == "cuda":
            torch.cuda.empty_cache()

app = FastAPI(title="Studio Sync API", version="2.0.0", lifespan=lifespan)
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_credentials=True, allow_methods=["*"], allow_headers=["*"])
app.mount("/outputs", StaticFiles(directory=str(OUTPUT_DIR)), name="outputs")

def run_split_with_progress(file_path: Path, session_id: str, mode: str, streamer: ProgressStreamer):
    try:
        engine = get_splitter_engine(mode)
        
        def progress_callback(pct: int, stage: str):
            streamer.send_progress(pct, stage, f"{MODEL_CONFIG[mode]['stems']}-stem separation")
        
        result = engine.split_audio(str(file_path), progress_callback=progress_callback, check_cache=True, output_base_dir=str(OUTPUT_DIR), mode=mode)
        
        if not result.get("success"):
            streamer.send_error(result.get("error", "Processing failed"))
            return
        
        file_hash = result.get("file_hash", session_id)
        stems_array = []
        for stem_name, stem_data in result["stems"].items():
            stem_path = Path(stem_data["path"])
            stems_array.append({
                "name": stem_name,
                "url": f"/outputs/{file_hash}/{mode}/{stem_path.name}",
                "mime_type": "audio/wav",
                "duration": stem_data["duration"],
                "rms_db": stem_data["rms_db"],
                "peak_db": stem_data["peak_db"]
            })
        
        file_path.unlink(missing_ok=True)
        streamer.send_complete({
            "success": True,
            "session_id": session_id,
            "file_hash": file_hash,
            "stems": stems_array,
            "sample_rate": result["sample_rate"],
            "model_used": result["model_used"],
            "mode": mode,
            "cache_hit": result.get("cache_hit", False)
        })
    except MemoryError:
        streamer.send_error("Out of memory. Try a shorter audio file.")
    except Exception as e:
        logger.error(f"Error during split: {e}", exc_info=True)
        streamer.send_error(str(e))

@app.get("/")
async def root():
    return {"name": "Studio Sync API", "version": "2.0.0", "audio_splitter_available": AUDIO_SPLITTER_AVAILABLE}

@app.get("/health")
async def health_check():
    return {
        "status": "ok",
        "audio_splitter_available": AUDIO_SPLITTER_AVAILABLE,
        "models": {"fast": _model_ready["fast"].is_set(), "detailed": _model_ready["detailed"].is_set()}
    }

@app.get("/api/status")
async def get_system_status():
    process = psutil.Process()
    memory_info = process.memory_info()
    
    models_info = {}
    if AUDIO_SPLITTER_AVAILABLE:
        for mode, config in MODEL_CONFIG.items():
            engine = _splitter_engines.get(mode)
            models_info[mode] = {
                "ready": _model_ready[mode].is_set(),
                "model_name": config["name"],
                "stems": config["stems"],
                "description": config["description"],
                "device": str(engine.device) if engine and hasattr(engine, 'device') else "not loaded"
            }
    else:
        models_info = {"error": "Audio splitter not available"}
    
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
    if not AUDIO_SPLITTER_AVAILABLE:
        return {"error": "Audio splitter not available", "models": {}}
    
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

@app.post("/api/split/stream")
async def split_audio_stream(file: UploadFile = File(...), mode: str = Form(default="detailed"), session_id: Optional[str] = Form(default=None)):
    if not AUDIO_SPLITTER_AVAILABLE:
        raise HTTPException(status_code=503, detail="Audio splitter not available")
    if mode not in ["fast", "detailed"]:
        raise HTTPException(status_code=400, detail=f"Invalid mode: {mode}")
    if not _model_ready[mode].is_set():
        raise HTTPException(status_code=503, detail=f"Model for {mode} mode is still loading")
    
    if not session_id:
        session_id = str(uuid.uuid4())
    
    logger.info(f"Starting split: {session_id} (mode: {mode})")
    file_path = UPLOAD_DIR / f"{session_id}_{file.filename}"
    with open(file_path, "wb") as buffer:
        shutil.copyfileobj(file.file, buffer)
    logger.info(f"File saved: {file_path.name} ({file_path.stat().st_size / 1024 / 1024:.1f} MB)")
    
    streamer = ProgressStreamer()
    threading.Thread(target=run_split_with_progress, args=(file_path, session_id, mode, streamer)).start()
    
    return StreamingResponse(
        generate_sse_stream(streamer),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "Connection": "keep-alive", "X-Accel-Buffering": "no"}
    )

@app.post("/api/split-youtube/stream")
async def split_youtube_stream(body: dict = Body(...)):
    if not YOUTUBE_SUPPORT:
        raise HTTPException(status_code=501, detail="YouTube support not installed")
    if not AUDIO_SPLITTER_AVAILABLE:
        raise HTTPException(status_code=503, detail="Audio splitter not available")
    
    url = body.get("url")
    mode = body.get("mode", "detailed")
    
    if not url:
        raise HTTPException(status_code=400, detail="Missing YouTube URL")
    if mode not in ["fast", "detailed"]:
        raise HTTPException(status_code=400, detail=f"Invalid mode: {mode}")
    if not _model_ready[mode].is_set():
        raise HTTPException(status_code=503, detail=f"Model for {mode} mode is still loading")

    session_id = str(uuid.uuid4())
    streamer = ProgressStreamer()

    async def process():
        try:
            streamer.send_progress(2, "Downloading from YouTube...")
            result = await async_download_youtube_audio(url, YOUTUBE_DIR)
            file_path = result["file_path"]
            
            streamer.send_metadata({
                "title": result["title"],
                "thumbnail": result.get("thumbnail", ""),
                "duration": result["duration"],
                "cached": result.get("cached", False)
            })
            
            engine = get_splitter_engine(mode)
            file_hash = compute_file_hash(str(file_path))
            cache_dir = OUTPUT_DIR / file_hash / mode
            
            if cache_dir.exists() and any(cache_dir.glob("*.wav")):
                stems_array = []
                for stem_file in cache_dir.glob("*.wav"):
                    stem_name = stem_file.stem.split("_")[1] if "_" in stem_file.stem else stem_file.stem
                    stems_array.append({
                        "name": stem_name,
                        "url": f"/outputs/{file_hash}/{mode}/{stem_file.name}",
                        "mime_type": "audio/wav",
                        "duration": None, "rms_db": None, "peak_db": None
                    })
                streamer.send_complete({
                    "success": True, "session_id": session_id, "file_hash": file_hash,
                    "stems": stems_array, "sample_rate": None, "model_used": mode,
                    "mode": mode, "cache_hit": True
                })
                return
            
            def cb(pct, stage):
                streamer.send_progress(pct, stage)
            
            split_result = engine.split_audio(file_path, progress_callback=cb, check_cache=True, output_base_dir=str(OUTPUT_DIR), mode=mode)
            
            if not split_result.get("success"):
                streamer.send_error(split_result.get("error", "Processing failed"))
                return
            
            file_hash = split_result.get("file_hash", session_id)
            stems_array = []
            for stem_name, stem_data in split_result["stems"].items():
                stem_path = Path(stem_data["path"])
                stems_array.append({
                    "name": stem_name,
                    "url": f"/outputs/{file_hash}/{mode}/{stem_path.name}",
                    "mime_type": "audio/wav",
                    "duration": stem_data["duration"],
                    "rms_db": stem_data["rms_db"],
                    "peak_db": stem_data["peak_db"]
                })
            
            streamer.send_complete({
                "success": True, "session_id": session_id, "file_hash": file_hash,
                "stems": stems_array, "sample_rate": split_result["sample_rate"],
                "model_used": split_result["model_used"], "mode": mode,
                "cache_hit": split_result.get("cache_hit", False)
            })
        except Exception as e:
            logger.error(f"YouTube split error: {e}", exc_info=True)
            streamer.send_error(str(e))

    asyncio.create_task(process())
    return StreamingResponse(
        generate_sse_stream(streamer),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "Connection": "keep-alive", "X-Accel-Buffering": "no"}
    )

@app.post("/api/split")
async def split_audio_endpoint(file: UploadFile = File(...), mode: str = Query(default="detailed"), session_id: Optional[str] = Query(default=None)):
    if not AUDIO_SPLITTER_AVAILABLE:
        raise HTTPException(status_code=503, detail="Audio splitter not available")
    if mode not in ["fast", "detailed"]:
        raise HTTPException(status_code=400, detail=f"Invalid mode: {mode}")
    if not _model_ready[mode].is_set():
        raise HTTPException(status_code=503, detail=f"Model for {mode} mode is still loading")
    
    if not session_id:
        session_id = str(uuid.uuid4())
    
    file_path = UPLOAD_DIR / f"{session_id}_{file.filename}"
    with open(file_path, "wb") as buffer:
        shutil.copyfileobj(file.file, buffer)
    
    try:
        engine = get_splitter_engine(mode)
        result = engine.split_audio(str(file_path), progress_callback=lambda p, s: logger.info(f"Progress: {p}% - {s}"), check_cache=True, output_base_dir=str(OUTPUT_DIR), mode=mode)
        
        if not result.get("success"):
            raise HTTPException(status_code=500, detail=result.get("error", "Processing failed"))
        
        file_hash = result.get("file_hash", session_id)
        stems_array = []
        for stem_name, stem_data in result["stems"].items():
            stem_path = Path(stem_data["path"])
            stems_array.append({
                "name": stem_name,
                "url": f"/outputs/{file_hash}/{mode}/{stem_path.name}",
                "mime_type": "audio/wav",
                "duration": stem_data["duration"],
                "rms_db": stem_data["rms_db"],
                "peak_db": stem_data["peak_db"]
            })
        
        file_path.unlink(missing_ok=True)
        return {
            "success": True, "session_id": session_id, "file_hash": file_hash,
            "stems": stems_array, "sample_rate": result["sample_rate"],
            "model_used": result["model_used"], "mode": mode,
            "cache_hit": result.get("cache_hit", False)
        }
    except MemoryError:
        raise HTTPException(status_code=500, detail="Out of memory. Try a shorter audio file.")
    except Exception as e:
        logger.error(f"Error during split: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/audio-splitter/info")
async def get_audio_info(file: UploadFile = File(...)):
    if not AUDIO_SPLITTER_AVAILABLE:
        raise HTTPException(status_code=503, detail="Audio splitter not available")
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
    file_path = UPLOAD_DIR / stem_file
    if not file_path.exists():
        raise HTTPException(status_code=404, detail="File not found")
    return FileResponse(file_path, media_type="audio/wav")

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("api:app", host="0.0.0.0", port=8000, reload=True, log_level="info", workers=1)
