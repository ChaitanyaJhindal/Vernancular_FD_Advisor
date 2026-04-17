export const PORT = Number(process.env.PORT) || 3000;

export const SEARCH_RADIUS_METERS = 10000;

export const OVERPASS_MIRRORS = [
  "https://overpass.kumi.systems/api/interpreter",
  "https://overpass-api.de/api/interpreter",
  "https://lz4.overpass-api.de/api/interpreter"
];

export const BANKS_CSV_CANDIDATES = ["fd_banks_120.csv", "banks.csv"];
export const FD_PRODUCTS_CSV_CANDIDATES = ["fd_products_120.csv", "fd_products.csv"];

export const STT_CONFIG = {
  defaultMode: "transcribe",
  defaultModel: "saaras:v3",
  defaultLanguageCode: "unknown"
};

export const TTS_CONFIG = {
  defaultModel: "bulbul:v2",
  defaultTargetLanguageCode: "en-IN",
  outputAudioCodec: "mp3"
};

export const LLM_CONFIG = {
  model: "sarvam-m",
  temperature: 0.3,
  maxTokens: 500,
  reasoningEffort: "medium"
};

export const MIC_CONFIG = {
  tempWavPath: "live_recording.wav",
  channels: 1,
  sampleRate: 16000,
  bitDepth: 16,
  threshold: 0,
  verbose: false
};

export const TMP_DIR_NAME = "tmp";
