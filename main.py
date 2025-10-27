#!/usr/bin/env python3
from fastapi import FastAPI, HTTPException
import asyncio
import subprocess
import json
import os

app = FastAPI()

YT_DLP_PATH = "yt-dlp"
DEFAULT_FORMAT = "bestvideo+bestaudio/best"
YT_DLP_TIMEOUT = 90
PROXY_URL = os.environ.get("YT_DLP_PROXY", "http://ytproxy-siawaseok.duckdns.org:3007")

yt_dlp_lock = asyncio.Lock()


async def run_yt_dlp(url: str):
    loop = asyncio.get_running_loop()
    try:
        proc = await asyncio.wait_for(
            loop.run_in_executor(
                None,
                lambda: subprocess.run(
                    [
                        YT_DLP_PATH,
                        "-f", DEFAULT_FORMAT,
                        "--proxy", PROXY_URL,
                        "-j", url,
                    ],
                    capture_output=True,
                    text=True,
                    check=True,
                ),
            ),
            timeout=YT_DLP_TIMEOUT,
        )
        return json.loads(proc.stdout)

    except asyncio.TimeoutError:
        raise HTTPException(status_code=504, detail="yt-dlp タイムアウト")
    except subprocess.CalledProcessError as e:
        raise HTTPException(status_code=500, detail=e.stderr)
    except json.JSONDecodeError as e:
        raise HTTPException(status_code=500, detail=f"JSON解析失敗: {e}")
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/yt-dlp/{video_id}")
async def yt_dlp_endpoint(video_id: str):
    url = f"https://www.youtube.com/watch?v={video_id}"
    async with yt_dlp_lock:
        info = await run_yt_dlp(url)
    return info


if __name__ == "__main__":
    import uvicorn
    port = int(os.environ.get("PORT", 8000))
    uvicorn.run(app, host="0.0.0.0", port=port)
