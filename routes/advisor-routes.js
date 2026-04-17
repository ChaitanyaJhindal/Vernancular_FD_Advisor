import { Router } from "express";
import {
  createResponseByLang,
  detectLanguageStyle,
  detectNearbyIntent,
  detectSavingsIntent,
  earningsTextByLang,
  extractAmountFromText,
  extractTenureMonthsFromText,
  fetchNearbyBanksForCoords,
  flowText,
  formatBanksMessage,
  formatInr,
  formatTenureTextForLang,
  getFdRecommendationsCore,
  isAffirmative,
  isNegative,
  localizeDigits,
  resolveLangFromInput
} from "../services/core-utils.js";
import {
  generateFdAdvisorNarrative,
  generateFinancialReasoningReply
} from "../services/llm-reasoning.js";

const router = Router();
const advisorSessions = new Map();

router.post("/api/financial-assistant", async (req, res) => {
  const userInput = String(req.body?.userInput || "").trim();
  const nearbyBanks = Array.isArray(req.body?.nearbyBanks) ? req.body.nearbyBanks : [];
  const radiusKm = Number(req.body?.radiusKm);

  if (!userInput) {
    res.status(400).json({
      text: "Please provide userInput.",
      speech: "Please provide userInput."
    });
    return;
  }

  const lang = detectLanguageStyle(userInput);
  const asksNearbyBanks = /(nearby|nearest|bank|atm|पास|नजदीक|पास के|બાજુમાં|નજીક|அருகில்|வங்கி|ఏటీఎం|బ్యాంక్)/i.test(userInput);

  let reply;
  if (asksNearbyBanks) {
    reply = formatBanksMessage(lang, nearbyBanks, Number.isFinite(radiusKm) ? radiusKm : null);
  } else {
    try {
      reply = await generateFinancialReasoningReply({ userInput, lang });
    } catch {
      reply = flowText(lang, "askIntent");
    }
  }

  res.json(createResponseByLang(lang, reply));
});

router.post("/api/fd-recommendations", (req, res) => {
  const amount = Number(req.body?.amount);
  const tenureMonths = Number(req.body?.tenure_months);
  const userLanguage = req.body?.user_language || "auto";
  const nearbyBanks = Array.isArray(req.body?.nearbyBanks) ? req.body.nearbyBanks : [];

  if (!Number.isFinite(amount) || amount <= 0 || !Number.isFinite(tenureMonths) || tenureMonths <= 0) {
    res.status(400).json({
      error: "amount and tenure_months must be valid positive numbers"
    });
    return;
  }

  try {
    const { recommendations, lang } = getFdRecommendationsCore({
      amount,
      tenureMonths,
      userLanguage,
      nearbyBanks,
      userText: req.body?.user_text || ""
    });

    const localizedRecommendations = recommendations.map((r) => ({
      ...r,
      expected_return: localizeDigits(r.expected_return, lang),
      interest_rate: localizeDigits(r.interest_rate, lang),
      reason: localizeDigits(r.reason, lang),
      distance: localizeDigits(r.distance, lang)
    }));

    res.json({ recommendations: localizedRecommendations });
  } catch (error) {
    res.status(500).json({
      error: "Failed to generate FD recommendations",
      details: error?.message || "Unknown error"
    });
  }
});

