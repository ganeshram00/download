const express = require("express");
const cors = require("cors");
const ytdl = require("@distube/ytdl-core");
const axios = require("axios");
const cheerio = require("cheerio");
const fs = require("fs");
const { spawn } = require("child_process");
const tmp = require("tmp");
const path = require("path");
const { globSync } = require("glob"); // <- 💡 नया: फ़ाइल पैटर्न खोजने के लिए

const app = express();
const PORT = 4000;

// 💡 30 मिनट का फ़ॉलबैक टाइमर सेट किया गया
const FALLBACK_CLEANUP_TIME = 1 * 60 * 1000; // 30 मिनट
// 💡 1 मिनट का कैश क्लीनअप टाइमर
const CACHE_CLEANUP_INTERVAL = 1 * 60 * 1000; // 1 मिनट

app.use(cors());
app.use(express.json());

/* ---------------- PATH CONFIGURATION ---------------- */
const yt_dlp_path = "yt-dlp";
const ffmpeg_path = "ffmpeg";

/* ---------------- YTDL AGENT (Cookies/Signatures) ---------------- */
let agent = undefined;
if (fs.existsSync("./cookies.txt")) {
  const cookieText = fs.readFileSync("./cookies.txt", "utf8");
  const cookies = cookieText
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line && line.includes("="))
    .map((line) => {
      const idx = line.indexOf("=");
      return {
        name: line.slice(0, idx),
        value: line.slice(idx + 1),
        domain: ".youtube.com",
      };
    });
  agent = ytdl.createAgent(cookies);
}

/* ---------------- PLAYER SCRIPT CLEANUP FUNCTION (NEW) ---------------- */
/**
 * ytdl-core द्वारा बनाई गई अस्थायी player-script फ़ाइलों को डिलीट करता है।
 */
function cleanupPlayerScripts() {
  try {
    // वर्तमान फ़ोल्डर में '*-player-script.js' पैटर्न वाली फ़ाइलें खोजें
    console.log("Looking in folder:", __dirname);
    const filesToDelete = globSync(
      path.join(__dirname, "*-player-script.js").replace(/\\/g, "/")
    );
    console.log("Found files:", filesToDelete);
    console.log(
      `[CLEANUP] Found ${filesToDelete.length} stale player-script files to delete.`
    );
    let deletedCount = 0;
    filesToDelete.forEach((filePath) => {
      try {
        fs.unlinkSync(filePath);
        deletedCount++;
      } catch (err) {
        // फ़ाइल डिलीट न होने पर भी प्रक्रिया जारी रखें
        console.error(
          `[CLEANUP] Failed to delete file ${filePath}: ${err.message}`
        );
      }
    });

    if (deletedCount > 0) {
      console.log(
        `[CLEANUP] Successfully deleted ${deletedCount} stale player-script files.`
      );
    }
  } catch (e) {
    console.error("[CLEANUP] Global cleanup failed:", e);
  }
}
/* ---------------- PLAYER SCRIPT CLEANUP FUNCTION (END) ---------------- */

/* ---------------- Clean YouTube URL ---------------- */
function cleanYoutubeUrl(url) {
  try {
    const u = new URL(url);
    const id = u.searchParams.get("v") || u.pathname.split("/").pop();
    if (id && id.length === 11) return `https://www.youtube.com/watch?v=${id}`;
  } catch {}
  return null;
}

