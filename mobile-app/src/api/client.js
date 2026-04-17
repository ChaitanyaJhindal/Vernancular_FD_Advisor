import * as FileSystem from "expo-file-system";

const API_BASE_URL = "https://vernancular-fd-advisor.onrender.com";

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
  const response = await fetch(`${API_BASE_URL}/api/tts`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      text,
      target_language_code: targetLanguageCode
    })
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(err || "TTS failed");
  }

  const blob = await response.blob();
  const b64 = await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const result = String(reader.result || "");
      const parts = result.split(",");
      resolve(parts[1] || "");
    };
    reader.onerror = () => reject(new Error("Failed to read TTS audio"));
    reader.readAsDataURL(blob);
  });
  const localPath = `${FileSystem.cacheDirectory}reply-${Date.now()}.mp3`;
  await FileSystem.writeAsStringAsync(localPath, b64, {
    encoding: FileSystem.EncodingType.Base64
  });
  return localPath;
}
