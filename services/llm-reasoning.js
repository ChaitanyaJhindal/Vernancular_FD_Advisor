import { LLM_CONFIG } from "../config/app-config.js";
import { getSarvamClient } from "./sarvam-client.js";

function getLanguageLabel(lang) {
  const map = {
    en: "English",
    hi: "Hindi",
    hinglish: "Hinglish",
    gu: "Gujarati",
    ta: "Tamil"
  };
  return map[lang] || "English";
}

function getAssistantText(response) {
  const choice = response?.choices?.[0];
  const content = String(choice?.message?.content || "").trim();
  if (content) return content;
  const reasoning = String(choice?.message?.reasoning_content || "").trim();
  return reasoning;
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
    `Respond in ${languageLabel}.`
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

  return runChatCompletion({ systemPrompt, userPrompt });
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
    `Respond in ${languageLabel}.`
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
    "- 1 closing line asking user if they want comparison for another amount/tenure"
  ].join("\n");

  return runChatCompletion({ systemPrompt, userPrompt });
}