/* ---------------- GET YOUTUBE FORMATS (UPDATED) ---------------- */
app.get("/get-video-info", async (req, res) => {
  try {
    const cleanUrl = cleanYoutubeUrl(req.query.url);
    if (!cleanUrl) {
      return res.status(400).json({ error: "Invalid YouTube URL" });
    }

    const info = await ytdl.getInfo(cleanUrl, {
      agent,
      requestOptions: {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36",
          "Accept-Language": "en-US,en;q=0.9",
        },
      },
    });

    const filename = info.videoDetails.title
      .replace(/[^\w\s-]/g, "")
      .trim()
      .slice(0, 50);

    const availableFormats = {};

    info.formats
      .filter((f) => f.hasVideo || (!f.hasVideo && f.hasAudio))
      .forEach((f) => {
        const qualityLabel = f.qualityLabel || "Audio Only";

        const newFormat = {
          itag: f.itag,
          quality: qualityLabel,
          container: f.container,
          isAudioOnly: !f.hasVideo && f.hasAudio,
          size: f.contentLength
            ? (f.contentLength / 1024 / 1024).toFixed(2) + " MB"
            : "Unknown",
          contentLength: Number(f.contentLength || 0),
          bitrate: f.bitrate || 0,
        };

        if (
          !availableFormats[qualityLabel] ||
          newFormat.bitrate > availableFormats[qualityLabel].bitrate
        ) {
          availableFormats[qualityLabel] = newFormat;
        }
      });

    const formats = Object.values(availableFormats).sort(
      (a, b) => (parseInt(b.quality) || 0) - (parseInt(a.quality) || 0)
    );

    const videoDetails = info.videoDetails;

    res.json({
      success: true,
      title: videoDetails.title,
      filename,
      formats,
      isYouTube: true,
      thumbnail: videoDetails.thumbnails.pop()?.url,
      channel: videoDetails.author.name,
      views: videoDetails.viewCount,
      likes: videoDetails.likes,
      duration: videoDetails.lengthSeconds,
      uploadDate: videoDetails.uploadDate,
    });
  } catch (err) {
    console.error("Error fetching video info:", err);
    res.status(500).json({
      error: "YouTube blocked request or login required.",
    });
  }
});

/* ---------------- DOWNLOAD YOUTUBE STREAM ---------------- */
app.get("/download-youtube-stream", (req, res) => {
  const url = req.query.url;
  const type = req.query.type;
  const quality = req.query.quality;
  const filename = req.query.filename || "media";
  if (!url) return res.status(400).send("URL missing");

  if (type === "audio") {
    // ---------- AUDIO DOWNLOAD ----------
    // tmp.file() का उपयोग करके फ़ाइल और cleanup फ़ंक्शन प्राप्त करें
    tmp.file({ postfix: ".mp3" }, (err, tmpFile, fd, cleanupCallback) => {
      if (err) {
        console.error("Error creating temp file:", err);
        return res.status(500).send("Server error during file creation");
      }

      // 30 मिनट फॉलबैक क्लीनअप शुरू
      const fallbackCleanup = setTimeout(() => {
        console.warn(
          `[CLEANUP] Automatically deleting stale YouTube audio file after timeout: ${tmpFile}`
        );
        cleanupCallback(); // cleanupCallback का उपयोग करें
      }, FALLBACK_CLEANUP_TIME);
      fallbackCleanup.unref();

      const args = [
        "-f",
        "bestaudio",
        "-x",
        "--audio-format",
        "mp3",
        "--audio-quality",
        "0",
        "--cookies-from-browser",
        "chrome",
        "-o",
        tmpFile,
        url,
      ];

      const yt = spawn(yt_dlp_path, args);

      yt.stderr.on("data", (data) => console.error(data.toString()));

      yt.on("close", (code) => {
        clearTimeout(fallbackCleanup); // अगर सफल हुआ तो टाइमर रद्द करें

        if (code !== 0) {
          console.error("Audio extraction failed (yt-dlp code != 0)");
          cleanupCallback(); // फ़ाइल को तुरंत डिलीट करें
          return res.status(500).send("Audio extraction failed");
        }

        res.setHeader(
          "Content-Disposition",
          `attachment; filename="${filename}.mp3"`
        );
        res.setHeader("Content-Type", "audio/mpeg");
        res.flushHeaders();

        const readStream = fs.createReadStream(tmpFile);
        readStream.pipe(res);

        // stream समाप्त होने के बाद cleanupCallback का उपयोग करें
        readStream.on("close", () => cleanupCallback());
        readStream.on("error", (e) => {
          console.error("Stream error:", e);
          cleanupCallback();
        });
      });

      yt.on("error", (e) => {
        console.error(`Spawn error: ${e}`);
        clearTimeout(fallbackCleanup);
        cleanupCallback();
        if (!res.headersSent)
          res.status(500).send("Download failed (yt-dlp failed to start)");
      });
    });
  } else {
    // ---------- VIDEO DOWNLOAD (Streaming) ----------
    // यह हिस्सा Temporary File नहीं बनाता, इसलिए फॉलबैक की ज़रूरत नहीं
    const height = quality.replace("p", "");
    const formatSpecifier = `bestvideo[height=${height}]+bestaudio`;
    const args = [
      "-f",
      formatSpecifier,
      "--recode-video",
      "mp4",
      "--ffmpeg-location",
      ffmpeg_path,
      "-o",
      "-",
      url,
    ];

    const yt = spawn(yt_dlp_path, args);

    res.setHeader(
      "Content-Disposition",
      `attachment; filename="${filename}_${quality}.mp4"`
    );
    res.setHeader("Content-Type", "video/mp4");
    res.flushHeaders();

    yt.stdout.pipe(res);

    yt.stderr.on("data", (data) => {
      const errorMsg = data.toString();
      if (errorMsg && !errorMsg.startsWith("[download]"))
        console.error(`yt-dlp Error: ${errorMsg}`);
    });

    yt.on("error", (e) => {
      console.error(`Spawn error: ${e}`);
      if (!res.headersSent)
        res.status(500).send("Download failed (yt-dlp failed)");
    });

    yt.on("close", (code) => {
      if (code !== 0) console.log(`yt-dlp exited with code ${code}`);
    });
  }
});

