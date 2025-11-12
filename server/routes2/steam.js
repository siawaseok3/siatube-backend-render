// server.js
import express from "express";
import ytdl from "@distube/ytdl-core";

const app = express();
const PORT = 3010;

app.get("/api/streams/:videoId", async (req, res) => {
  const { videoId } = req.params;

  if (!videoId || !ytdl.validateID(videoId)) {
    return res.status(400).json({ error: "有効な videoId が必要です" });
  }

  try {
    const info = await ytdl.getInfo(videoId);
    if (!info) {
      return res.status(404).json({ error: "動画情報が取得できませんでした" });
    }

    // 🎯 何も加工せずにそのまま返す
    res.json(info);

  } catch (err) {
    console.error("❌ getInfo error:", err);
    res.status(500).json({ error: "動画情報の取得中にエラーが発生しました" });
  }
});

app.listen(PORT, () => {
  console.log(`✅ Server running on http://localhost:${PORT}`);
});