import fs from "fs";
import path from "path";
import { Router } from "express";
import multer from "multer";
import { STT_CONFIG, TTS_CONFIG, TMP_DIR_NAME } from "../config/app-config.js";
import { getSarvamClient } from "../services/sarvam-client.js";

const router = Router();
const upload = multer({ storage: multer.memoryStorage() });

router.post("/api/transcribe", upload.single("audio"), async (req, res) => {
  const client = getSarvamClient();
  if (!client) {
    res.status(500).send("SARVAM_API_KEY is missing in .env");
    return;
  }

  if (!req.file) {
    res.status(400).send("No audio file provided");
    return;
  }

  const mode = req.body.mode || STT_CONFIG.defaultMode;
  const model = req.body.model || STT_CONFIG.defaultModel;
  const languageCode = req.body.language_code || req.body.languageCode || STT_CONFIG.defaultLanguageCode;

  const tempDir = path.join(process.cwd(), TMP_DIR_NAME);
  const extFromName = path.extname(req.file.originalname || "") || ".webm";
  const tempPath = path.join(tempDir, `upload-${Date.now()}${extFromName}`);

  try {
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }

    fs.writeFileSync(tempPath, req.file.buffer);
    const audioStream = fs.createReadStream(tempPath);

    const response = await client.speechToText.transcribe({
      file: audioStream,
      model,
      mode,
      language_code: languageCode
    });

    res.json(response);
  } catch (error) {
    res.status(500).send(error?.message || "Transcription failed");
  } finally {
    if (fs.existsSync(tempPath)) {
      fs.unlinkSync(tempPath);
    }
  }
});

router.post("/api/tts", async (req, res) => {
  const client = getSarvamClient();
  if (!client) {
    res.status(500).json({ error: "SARVAM_API_KEY is missing in .env" });
    return;
  }

  const text = String(req.body?.text || "").trim();
  if (!text) {
    res.status(400).json({ error: "text is required" });
    return;
  }

  const targetLanguageCode = req.body?.target_language_code || TTS_CONFIG.defaultTargetLanguageCode;
  const speaker = req.body?.speaker || undefined;
  const model = req.body?.model || TTS_CONFIG.defaultModel;

  try {
    const response = await client.textToSpeech.convertStream({
      text,
      target_language_code: targetLanguageCode,
      speaker,
      model,
      output_audio_codec: TTS_CONFIG.outputAudioCodec
    });

    const audioBuffer = Buffer.from(await response.arrayBuffer());
    res.setHeader("Content-Type", "audio/mpeg");
    res.setHeader("Cache-Control", "no-store");
    res.send(audioBuffer);
  } catch (error) {
    res.status(500).json({
      error: "TTS failed",
      details: error?.message || "Unknown error"
    });
  }
});

export default router;
