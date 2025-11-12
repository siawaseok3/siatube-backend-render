// routes/getstreamurl.js
import express from 'express';
import ytdl from '@distube/ytdl-core';

const router = express.Router();

// クライアントIP取得
function getClientIp(req) {
  const xff = req.headers['x-forwarded-for'];
  return (xff ? xff.split(',')[0] : req.ip)?.trim();
}

// レートリミット（1分に4回）
const rateLimiters = new Map();
function ipRateLimit(req, res, next) {
  const ip = getClientIp(req);
  const now = Date.now();
  const windowMs = 60 * 1000;
  const limit = 4;

  const timestamps = (rateLimiters.get(ip) || []).filter(ts => now - ts < windowMs);
  if (timestamps.length >= limit) {
    return res.status(429).json({ error: 'Rate limit exceeded' });
  }

  timestamps.push(now);
  rateLimiters.set(ip, timestamps);
  next();
}

router.get('/:videoId', ipRateLimit, async (req, res) => {
  const { videoId } = req.params;
  const ip = getClientIp(req);
  const webappname = req.cookies?.webappname?.trim();

  if (!ip) {
    console.log(`[BLOCK] IPが取得できませんでした。アクセス拒否 IP: ${ip}`);
    return res.status(403).json({ error: 'Forbidden: blocked (no IP)' });
  }
  if (webappname !== 'siatube') {
    console.log(`[BLOCK] Cookie webappnameが不正です。アクセス拒否 Cookie: ${webappname}`);
    return res.status(403).json({ error: 'Forbidden: blocked (invalid cookie)' });
  }

  try {
    const url = `https://www.youtube.com/watch?v=${videoId}`;

    // 日本語環境っぽく振る舞う
    const info = await ytdl.getInfo(url, {
      requestOptions: {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
          'Accept-Language': 'ja-JP,ja;q=0.9',
        }
      }
    });

    const result = {};

    // muxed 360p（動画＋音声、日本語の可能性高）
    const muxed360p = info.formats.find(
      (f) => f.hasVideo && f.hasAudio && f.height === 360
    );
    result.muxed360p = { url: muxed360p?.url || null };

    // 日本語音声：itag=140（m4a）
    const japaneseAudio = info.formats.find(
      (f) => f.itag === 140 && f.hasAudio && !f.hasVideo
    );

    // 対象解像度（WebMの映像）と日本語音声を組み合わせ
    const targetResolutions = [4320, 2160, 1440, 1080, 720];

    for (const height of targetResolutions) {
      const video = info.formats.find(
        (f) => f.container === 'webm' && f.height === height && f.hasVideo && !f.hasAudio
      );

      if (video && japaneseAudio) {
        result[`${height}p`] = {
          video: { url: video.url },
          audio: { url: japaneseAudio.url },
        };
      }
    }

    res.json(result);
  } catch (err) {
    console.error(`[ERROR] 動画ID ${videoId} の情報取得中にエラーが発生しました:`, err.message);
    res.status(500).json({ error: 'Failed to fetch stream URLs' });
  }
});


export default router;