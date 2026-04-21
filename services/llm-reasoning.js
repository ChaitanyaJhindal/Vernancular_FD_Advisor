import { LLM_CONFIG } from "../config/app-config.js";
import { getSarvamClient } from "./sarvam-client.js";

/* ---------------- LANGUAGE CONFIG ---------------- */

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

/* ---------------- RESPONSE HELPERS ---------------- */

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

/* ---------------- LANGUAGE VALIDATION ---------------- */

function validateLanguageSoft(lang, text) {
  const cleaned = sanitizeAssistantText(text);
  if (!cleaned) return "";

  if (lang === "en" || lang === "hinglish") return cleaned;

  const regex = SCRIPT_REGEX_BY_LANG[lang];
  if (!regex) return cleaned;

  const nativeCount = (cleaned.match(new RegExp(regex.source, "g")) || []).length;

  // relaxed validation
  if (nativeCount < 5) {
    return cleaned; // fallback instead of throwing
  }

  return cleaned;
}

/* ---------------- CORE LLM CALL ---------------- */

async function runChatCompletion(messages, retries = 2) {
  const client = getSarvamClient();
  if (!client) throw new Error("SARVAM_API_KEY missing");

  try {
    const response = await client.chat.completions({
      model: LLM_CONFIG.model,
      temperature: 0.7, // more conversational
      max_tokens: LLM_CONFIG.maxTokens,
      reasoning_effort: LLM_CONFIG.reasoningEffort,
      messages
    });

    const text = getAssistantText(response);
    if (!text) throw new Error("Empty response");

    return text;

  } catch (err) {
    if (retries > 0) {
      return runChatCompletion(messages, retries - 1);
    }
    throw err;
  }
}

/* ---------------- MAIN FUNCTION (INTERACTIVE) ---------------- */

export async function generateFinancialReply({
  userInput,
  lang,
  chatHistory = []
}) {
  const languageLabel = getLanguageLabel(lang);

  const systemPrompt = `
You are a conversational financial assistant for Indian users.

Your goal is to understand user intent and guide them naturally.

Rules:
- Do NOT behave like a FAQ bot
- Act like a human financial advisor
- If user gives partial info:
  → Suggest options + ask 1–2 natural follow-ups
- If user gives enough info:
  → Answer directly + suggest improvements
- Keep responses clean and voice-friendly
- No symbols like *, bullets, markdown
- No illegal or guaranteed return advice
- Do NOT mention AI or internal reasoning

Language rule:
Respond ONLY in ${languageLabel}
`;

  const messages = [
    { role: "system", content: systemPrompt },

    ...chatHistory, // 🔥 MEMORY ENABLED

    {
      role: "user",
      content: `
User query:
${userInput}

Instructions:
1 Understand intent
2 Give useful financial guidance
3 Suggest options if info incomplete
4 Ask 1 or 2 natural follow-up questions if helpful
5 Keep it conversational not robotic
`
    }
  ];

  const raw = await runChatCompletion(messages);
  return validateLanguageSoft(lang, raw);
}

/* ---------------- FD ADVISOR ---------------- */

export async function generateFdAdvisorNarrative({
  lang,
  amount,
  tenureMonths,
  recommendations,
  chatHistory = []
}) {
  const languageLabel = getLanguageLabel(lang);

  const systemPrompt = `
You are a friendly FD advisor for Indian users.

Guidelines:
- Be conversational and helpful
- Present recommendations clearly
- Add short reasoning for each option
- Keep it voice-friendly
- No symbols like *, markdown

Language:
Respond only in ${languageLabel}
`;

  const messages = [
    { role: "system", content: systemPrompt },

    ...chatHistory,

    {
      role: "user",
      content: `
User wants FD advice.

Amount: ${amount}
Tenure: ${tenureMonths} months

Options:
${JSON.stringify(recommendations)}

Instructions:
1 Start with a simple intro
2 Give top 2 or 3 options with reason
3 Add expected return
4 End with a helpful follow-up suggestion
`
    }
  ];

  const raw = await runChatCompletion(messages);
  return validateLanguageSoft(lang, raw);
}