/* ---------------- GET INSTAGRAM INFO ---------------- */
app.get("/get-insta-info", (req, res) => {
  const url = req.query.url;
  if (!url || !url.includes("instagram.com")) {
    return res.status(400).json({ error: "Invalid Instagram URL" });
  }

  const args = ["--dump-json", "--no-check-certificates", url];

  const yt = spawn(yt_dlp_path, args);
  let jsonOutput = "";
  let errorMessage = "";

  yt.stdout.on("data", (data) => {
    jsonOutput += data.toString();
  });

  yt.stderr.on("data", (data) => {
    errorMessage += data.toString();
  });

  yt.on("close", (code) => {
    if (code !== 0) {
      console.error("yt-dlp info failed:", errorMessage);
      return res.status(500).json({
        error:
          "Failed to fetch Instagram info. Post might be private or URL is invalid.",
      });
    }
    try {
      const info = JSON.parse(jsonOutput);
      const duration = info.duration || 0;

      const availableFormats = {};
      if (info.formats) {
        info.formats
          .filter((f) => f.url && f.vcodec && f.vcodec !== "none")
          .forEach((f) => {
            const qualityLabel = f.height ? `${f.height}p` : "Original";
            const key = `${qualityLabel}-${f.ext}`;

            let sizeText = "Unknown";
            const bitrate = f.tbr || 0;

            if (f.filesize) {
              sizeText = (f.filesize / 1024 / 1024).toFixed(2) + " MB";
            } else if (bitrate > 0 && duration > 0) {
              const estimatedFilesizeMB = (bitrate * duration) / 8192;
              sizeText = estimatedFilesizeMB.toFixed(2) + " MB (Est)";
            }

            const newFormat = {
              itag: f.format_id,
              quality: qualityLabel,
              container: f.ext,
              isAudioOnly: !f.vcodec || f.vcodec === "none",
              size: sizeText,
              contentLength: f.filesize || 0,
              bitrate: f.tbr || 0,
            };

            if (
              !availableFormats[key] ||
              newFormat.contentLength > availableFormats[key].contentLength
            ) {
              availableFormats[key] = newFormat;
            }
          });
      }

      const formats = Object.values(availableFormats).sort(
        (a, b) => (parseInt(b.quality) || 0) - (parseInt(a.quality) || 0)
      );

      if (formats.length === 0 && (info.url || info.display_url)) {
        formats.push({
          itag: "best",
          quality: info.width
            ? `${info.width}x${info.height} (Media)`
            : "Original (Media)",
          container: info.ext || "jpg/mp4",
          isAudioOnly: false,
          size: info.filesize
            ? (info.filesize / 1024 / 1024).toFixed(2) + " MB"
            : "Unknown",
          contentLength: info.filesize || 0,
          bitrate: 0,
        });
      }

      res.json({
        success: true,
        title: info.title || "Instagram Media",
        filename: (info.title || "instagram_media")
          .replace(/[^\w\s-]/g, "")
          .trim()
          .slice(0, 50),
        formats,
        thumbnail: info.thumbnail,
        duration: info.duration,
        isYouTube: false,
      });
    } catch (e) {
      console.error("JSON Parse Error:", e);
      res.status(500).json({ error: "Error processing Instagram data." });
    }
  });
});

