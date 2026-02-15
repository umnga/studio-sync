import os
from pathlib import Path
import yt_dlp

YOUTUBE_DIR = Path(os.getenv("YOUTUBE_DIR", "youtube_downloads"))
YOUTUBE_DIR.mkdir(exist_ok=True)

def download_youtube_audio(url: str, output_dir: Path = YOUTUBE_DIR):
    """
    Download audio from a YouTube URL using yt-dlp.
    Returns metadata and file path.
    """
    ydl_opts = {
        'format': 'bestaudio/best',
        'outtmpl': str(output_dir / '%(id)s.%(ext)s'),
        'noplaylist': True,
        'quiet': True,
        'no_warnings': True,
        'ignoreerrors': True,
        'postprocessors': [{
            'key': 'FFmpegExtractAudio',
            'preferredcodec': 'wav',
            'preferredquality': '192',
        }],
    }
    with yt_dlp.YoutubeDL(ydl_opts) as ydl:
        info = ydl.extract_info(url, download=True)
        if info is None:
            raise Exception("Failed to download video info.")
        file_path = output_dir / f"{info['id']}.wav"
        return {
            'title': info.get('title', ''),
            'duration': info.get('duration', 0),
            'file_path': str(file_path),
            'video_id': info['id'],
            'cached': file_path.exists(),
        }
