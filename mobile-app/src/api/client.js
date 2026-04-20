import * as FileSystem from "expo-file-system";
import { Buffer } from "buffer";
import { Platform } from "react-native";

const API_BASE_URL = "https://vernancular-fd-advisor.onrender.com";
const TTS_TIMEOUT_MS = 25000;
const CACHE_DIR = FileSystem.cacheDirectory || FileSystem.documentDirectory;

function inferAudioMetaFromUri(uri, fallbackName = "recording") {
  const safeUri = String(uri || "");
  const dotIndex = safeUri.lastIndexOf(".");
  const ext = dotIndex > -1 ? safeUri.slice(dotIndex + 1).toLowerCase() : "";

  if (ext === "wav") return { mime: "audio/wav", filename: `${fallbackName}.wav` };
  if (ext === "webm") return { mime: "audio/webm", filename: `${fallbackName}.webm` };
  if (ext === "mp3") return { mime: "audio/mpeg", filename: `${fallbackName}.mp3` };
  return { mime: "audio/m4a", filename: `${fallbackName}.m4a` };
}

async function jsonFetch(path, options = {}) {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {})
    },
    ...options
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || `Request failed: ${response.status}`);
  }

  return response.json();
}

export async function fetchNearbyBanks(lat, lng) {
  const query = `?lat=${encodeURIComponent(lat)}&lng=${encodeURIComponent(lng)}&limit=3&radiusMeters=10000`;
  return jsonFetch(`/api/banks${query}`);
}

export async function transcribeFromUri(uri, filename = "recording.m4a") {
  const safeUri = String(uri || "").trim();
  if (!safeUri) {
    throw new Error("Recording URI is empty");
  }

  const inferred = inferAudioMetaFromUri(safeUri, "recording");
  const form = new FormData();

  if (Platform.OS === "web") {
    const blobResponse = await fetch(safeUri);
    const blob = await blobResponse.blob();
    const blobType = blob.type || inferred.mime;
    const webFileName = filename || inferred.filename;
    form.append("audio", blob, webFileName);
    if (!blob.type && blobType) {
      // Browsers may omit blob.type for some media recorder outputs; language model can still infer from filename.
      form.append("audio_mime_hint", blobType);
    }
  } else {
    form.append("audio", {
      uri: safeUri,
      name: filename || inferred.filename,
      type: inferred.mime
    });
  }

  form.append("mode", "transcribe");
  form.append("model", "saaras:v3");
  form.append("language_code", "unknown");

  const response = await fetch(`${API_BASE_URL}/api/transcribe`, {
    method: "POST",
    body: form
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || "Transcription failed");
  }

  return response.json();
}

export async function askFdAdvisor(payload) {
  return jsonFetch("/api/fd-advisor-chat", {
    method: "POST",
    body: JSON.stringify(payload)
  });
}

export async function requestTtsToLocalFile(text, targetLanguageCode = "hi-IN") {
  const trimmedText = String(text || "").trim();
  if (!trimmedText) {
    throw new Error("TTS text is empty");
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), TTS_TIMEOUT_MS);
  let response;

  try {
    response = await fetch(`${API_BASE_URL}/api/tts`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        text: trimmedText,
        target_language_code: targetLanguageCode
      }),
      signal: controller.signal
    });
  } catch (error) {
    if (error?.name === "AbortError") {
      throw new Error("TTS request timed out");
    }
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }

  if (!response.ok) {
    const err = await response.text();
    throw new Error(err || "TTS failed");
  }

  const contentType = String(response.headers.get("content-type") || "").toLowerCase();
  if (!contentType.includes("audio")) {
    const raw = await response.text();
    throw new Error(raw || `Unexpected TTS response type: ${contentType || "unknown"}`);
  }

  const bytes = await response.arrayBuffer();
  if (!bytes || bytes.byteLength === 0) {
    throw new Error("Empty audio payload from TTS");
  }

  if (Platform.OS === "web") {
    const audioType = contentType || "audio/mpeg";
    if (typeof URL !== "undefined" && typeof URL.createObjectURL === "function") {
      const blob = new Blob([bytes], { type: audioType });
      return URL.createObjectURL(blob);
    }

    const b64Web = Buffer.from(bytes).toString("base64");
    return `data:${audioType};base64,${b64Web}`;
  }

  if (!CACHE_DIR) {
    throw new Error("No writable file directory available for TTS audio");
  }

  const b64 = Buffer.from(bytes).toString("base64");
  const ext = contentType.includes("wav") ? "wav" : "mp3";
  const localPath = `${CACHE_DIR}reply-${Date.now()}-${Math.random()
    .toString(36)
    .slice(2)}.${ext}`;

  await FileSystem.writeAsStringAsync(localPath, b64, {
    encoding: "base64"
  });

  const info = await FileSystem.getInfoAsync(localPath);
  if (!info.exists || !info.size) {
    throw new Error("TTS audio file write failed");
  }

  return localPath;
}
