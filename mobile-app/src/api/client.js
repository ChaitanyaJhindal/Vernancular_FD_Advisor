import * as FileSystem from "expo-file-system";
import { Buffer } from "buffer";

const API_BASE_URL = "https://vernancular-fd-advisor.onrender.com";
const TTS_TIMEOUT_MS = 25000;

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
  const form = new FormData();
  form.append("audio", {
    uri,
    name: filename,
    type: "audio/m4a"
  });
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

  const b64 = Buffer.from(bytes).toString("base64");
  const ext = contentType.includes("wav") ? "wav" : "mp3";
  const localPath = `${FileSystem.cacheDirectory}reply-${Date.now()}-${Math.random()
    .toString(36)
    .slice(2)}.${ext}`;

  await FileSystem.writeAsStringAsync(localPath, b64, {
    encoding: FileSystem.EncodingType.Base64
  });

  const info = await FileSystem.getInfoAsync(localPath);
  if (!info.exists || !info.size) {
    throw new Error("TTS audio file write failed");
  }

  return localPath;
}
