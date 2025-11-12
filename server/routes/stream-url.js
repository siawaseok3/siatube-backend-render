import express from "express";
import https from "https";
import fetch from "node-fetch";

const router = express.Router();

const CONFIG_URL =
  "https://raw.githubusercontent.com/siawaseok3/wakame/master/video_config.json";

// YouTube ID バリデーション
function validateYouTubeId(req, res, next) {
  const { id } = req.params;
  if (!/^[\w-]{11}$/.test(id)) {
    return res.status(400).json({ error: "validateYouTubeIdでエラー" });
  }
  next();
}

// 設定ファイル取得（キャッシュなし）
function fetchConfigJson(url) {
  return new Promise((resolve, reject) => {
    https
      .get(url, (res) => {
        let data = "";
        if (res.statusCode !== 200) {
          res.resume();
          return reject(new Error("fetchConfigJsonでエラー"));
        }

        res.on("data", (chunk) => (data += chunk));
        res.on("end", () => {
          try {
            const json = JSON.parse(data);
            resolve(json);
          } catch {
            reject(new Error("fetchConfigJsonでエラー"));
          }
        });
      })
      .on("error", () => reject(new Error("fetchConfigJsonでエラー")));
  });
}

// URL配列から lang=ja 優先して返す
function selectUrl(urls) {
  if (!urls || urls.length === 0) return null;
  const jaUrl = urls.find((u) => u.includes("lang=ja"));
  return encodeURIComponent(jaUrl || urls[0]);
}

const webmResolutions = {
  "4320p": 4320,
  "2160p": 2160,
  "1440p": 1440,
  "1080p": 1080,
  "720p": 720,
  "480p": 480,
};

// ================= Routes =================

// type1: 設定ファイルを読み込んで埋め込みURL返す
router.get("/:id", validateYouTubeId, async (req, res) => {
  const { id } = req.params;
  try {
    const config = await fetchConfigJson(CONFIG_URL);
    const params = config.params || "";
    res.json({ url: `https://www.youtubeeducation.com/embed/${id}${params}` });
  } catch {
    res.status(500).json({ error: "type1でエラー" });
  }
});

// type2: ローカルAPI取得のみ（WebM→MP4→AV1優先）
router.get("/:id/type2", validateYouTubeId, async (req, res) => {
  const { id } = req.params;
  const apiUrl = `http://127.0.0.1:3006/api/streams/${id}`;

  const parseHeight = (format) => {
    if (typeof format.height === "number") return format.height;
    const match = /x(\d+)/.exec(format.resolution || "");
    return match ? parseInt(match[1]) : null;
  };

  const selectUrlLocal = (urls) => {
    if (!urls?.length) return null;
    const jaUrl = urls.find((u) => decodeURIComponent(u).includes("lang=ja"));
    return jaUrl || urls[0];
  };

  try {
    const response = await fetch(apiUrl);
    if (!response.ok) throw new Error(`local API取得エラー: ${response.status}`);

    const data = await response.json();
    const formats = Array.isArray(data.formats) ? data.formats : [];

    const videourl = {};
    const m3u8 = {};

    // 音声専用URL
    const audioUrls = formats
      .filter((f) => f.acodec !== "none" && f.vcodec === "none")
      .map((f) => f.url);
    const audioOnlyUrl = selectUrlLocal(audioUrls);

    const extPriority = ["webm", "mp4", "av1"];

    // 解像度ごとにグループ化
    const formatsByHeight = {};
    for (const f of formats) {
      const height = parseHeight(f);
      if (!height || f.vcodec === "none" || !f.url) continue;
      const label = `${height}p`;
      if (!formatsByHeight[label]) formatsByHeight[label] = [];
      formatsByHeight[label].push(f);
    }

    // 各解像度ごとに videourl と m3u8 を選択
    for (const [label, list] of Object.entries(formatsByHeight)) {
      // m3u8 の中から lang=ja があれば優先
      const m3u8List = list.filter((f) => f.url.includes(".m3u8"));
      if (m3u8List.length > 0) {
        m3u8[label] = { url: { url: selectUrlLocal(m3u8List.map((f) => f.url)) } };
      }

      // 通常動画の優先順で 1 本選択
      const normalList = list
        .filter((f) => !f.url.includes(".m3u8"))
        .sort((a, b) => extPriority.indexOf(a.ext || "") - extPriority.indexOf(b.ext || ""));

      if (normalList.length > 0) {
        videourl[label] = {
          video: { url: selectUrlLocal([normalList[0].url]) },
          audio: { url: audioOnlyUrl },
        };
      }
    }

    res.json({ videourl, m3u8 });
  } catch (e) {
    console.error("type2 local API取得エラー:", e);
    res.status(500).json({ error: "type2でエラー" });
  }
});

// ダウンロード用
router.get("/download/:id", async (req, res) => {
  const { id } = req.params;

  try {
    const response = await fetch(`http://127.0.0.1:3006/api/streams/${id}`);
    if (!response.ok) {
      return res.status(response.status).json({ error: "Failed to fetch stream data" });
    }

    const data = await response.json();
    if (!data.formats || !Array.isArray(data.formats)) {
      return res.status(500).json({ error: "Invalid format data" });
    }

    const result = {
      "audio only": [],
      "video only": [],
      "audio&video": [],
      "m3u8 raw": [],
      "m3u8 proxy": [],
    };

    for (const f of data.formats) {
      if (!f.url) continue;

      const url = f.url.toLowerCase();

      // lang=jaのみ許可
      if (url.includes("lang=") && !url.includes("lang=ja")) continue;

      // m3u8判定
      if (url.endsWith(".m3u8")) {
        const m3u8Data = {
          url: f.url,
          resolution: f.resolution,
          vcodec: f.vcodec,
          acodec: f.acodec,
        };
        result["m3u8 raw"].push(m3u8Data);
        result["m3u8 proxy"].push({
          ...m3u8Data,
          url: `https://proxy-siawaseok.duckdns.org/proxy/m3u8?url=${encodeURIComponent(f.url)}`,
        });
        continue;
      }

      // audio / video 判定
      if (f.resolution === "audio only" || f.vcodec === "none") {
        result["audio only"].push(f);
      } else if (f.acodec === "none") {
        result["video only"].push(f);
      } else {
        result["audio&video"].push(f);
      }
    }

    res.json(result);
  } catch (err) {
    console.error("download route error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
