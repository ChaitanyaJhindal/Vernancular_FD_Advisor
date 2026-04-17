import { SarvamAIClient } from "sarvamai";

export function getSarvamClient() {
  const apiKey = process.env.SARVAM_API_KEY;
  if (!apiKey) return null;
  return new SarvamAIClient({ apiSubscriptionKey: apiKey });
}
