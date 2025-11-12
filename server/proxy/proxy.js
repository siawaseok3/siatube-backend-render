import express from "express";
import fetch from "node-fetch";
import { pipeline } from "stream";
import { promisify } from "util";

const streamPipeline = promisify(pipeline);
const app = express();
const PORT = 3004;

// あなたの公開ドメイン
const BASE_URL = "https://proxy-siawaseok.duckdns.org";

app.get("/proxy/m3u8", async (req, res) => {
  const targetUrl = req.query.url;
  if (!targetUrl) return res.status(400).send("url パラメータが必要です");

  try {
    const response = await fetch(targetUrl);
    const contentType = response.headers.get("content-type") || "";

    // ---- M3U8 プレイリストの場合 ----
    if (contentType.includes("application/vnd.apple.mpegurl") || targetUrl.endsWith(".m3u8")) {
      let body = await response.text();

      // .ts 行のみ書き換え（安全な正規表現）
      body = body.replace(/^([^#\n\r]+\.ts[^\n\r]*)$/gm, (match) => {
        const url = new URL(match.trim(), targetUrl);
        return `${BASE_URL}/proxy/m3u8?url=${encodeURIComponent(url.href)}`;
      });

      res.set("Content-Type", "application/vnd.apple.mpegurl");
      res.set("Access-Control-Allow-Origin", "*");
      res.send(body);

    // ---- TS または他のバイナリの場合 ----
    } else {
      res.set("Content-Type", contentType);
      res.set("Access-Control-Allow-Origin", "*");
      res.set("Access-Control-Allow-Headers", "Range");
      res.set("Access-Control-Expose-Headers", "Content-Length, Content-Range");
      await streamPipeline(response.body, res);
    }
  } catch (err) {
    res.status(500).send("エラー: " + err.message);
  }
});

app.listen(PORT, () => {
  console.log(`Proxy server running at http://localhost:${PORT}`);
});
