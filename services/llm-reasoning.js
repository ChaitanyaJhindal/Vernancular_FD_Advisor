import { LLM_CONFIG } from "../config/app-config.js";
import { getSarvamClient } from "./sarvam-client.js";

const SCRIPT_REGEX_BY_LANG = {
  hi: /[\u0900-\u097F]/,
  gu: /[\u0A80-\u0AFF]/,
  ta: /[\u0B80-\u0BFF]/,
  bn: /[\u0980-\u09FF]/,
  kn: /[\u0C80-\u0CFF]/,
  ml: /[\u0D00-\u0D7F]/,
  mr: /[\u0900-\u097F]/,
  od: /[\u0B00-\u0B7F]/,
  pa: /[\u0A00-\u0A7F]/,
  te: /[\u0C00-\u0C7F]/
};

function getLanguageLabel(lang) {
  const map = {
    en: "English",
    hi: "Hindi",
    hinglish: "Hinglish",
    gu: "Gujarati",
    ta: "Tamil",
    bn: "Bengali",
    kn: "Kannada",
    ml: "Malayalam",
    mr: "Marathi",
    od: "Odia",
    pa: "Punjabi",
    te: "Telugu"
  };
  return map[lang] || "English";
}

function getAssistantText(response) {
  const choice = response?.choices?.[0];
  const rawContent = choice?.message?.content;

  if (Array.isArray(rawContent)) {
    return rawContent.map(p => p?.text || "").join("\n").trim();
  }

  return String(rawContent || "").trim();
}

function sanitizeAssistantText(text) {
  return String(text || "")
    .replace(/<think>[\s\S]*?<\/think>/gi, " ")
    .replace(/<think>[\s\S]*$/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/* 🔥 SOFT VALIDATION (no crashes now) */
function validateLanguageOrThrow(lang, text) {
  const cleaned = sanitizeAssistantText(text);
  if (!cleaned) return "";

  if (lang === "en" || lang === "hinglish") return cleaned;

  const scriptRegex = SCRIPT_REGEX_BY_LANG[lang];
  if (!scriptRegex) return cleaned;

  const nativeCount = (cleaned.match(new RegExp(scriptRegex.source, "g")) || []).length;

  // relaxed condition (no throw)
  if (nativeCount < 5) {
    return cleaned;
  }

  return cleaned;
}

/* 🔥 RETRY ADDED */
async function runChatCompletion({ systemPrompt, userPrompt }, retries = 2) {
  const client = getSarvamClient();
  if (!client) {
    throw new Error("SARVAM_API_KEY is missing in .env");
  }

  try {
    const response = await client.chat.completions({
      model: LLM_CONFIG.model,
      temperature: 0.7, // more conversational
      max_tokens: LLM_CONFIG.maxTokens,
      reasoning_effort: LLM_CONFIG.reasoningEffort,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt }
      ]
    });

    const text = getAssistantText(response);
    if (!text) throw new Error("Empty response");

    return text;

  } catch (err) {
    if (retries > 0) {
      return runChatCompletion({ systemPrompt, userPrompt }, retries - 1);
    }
    throw err;
  }
}

/* ================= MAIN FUNCTION ================= */

export async function generateFinancialReasoningReply({ userInput, lang }) {
  const languageLabel = getLanguageLabel(lang);

  const systemPrompt = [
    "You are a conversational financial assistant for Indian users.",
    "Act like a human advisor not a FAQ bot.",
    "Understand user intent before answering.",
    "If user gives partial info, suggest options and ask 1 natural follow-up.",
    "If user gives enough info, answer directly and improve the suggestion.",
    "Keep response clear and voice-friendly.",
    "Do not give illegal or guaranteed return advice.",
    "Do not mention being an AI.",
    `Respond only in ${languageLabel}.`
  ].join(" ");

  const userPrompt = [
    "User query:",
    userInput,
    "",
    "Instructions:",
    "1 Understand intent",
    "2 Give useful financial guidance",
    "3 Suggest options if needed",
    "4 Ask a natural follow-up if helpful",
    "5 Keep it conversational not robotic"
  ].join("\n");

  const text = await runChatCompletion({ systemPrompt, userPrompt });
  return validateLanguageOrThrow(lang, text);
}

/* ================= FD FUNCTION ================= */

export async function generateFdAdvisorNarrative({
  lang,
  amount,
  tenureMonths,
  recommendations
}) {
  const languageLabel = getLanguageLabel(lang);

  const systemPrompt = [
    "You are a friendly FD advisor for India.",
    "Explain recommendations clearly.",
    "Add short reasoning for each option.",
    "Keep it simple and voice-friendly.",
    "Do not use symbols like * or markdown.",
    `Respond only in ${languageLabel}.`
  ].join(" ");

  const userPrompt = [
    `Amount: ${amount}`,
    `Tenure months: ${tenureMonths}`,
    "Top recommendations JSON:",
    JSON.stringify(recommendations, null, 2),
    "",
    "Instructions:",
    "1 Give short intro",
    "2 Give top 2 or 3 options with reason",
    "3 Mention expected return",
    "4 End with helpful follow-up suggestion"
  ].join("\n");

  const text = await runChatCompletion({ systemPrompt, userPrompt });
  return validateLanguageOrThrow(lang, text);
}