/* ---------------- DOWNLOAD INSTAGRAM STREAM ---------------- */
app.get("/download-instagram-stream", (req, res) => {
  const url = req.query.url;
  const itag = req.query.itag || "best";
  const filename = req.query.filename || "instagram_media";
  if (!url) return res.status(400).send("URL missing"); // tmp.file() का उपयोग करें

  tmp.file({ postfix: ".mp4" }, (err, tmpFile, fd, cleanupCallback) => {
    if (err) {
      console.error("Error creating temp file:", err);
      return res.status(500).send("Server error during file creation");
    } // 30 मिनट फॉलबैक क्लीनअप शुरू

    const fallbackCleanup = setTimeout(() => {
      console.warn(
        `[CLEANUP] Automatically deleting stale Instagram file after timeout: ${tmpFile}`
      );
      cleanupCallback(); // cleanupCallback का उपयोग करें
    }, FALLBACK_CLEANUP_TIME);
    fallbackCleanup.unref(); // फॉलबैक क्लीनअप ख़त्म
    let formatString;
    formatString =
      itag === "best"
        ? "bestvideo[ext=mp4]+bestaudio[ext=m4a]/best"
        : `${itag}+bestaudio`;

    const args = [
      "-f",
      formatString,
      "--ffmpeg-location",
      ffmpeg_path,
      "--postprocessor-args",
      "FFmpegVideoRemuxer:-c copy",
      "--recode-video",
      "mp4",
      "-o",
      tmpFile,
      url,
    ];

    const yt = spawn(yt_dlp_path, args);
    let downloadFailed = false;

    yt.stderr.on("data", (data) => {
      const errorMsg = data.toString();
      if (
        errorMsg &&
        (errorMsg.startsWith("ERROR:") || errorMsg.includes("ffmpeg"))
      ) {
        console.error(`yt-dlp Instagram Error: ${errorMsg}`);
        downloadFailed = true;
      }
    });

    yt.on("error", (e) => {
      console.error(`Spawn error: ${e}`);
      clearTimeout(fallbackCleanup);
      cleanupCallback(); // त्रुटि पर फ़ाइल डिलीट करें
      if (!res.headersSent)
        res.status(500).send("Download failed (yt-dlp failed to start)");
      downloadFailed = true;
    }); // 3. जब डाउनलोड और रीकोडिंग पूरी हो जाए

    yt.on("close", (code) => {
      clearTimeout(fallbackCleanup); // अगर सफल हुआ तो टाइमर रद्द करें

      if (code !== 0 || downloadFailed) {
        console.log(`yt-dlp Instagram process exited with code ${code}`);
        cleanupCallback(); // फ़ाइल डिलीट करें
        if (!res.headersSent) {
          res.status(500).send("Download failed (yt-dlp process error)");
        }
        return;
      }

      try {
        // 4. फ़ाइल साइज़ प्राप्त करें (Content-Length को सुनिश्चित करने के लिए)
        const stats = fs.statSync(tmpFile); // 5. मैनुअल Headers सेट करें

        res.setHeader("Content-Type", "video/mp4");
        res.setHeader("Content-Length", stats.size);
        res.setHeader(
          "Content-Disposition",
          `attachment; filename="${filename}.mp4"`
        );
        res.flushHeaders(); // 6. res.sendFile का उपयोग करें

        res.sendFile(tmpFile, (err) => {
          if (err) {
            console.error("Error sending file to client:", err);
          } // 7. भेजने के बाद अस्थायी फ़ाइल हटा दें (Immediate cleanup)
          cleanupCallback();
        });
      } catch (e) {
        console.error("Error processing file for sending:", e);
        cleanupCallback();
        if (!res.headersSent)
          res.status(500).send("File processing failed on server.");
      }
    });
  });
});

/* ---------------- START SERVER ---------------- */
// 💡 सुनिश्चित करें कि आपने 'glob' पैकेज इंस्टॉल कर लिया है: npm install glob

cleanupPlayerScripts(); // 1. सर्वर शुरू होते ही तुरंत चलाएं

// 2. हर 12 घंटे में प्लेयर स्क्रिप्ट क्लीनअप चलाएं
setInterval(cleanupPlayerScripts, CACHE_CLEANUP_INTERVAL);

const server = app.listen(PORT, () => {
  console.log(`✅ Backend running on http://localhost:${PORT}`);
});
server.timeout = 600000;
