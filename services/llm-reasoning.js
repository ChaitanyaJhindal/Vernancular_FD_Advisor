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
  const content = Array.isArray(rawContent)
    ? rawContent
        .map((part) => (typeof part?.text === "string" ? part.text : ""))
        .join("\n")
        .trim()
    : String(rawContent || "").trim();
  if (content) return content;
  const reasoning = String(choice?.message?.reasoning_content || choice?.message?.reasoning || "").trim();
  return reasoning;
}

function sanitizeAssistantText(text) {
  const raw = String(text || "");
  const removedPaired = raw.replace(/<think>[\s\S]*?<\/think>/gi, " ");
  const removedDangling = removedPaired.replace(/<think>[\s\S]*$/gi, " ");
  return removedDangling.replace(/\s+/g, " ").trim();
}

function validateLanguageOrThrow(lang, text) {
  const cleaned = sanitizeAssistantText(text);
  if (!cleaned) {
    throw new Error("LLM returned empty visible content");
  }

  if (lang === "en" || lang === "hinglish") {
    return cleaned;
  }

  const scriptRegex = SCRIPT_REGEX_BY_LANG[lang];
  if (!scriptRegex) {
    return cleaned;
  }

  const nativeCount = (cleaned.match(new RegExp(scriptRegex.source, "g")) || []).length;
  const englishCount = (cleaned.match(/[A-Za-z]/g) || []).length;

  if (nativeCount < 10 || englishCount > nativeCount * 1.2) {
    throw new Error(`LLM language mismatch for lang=${lang}`);
  }

  return cleaned;
}

async function runChatCompletion({ systemPrompt, userPrompt }) {
  const client = getSarvamClient();
  if (!client) {
    throw new Error("SARVAM_API_KEY is missing in .env");
  }

  const response = await client.chat.completions({
    model: LLM_CONFIG.model,
    temperature: LLM_CONFIG.temperature,
    max_tokens: LLM_CONFIG.maxTokens,
    reasoning_effort: LLM_CONFIG.reasoningEffort,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt }
    ]
  });

  const text = getAssistantText(response);
  if (!text) {
    throw new Error("LLM returned empty response");
  }

  return text;
}

export async function generateFinancialReasoningReply({ userInput, lang }) {
  const languageLabel = getLanguageLabel(lang);

  const systemPrompt = [
    "You are a practical financial guidance assistant for Indian users.",
    "Provide simple, clear, and safe guidance.",
    "First evaluate whether the user has already provided enough details in their latest query.",
    "If details are complete, answer directly and do not ask generic follow-up questions.",
    "Only ask one precise follow-up question when a required detail is truly missing.",
    "Never provide illegal financial advice or guaranteed return claims.",
    "Do not mention being an AI model.",
    "Do not reveal chain-of-thought, analysis, or internal reasoning.",
    "Keep answer concise (4 to 8 lines).",
    "Also give the response in very clear fomat without any symbols or extra text so that it can be easlily read out by voice agents",
    `Respond only in ${languageLabel}. Do not switch to English unless the user explicitly asks for English.`
  ].join(" ");

  const userPrompt = [
    "User query:",
    userInput,
    "",
    "Response requirements:",
    "1) Give direct answer first.",
    "2) Add short reasoning and practical next step.",
    "3) If user query is risky/illegal, refuse that part and suggest safe alternatives."
  ].join("\n");

  const text = await runChatCompletion({ systemPrompt, userPrompt });
  return validateLanguageOrThrow(lang, text);
}

export async function generateFdAdvisorNarrative({
  lang,
  amount,
  tenureMonths,
  recommendations
}) {
  const languageLabel = getLanguageLabel(lang);

  const systemPrompt = [
    "You are an FD advisor assistant for India.",
    "Assume amount and tenure are already confirmed.",
    "Respond directly with final recommendation summary.",
    "Do not ask clarification questions unless required data is missing (it is not missing here).",
    "Use only provided recommendation data.",
    "No guaranteed returns claims.",
    "No fabricated banks or rates.",
    "Do not include analysis, planning text, or chain-of-thought.",
    "Keep answer user-friendly and concise.",
    `Respond only in ${languageLabel}. Do not switch to English unless the user explicitly asks for English.`
  ].join(" ");

  const userPrompt = [
    `Amount: ${amount}`,
    `Tenure months: ${tenureMonths}`,
    "Top recommendations JSON:",
    JSON.stringify(recommendations, null, 2),
    "",
    "Output format:",
    "- 1 short intro",
    "- numbered list (up to 3) with bank name, rate, expected return and one reason",
    "- 1 closing line asking user if they want comparison for another amount/tenure",
    "do not include any unecssary symbols like ** or extra text as it need to be get read out by voice agents"
  ].join("\n");

  const text = await runChatCompletion({ systemPrompt, userPrompt });
  return validateLanguageOrThrow(lang, text);
}