router.post("/api/fd-advisor-chat", async (req, res) => {
  const sessionId = String(req.body?.session_id || "default");
  const userInput = String(req.body?.userInput || "").trim();
  const userLanguage = req.body?.user_language || "auto";
  const nearbyBanks = Array.isArray(req.body?.nearbyBanks) ? req.body.nearbyBanks : [];
  const langCandidate = resolveLangFromInput(userLanguage, userInput);

  if (!userInput) {
    res.status(400).json({
      text: "Please provide userInput.",
      speech: "Please provide userInput.",
      session_id: sessionId,
      stage: "awaiting_input"
    });
    return;
  }

  const existing = advisorSessions.get(sessionId) || {
    stage: "awaiting_intent",
    amount: null,
    tenureMonths: null,
    lang: langCandidate,
    locationPermissionAsked: false,
    locationPermission: null,
    nearbyBanksCache: [],
    history: []
  };

  const isShortControlInput = /^(yes|no|y|n|haan|nahi|ok|\d+)$/.test(userInput.toLowerCase());
  if (userLanguage !== "auto") {
    existing.lang = langCandidate;
  } else if (!existing.lang) {
    existing.lang = langCandidate;
  } else if (!isShortControlInput) {
    existing.lang = langCandidate;
  }
  const lang = existing.lang || langCandidate;
  existing.history = Array.isArray(existing.history) ? existing.history : [];
  existing.history.push({ role: "user", text: userInput, at: Date.now() });

  const explicitLocationPermission = req.body?.location_permission;
  if (typeof explicitLocationPermission === "boolean") {
    existing.locationPermissionAsked = true;
    existing.locationPermission = explicitLocationPermission;
  }

  if (Array.isArray(nearbyBanks) && nearbyBanks.length > 0) {
    existing.nearbyBanksCache = nearbyBanks;
  }

  const lat = Number(req.body?.lat);
  const lng = Number(req.body?.lng);

  const continueWithNearbyIntent = async () => {
    let mergedNearby = Array.isArray(existing.nearbyBanksCache) ? [...existing.nearbyBanksCache] : [];
    if (mergedNearby.length === 0 && Number.isFinite(lat) && Number.isFinite(lng)) {
      try {
        mergedNearby = await fetchNearbyBanksForCoords(lat, lng, 3);
        existing.nearbyBanksCache = mergedNearby;
      } catch {
        mergedNearby = [];
      }
    }

    if (!mergedNearby.length) {
      const msg = flowText(lang, "nearbyEmpty");
      const payload = createResponseByLang(lang, msg);
      advisorSessions.set(sessionId, existing);
      res.json({ ...payload, session_id: sessionId, stage: existing.stage, memory: { amount: existing.amount, tenure_months: existing.tenureMonths } });
      return;
    }

    const lines = mergedNearby.slice(0, 3).map((b) => {
      const d = Number(b.distance_km);
      const dText = Number.isFinite(d) ? `${d.toFixed(1)} km` : "N/A";
      return `${b.name} ${dText}`;
    });

    const msg = `${flowText(lang, "nearbyIntro")}\n${lines.map((x, i) => `${i + 1}. ${x}`).join("\n")}`;
    const payload = createResponseByLang(lang, msg);
    advisorSessions.set(sessionId, existing);
    res.json({ ...payload, session_id: sessionId, stage: existing.stage, memory: { amount: existing.amount, tenure_months: existing.tenureMonths } });
  };

  if (detectNearbyIntent(userInput)) {
    await continueWithNearbyIntent();
    return;
  }

  if (!existing.locationPermissionAsked) {
    existing.locationPermissionAsked = true;
    existing.stage = "awaiting_location_permission";
    advisorSessions.set(sessionId, existing);
    const msg = flowText(lang, "askLocationPermission");
    const payload = createResponseByLang(lang, msg);
    res.json({ ...payload, session_id: sessionId, stage: existing.stage, memory: { amount: existing.amount, tenure_months: existing.tenureMonths } });
    return;
  }

  if (existing.stage === "awaiting_location_permission") {
    if (isAffirmative(userInput)) {
      existing.locationPermission = true;
      existing.stage = "awaiting_intent";
      advisorSessions.set(sessionId, existing);
      const msg = `${flowText(lang, "locationSaved")} ${flowText(lang, "askLocationShare")}`;
      const payload = createResponseByLang(lang, msg);
      res.json({ ...payload, session_id: sessionId, stage: existing.stage, needs_location: true, memory: { amount: existing.amount, tenure_months: existing.tenureMonths } });
      return;
    }

    if (isNegative(userInput)) {
      existing.locationPermission = false;
      existing.stage = "awaiting_intent";
      advisorSessions.set(sessionId, existing);
      const msg = `${flowText(lang, "locationSaved")} ${flowText(lang, "askIntent")}`;
      const payload = createResponseByLang(lang, msg);
      res.json({ ...payload, session_id: sessionId, stage: existing.stage, memory: { amount: existing.amount, tenure_months: existing.tenureMonths } });
      return;
    }

    const msg = flowText(lang, "askLocationPermission");
    const payload = createResponseByLang(lang, msg);
    res.json({ ...payload, session_id: sessionId, stage: existing.stage, memory: { amount: existing.amount, tenure_months: existing.tenureMonths } });
    return;
  }

  if (existing.stage === "awaiting_intent") {
    const quickAmount = extractAmountFromText(userInput);
    const quickTenure = extractTenureMonthsFromText(userInput);

    if (quickAmount) {
      existing.amount = quickAmount;
      existing.stage = "awaiting_tenure";
      advisorSessions.set(sessionId, existing);
      const msg = flowText(lang, "askTenure");
      const payload = createResponseByLang(lang, msg);
      res.json({ ...payload, session_id: sessionId, stage: existing.stage, memory: { amount: existing.amount, tenure_months: existing.tenureMonths } });
      return;
    }

    if (quickTenure) {
      existing.tenureMonths = quickTenure;
      existing.stage = "awaiting_amount";
      advisorSessions.set(sessionId, existing);
      const msg = flowText(lang, "askAmount");
      const payload = createResponseByLang(lang, msg);
      res.json({ ...payload, session_id: sessionId, stage: existing.stage, memory: { amount: existing.amount, tenure_months: existing.tenureMonths } });
      return;
    }

    if (!detectSavingsIntent(userInput)) {
      const msg = flowText(lang, "askIntent");
      const payload = createResponseByLang(lang, msg);
      advisorSessions.set(sessionId, existing);
      res.json({ ...payload, session_id: sessionId, stage: existing.stage, memory: { amount: existing.amount, tenure_months: existing.tenureMonths } });
      return;
    }

    existing.stage = "awaiting_amount";
    const msg = flowText(lang, "askAmount");
    advisorSessions.set(sessionId, existing);
    const payload = createResponseByLang(lang, msg);
    res.json({ ...payload, session_id: sessionId, stage: existing.stage, memory: { amount: existing.amount, tenure_months: existing.tenureMonths } });
    return;
  }

  if (existing.stage === "awaiting_amount") {
    const amount = extractAmountFromText(userInput);
    if (!amount) {
      const msg = flowText(lang, "invalidAmount");
      const payload = createResponseByLang(lang, msg);
      advisorSessions.set(sessionId, existing);
      res.json({ ...payload, session_id: sessionId, stage: existing.stage, memory: { amount: existing.amount, tenure_months: existing.tenureMonths } });
      return;
    }

    existing.amount = amount;
    existing.stage = "awaiting_tenure";
    advisorSessions.set(sessionId, existing);
    const msg = flowText(lang, "askTenure");
    const payload = createResponseByLang(lang, msg);
    res.json({ ...payload, session_id: sessionId, stage: existing.stage, memory: { amount: existing.amount, tenure_months: existing.tenureMonths } });
    return;
  }

  if (existing.stage === "awaiting_tenure") {
    const tenureMonths = extractTenureMonthsFromText(userInput);
    if (!tenureMonths) {
      const msg = flowText(lang, "invalidTenure");
      const payload = createResponseByLang(lang, msg);
      advisorSessions.set(sessionId, existing);
      res.json({ ...payload, session_id: sessionId, stage: existing.stage });
      return;
    }

    existing.tenureMonths = tenureMonths;

    try {
      const { recommendations } = getFdRecommendationsCore({
        amount: existing.amount,
        tenureMonths: existing.tenureMonths,
        userLanguage,
        nearbyBanks,
        userText: userInput
      });

      const tenureText = formatTenureTextForLang(lang, tenureMonths);

      let finalText;
      try {
        finalText = await generateFdAdvisorNarrative({
          lang,
          amount: existing.amount,
          tenureMonths,
          recommendations
        });
      } catch {
        const intro = flowText(lang, "intro", {
          amountText: formatInr(existing.amount),
          tenureText
        });
        const header = flowText(lang, "top3");
        const body = recommendations.map((r, idx) => {
          const earningLine = earningsTextByLang(lang, formatInr(r.expected_return));
          return `${idx + 1}. ${r.bank_name}\n-> ${earningLine}\n-> ${r.reason}`;
        }).join("\n\n");
        const tail = flowText(lang, "donePrompt");
        finalText = `${intro}\n\n${header}\n\n${body}\n\n${tail}`;
      }

      existing.stage = "done";
      advisorSessions.set(sessionId, existing);

      const payload = createResponseByLang(lang, finalText);
      const localizedRecommendations = recommendations.map((r) => ({
        ...r,
        expected_return: localizeDigits(r.expected_return, lang),
        interest_rate: localizeDigits(r.interest_rate, lang),
        reason: localizeDigits(r.reason, lang),
        distance: localizeDigits(r.distance, lang)
      }));
      res.json({
        ...payload,
        session_id: sessionId,
        stage: existing.stage,
        recommendations: localizedRecommendations,
        memory: { amount: existing.amount, tenure_months: existing.tenureMonths }
      });
      return;
    } catch {
      const payload = createResponseByLang(lang, "Unable to generate FD suggestions right now. Please try again.");
      res.status(500).json({ ...payload, session_id: sessionId, stage: existing.stage, memory: { amount: existing.amount, tenure_months: existing.tenureMonths } });
      return;
    }
  }

  if (existing.stage === "done") {
    const maybeAmount = extractAmountFromText(userInput);
    const maybeTenure = extractTenureMonthsFromText(userInput);

    if (maybeAmount) existing.amount = maybeAmount;
    if (maybeTenure) existing.tenureMonths = maybeTenure;

    if (!existing.amount) {
      existing.stage = "awaiting_amount";
      advisorSessions.set(sessionId, existing);
      const payload = createResponseByLang(lang, flowText(lang, "askAmount"));
      res.json({ ...payload, session_id: sessionId, stage: existing.stage, memory: { amount: existing.amount, tenure_months: existing.tenureMonths } });
      return;
    }

    if (!existing.tenureMonths) {
      existing.stage = "awaiting_tenure";
      advisorSessions.set(sessionId, existing);
      const prefix = flowText(lang, "rememberedContext", {
        amountText: formatInr(existing.amount),
        tenureText: "-"
      });
      const payload = createResponseByLang(lang, `${prefix} ${flowText(lang, "askTenure")}`);
      res.json({ ...payload, session_id: sessionId, stage: existing.stage, memory: { amount: existing.amount, tenure_months: existing.tenureMonths } });
      return;
    }

    existing.stage = "awaiting_tenure";
    advisorSessions.set(sessionId, existing);
    const msg = flowText(lang, "askTenure");
    const payload = createResponseByLang(lang, msg);
    res.json({ ...payload, session_id: sessionId, stage: existing.stage, memory: { amount: existing.amount, tenure_months: existing.tenureMonths } });
    return;
  }

  existing.stage = "awaiting_amount";
  existing.amount = null;
  existing.tenureMonths = null;
  advisorSessions.set(sessionId, existing);
  const restartMsg = flowText(lang, "askAmount");
  const payload = createResponseByLang(lang, restartMsg);
  res.json({ ...payload, session_id: sessionId, stage: existing.stage, memory: { amount: existing.amount, tenure_months: existing.tenureMonths } });
});

export default router;
