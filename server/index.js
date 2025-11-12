import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

// --- ESM での __dirname 取得 ---
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();

// --- 通常ミドルウェア ---
app.use(cookieParser());
app.use(express.json());
app.use(cors({ origin: true, credentials: true }));

// --- OpenVPN設定ファイル配布 ---
const ovpnPath = '/home/siawaseok/siawaseok.ovpn';
app.get('/vpn/config.ovpn', (req, res) => {
  if (!fs.existsSync(ovpnPath)) {
    return res.status(404).send('OVPN file not found');
  }
  res.download(ovpnPath, 'siawaseok.ovpn');
});

// --- ルーターインポート ---
import getStreamUrlRouter from './routes/getstreamurl.js';
import ytimg from "./routes/yt-img.js";
import suggestRouter from "./routes/suggest.js";
import searchRouter from "./routes/search.js";
import videoRouter from "./routes/video.js";
import commentRoute from "./routes/comment.js";
import channelRoute from "./routes/channel.js";
import playlistRouter from "./routes/playlist.js";
import streamUrlRouter from "./routes/stream-url.js";
import fallbackRoute from "./routes/fallback.js";
import watchIpRouter from './routes2/watchip.js';
import base64YtImg from "./routes2/base64-ytimg.js";
import video2 from "./routes2/video2.js";
import search2 from "./routes2/search2.js";

// --- APIルーティング ---
app.use('/api/streamurl', getStreamUrlRouter);
app.use("/api/search", searchRouter);
app.use("/api/suggest", suggestRouter);
app.use("/api/video", videoRouter);
app.use("/api/comments", commentRoute);
app.use("/api/channel", channelRoute);
app.use("/api/playlist", playlistRouter);
app.use("/api/stream", streamUrlRouter);
app.use("/api/yt-img", ytimg);
app.use("/api", fallbackRoute);

app.get("/api/trend", async (req, res) => {
  try {
    const response = await fetch(
      "https://raw.githubusercontent.com/siawaseok3/wakame/refs/heads/master/trend.json"
    );
    if (!response.ok) throw new Error("GitHubからの取得に失敗");
    const data = await response.json();
    res.json(data);
  } catch (error) {
    res.status(500).json({ error: error.message || "トレンドデータ取得失敗" });
  }
});

app.use('/server-ip', watchIpRouter);
app.use("/api/base64", base64YtImg);
app.use("/api/video2", video2);
app.use("/api/search2", search2);

// --- /exec リダイレクトルート追加 ---
app.get('/exec', (req, res) => {
  const q = req.query;

  if (q.video)   return res.redirect(`/api/video2/${encodeURIComponent(q.video)}`);
  if (q.stream)  return res.redirect(`/api/stream/${encodeURIComponent(q.stream)}`);
  if (q.stream2) return res.redirect(`/api/stream/${encodeURIComponent(q.stream2)}/type2`);
  if (q.channel) return res.redirect(`/api/channel/${encodeURIComponent(q.channel)}`);
  if (q.q)       return res.redirect(`/api/search2?q=${encodeURIComponent(q.q)}`);
  if ('trend' in q) return res.redirect(`/api/trend`);
  if (q.playlist) return res.redirect(`/api/playlist/${encodeURIComponent(q.playlist)}`);
  if (q.comments) return res.redirect(`/api/comments/${encodeURIComponent(q.comments)}`);

  return res.status(400).send('Invalid parameters.');
});

// --- 静的ファイル（Vueビルド済み） ---
const clientDistPath = path.join(__dirname, "../client/dist");
app.use(express.static(clientDistPath));
app.get(/^\/(?!api).*/, (req, res) => {
  res.sendFile(path.join(clientDistPath, "index.html"));
});

// --- HTTP サーバー起動（内部ポート 3000） ---
const PORT = 3000;
app.listen(PORT, () => {
  console.log(`✅ Node.js Server running on port ${PORT}`);
});