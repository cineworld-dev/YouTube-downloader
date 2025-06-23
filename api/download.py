import os
from fastapi import FastAPI, Query, HTTPException
from fastapi.responses import FileResponse
from yt_dlp import YoutubeDL
import uuid

app = FastAPI()

@app.get("/download")
async def download_audio(url: str = Query(..., description="YouTube video URL")):
    filename = f"/tmp/{uuid.uuid4()}.mp3"
    ydl_opts = {
        'format': 'bestaudio/best',
        'outtmpl': filename,
        'postprocessors': [{
            'key': 'FFmpegExtractAudio',
            'preferredcodec': 'mp3',
            'preferredquality': '192',
        }],
        'quiet': True,
        'no_warnings': True,
    }

    try:
        with YoutubeDL(ydl_opts) as ydl:
            ydl.download([url])
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Download failed: {str(e)}")

    if not os.path.exists(filename):
        raise HTTPException(status_code=404, detail="File not found after download")

    return FileResponse(filename, media_type="audio/mpeg", filename="music.mp3")
