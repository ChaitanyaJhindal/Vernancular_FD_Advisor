import fs from "fs";
import https from "https";
import path from "path";
import {
  SEARCH_RADIUS_METERS,
  OVERPASS_MIRRORS,
  BANKS_CSV_CANDIDATES,
  FD_PRODUCTS_CSV_CANDIDATES
} from "../config/app-config.js";

let cachedBanks = null;
let cachedFdProducts = null;

export function detectLanguageStyle(input = "") {
  const text = String(input || "").trim();
  if (!text) return "en";

  const hasDevanagari = /[\u0900-\u097F]/.test(text);
  const hasGujarati = /[\u0A80-\u0AFF]/.test(text);
  const hasTamil = /[\u0B80-\u0BFF]/.test(text);
  const hasTelugu = /[\u0C00-\u0C7F]/.test(text);
  const hasKannada = /[\u0C80-\u0CFF]/.test(text);
  const hasMalayalam = /[\u0D00-\u0D7F]/.test(text);
  const hasBengali = /[\u0980-\u09FF]/.test(text);
  const hasGurmukhi = /[\u0A00-\u0A7F]/.test(text);
  const hasLatin = /[A-Za-z]/.test(text);
  const hasHinglishWords = /(mujhe|mujhko|mera|meri|hai|karna|karni|kitna|kitne|paisa|paise|saal|mahina|nearby|bank|fd|sip)/i.test(text);

  if (hasDevanagari && hasLatin) {
    const latinWords = (text.match(/[A-Za-z]+/g) || []).map((w) => w.toLowerCase());
    const nonAcronymWordFound = latinWords.some((w) => w.length > 2 && !["fd", "sip", "atm"].includes(w));
    return nonAcronymWordFound ? "hinglish" : "hi";
  }
  if (hasLatin && hasHinglishWords) return "hinglish";
  if (hasGujarati) return "gu";
  if (hasTamil) return "ta";
  if (hasTelugu) return "te";
  if (hasKannada) return "kn";
  if (hasMalayalam) return "ml";
  if (hasBengali) return "bn";
  if (hasGurmukhi) return "pa";
  if (hasDevanagari) return "hi";
  return "en";
}

function parseCsvFile(filePath) {
  const text = fs.readFileSync(filePath, "utf8").trim();
  if (!text) return [];

  const lines = text.split(/\r?\n/);
  const headers = lines[0].split(",").map((h) => h.trim());

  return lines.slice(1).filter(Boolean).map((line) => {
    const parts = line.split(",");
    const row = {};

    for (let i = 0; i < headers.length; i += 1) {
      row[headers[i]] = (parts[i] || "").trim();
    }

    return row;
  });
}

function resolveFirstExistingCsv(candidates) {
  for (const fileName of candidates) {
    const fullPath = path.join(process.cwd(), fileName);
    if (fs.existsSync(fullPath)) {
      return fullPath;
    }
  }
  return null;
}

function toBool(value) {
  return String(value || "").toLowerCase() === "true";
}

export function normalizeBankName(name) {
  return String(name || "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

export function formatInr(amount) {
  return `₹${Number(amount || 0).toLocaleString("en-IN", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0
  })}`;
}

export function localizeDigits(text, lang) {
  const value = String(text ?? "");

  const maps = {
    hi: ["०", "१", "२", "३", "४", "५", "६", "७", "८", "९"],
    gu: ["૦", "૧", "૨", "૩", "૪", "૫", "૬", "૭", "૮", "૯"],
    ta: ["௦", "௧", "௨", "௩", "௪", "௫", "௬", "௭", "௮", "௯"]
  };

  const map = maps[lang];
  if (!map) return value;

  return value.replace(/\d/g, (d) => map[Number(d)]);
}

export function detectSavingsIntent(text = "") {
  return /(fd|fixed deposit|saving|savings|invest|investment|sip|बचत|निवेश|फिक्स्ड|રોકાણ|બચત|வைப்பு|சேமிப்பு)/i.test(text);
}

export function detectNearbyIntent(text = "") {
  return /(nearby|nearest|bank|atm|पास|नजदीक|પાસ|નજીક|அருகில்|வங்கி|ఏటీఎం|బ్యాంక్)/i.test(text);
}

export function isAffirmative(input = "") {
  return /^(yes|y|haan|ha|han|h|ok|sure|allow|true|yes please|ठीक|हाँ|હા|ஆம்)$/i.test(String(input || "").trim());
}

export function isNegative(input = "") {
  return /^(no|n|nah|nahi|nope|deny|false|ना|नहीं|ના|இல்லை)$/i.test(String(input || "").trim());
}

export function extractAmountFromText(input = "") {
  const text = String(input || "").toLowerCase().replace(/,/g, "").trim();
  const match = text.match(/(\d+(?:\.\d+)?)(\s*)(lakh|lac|k)?/i);
  if (!match) return null;

  let value = Number(match[1]);
  const suffix = String(match[3] || "").toLowerCase();

  if (suffix === "k") value *= 1000;
  if (suffix === "lakh" || suffix === "lac") value *= 100000;

  return Number.isFinite(value) && value > 0 ? Math.round(value) : null;
}

export function extractTenureMonthsFromText(input = "") {
  const text = String(input || "").toLowerCase();

  const years = text.match(/(\d+)\s*(year|years|yr|yrs|saal|sal|साल|वर्ष)/i);
  if (years) {
    const y = Number(years[1]);
    if (Number.isFinite(y) && y > 0) return y * 12;
  }

  const months = text.match(/(\d+)\s*(month|months|mahina|mahine|महीना|महीने)/i);
  if (months) {
    const m = Number(months[1]);
    if (Number.isFinite(m) && m > 0) return m;
  }

  if (/1\s*(saal|sal|साल|year)/i.test(text)) return 12;
  if (/2\s*(saal|sal|साल|year)/i.test(text)) return 24;
  if (/3\s*(saal|sal|साल|year)/i.test(text)) return 36;

  return null;
}

export function flowText(lang, key, vars = {}) {
  const map = {
    en: {
      askAmount: "How much do you want to invest?",
      askTenure: "For how long do you want to keep it? (1 year / 2 years)",
      askIntent: "I can help with FD and savings. Tell me if you want FD suggestions.",
      invalidAmount: "Please share a valid amount, for example 100000.",
      invalidTenure: "Please share tenure clearly, for example 12 months or 1 year.",
      intro: `If you keep ${vars.amountText} for ${vars.tenureText}, expected earnings can be:`,
      top3: "These are the 3 best options:",
      nearbyEmpty: "I could not find nearby banks in your input.",
      nearbyIntro: "Nearby banks for you:",
      donePrompt: "If you want, I can also compare for another amount or tenure.",
      askLocationPermission: "Can I use your location to include nearby banks in suggestions? (yes/no)",
      askLocationShare: "Please share location in app so I can find nearby banks. You can also continue without location.",
      locationSaved: "Location preference saved.",
      rememberedContext: `From your previous details: amount ${vars.amountText}, tenure ${vars.tenureText}.`
    },
    hi: {
      askAmount: "आप कितना पैसा निवेश करना चाहते हैं?",
      askTenure: "आप कितने समय के लिए रखना चाहते हैं? (1 साल / 2 साल)",
      askIntent: "मैं FD और बचत में मदद कर सकता हूं. अगर आप FD सुझाव चाहते हैं तो बताएं.",
      invalidAmount: "कृपया सही राशि बताएं, जैसे 100000.",
      invalidTenure: "कृपया अवधि साफ बताएं, जैसे 12 महीने या 1 साल.",
      intro: `अगर आप ${vars.amountText} को ${vars.tenureText} के लिए रखते हैं, तो अनुमानित कमाई यह हो सकती है:`,
      top3: "ये 3 सबसे अच्छे विकल्प हैं:",
      nearbyEmpty: "आपके इनपुट में नजदीकी बैंक जानकारी नहीं मिली.",
      nearbyIntro: "आपके पास ये बैंक हैं:",
      donePrompt: "चाहें तो मैं दूसरी राशि या अवधि के लिए भी तुलना कर दूं.",
      askLocationPermission: "क्या मैं आपकी लोकेशन इस्तेमाल करूं ताकि नजदीकी बैंक भी जोड़ सकूं? (yes/no)",
      askLocationShare: "कृपया ऐप में लोकेशन शेयर करें, फिर मैं पास के बैंक जोड़ दूंगा. चाहें तो बिना लोकेशन भी जारी रख सकते हैं.",
      locationSaved: "लोकेशन सेटिंग सेव हो गई है.",
      rememberedContext: `आपकी पिछली जानकारी: राशि ${vars.amountText}, अवधि ${vars.tenureText}.`
    },
    hinglish: {
      askAmount: "Kitna paisa invest karna chahte hain?",
      askTenure: "Kitne time ke liye rakhna chahte hain? (1 saal / 2 saal)",
      askIntent: "Main FD aur savings me help kar sakta hoon. FD suggestion chahiye to bolo.",
      invalidAmount: "Please valid amount batao, jaise 100000.",
      invalidTenure: "Please tenure clear batao, jaise 12 months ya 1 saal.",
      intro: `Agar aap ${vars.amountText} ko ${vars.tenureText} ke liye rakhte hain, to estimated earning yeh ho sakti hai:`,
      top3: "Yeh 3 best options hain:",
      nearbyEmpty: "Nearby bank info input me nahi mila.",
      nearbyIntro: "Aapke paas yeh banks hain:",
      donePrompt: "Chaaho to main dusre amount ya tenure ke liye bhi compare kar doon.",
      askLocationPermission: "Kya main aapki location use karun taaki nearby banks bhi add kar sakun? (yes/no)",
      askLocationShare: "Please app me location share karo, phir main nearby banks add kar dunga. Chaaho to bina location bhi continue kar sakte ho.",
      locationSaved: "Location preference save ho gayi.",
      rememberedContext: `Aapki purani details: amount ${vars.amountText}, tenure ${vars.tenureText}.`
    },
    gu: {
      askAmount: "તમે કેટલા પૈસા રોકાણ કરવા માંગો છો?",
      askTenure: "તમે કેટલા સમય માટે રાખવા માંગો છો? (1 વર્ષ / 2 વર્ષ)",
      askIntent: "હું FD અને બચત વિશે મદદ કરી શકું છું. FD સૂચન જોઈએ તો કહો.",
      invalidAmount: "કૃપા કરીને સાચી રકમ આપો, જેમ કે 100000.",
      invalidTenure: "કૃપા કરીને અવધિ સ્પષ્ટ આપો, જેમ કે 12 મહિના અથવા 1 વર્ષ.",
      intro: `જો તમે ${vars.amountText} ને ${vars.tenureText} માટે રાખો, તો અંદાજિત કમાણી આવી હોઈ શકે:`,
      top3: "આ 3 શ્રેષ્ઠ વિકલ્પો છે:",
      nearbyEmpty: "તમારા ઇનપુટમાં નજીકના બેન્ક મળ્યા નથી.",
      nearbyIntro: "તમારા નજીકના બેન્ક:",
      donePrompt: "ઇચ્છો તો હું બીજી રકમ અથવા અવધિ માટે પણ સરખામણી કરી દઉં.",
      askLocationPermission: "શું હું તમારી લોકેશન ઉપયોગ કરું જેથી નજીકના બેન્ક પણ ઉમેરું? (yes/no)",
      askLocationShare: "કૃપા કરીને એપમાં લોકેશન શેર કરો, પછી હું નજીકના બેન્ક ઉમેરું. ઇચ્છો તો લોકેશન વગર પણ ચાલુ રાખી શકો.",
      locationSaved: "લોકેશન પસંદગી સેવ થઈ ગઈ છે.",
      rememberedContext: `તમારી જૂની માહિતી: રકમ ${vars.amountText}, અવધિ ${vars.tenureText}.`
    },
    ta: {
      askAmount: "எவ்வளவு தொகையை முதலீடு செய்ய விரும்புகிறீர்கள்?",
      askTenure: "எத்தனை காலத்திற்கு வைக்க விரும்புகிறீர்கள்? (1 ஆண்டு / 2 ஆண்டு)",
      askIntent: "FD மற்றும் சேமிப்பில் உதவ முடியும். FD பரிந்துரை வேண்டுமா சொல்லுங்கள்.",
      invalidAmount: "தயவு செய்து சரியான தொகையை சொல்லுங்கள், உதா. 100000.",
      invalidTenure: "தயவு செய்து காலத்தை தெளிவாக சொல்லுங்கள், உதா. 12 மாதங்கள் அல்லது 1 ஆண்டு.",
      intro: `${vars.amountText} தொகையை ${vars.tenureText} காலத்திற்கு வைத்தால், கணக்கில் வரும் வருமானம்:`,
      top3: "இந்த 3 சிறந்த விருப்பங்கள்:",
      nearbyEmpty: "உங்கள் உள்ளீட்டில் அருகிலுள்ள வங்கி தகவல் இல்லை.",
      nearbyIntro: "உங்களுக்குப் அருகிலுள்ள வங்கிகள்:",
      donePrompt: "வேண்டுமானால் வேறு தொகை அல்லது காலத்திற்கும் ஒப்பிட்டு தரலாம்.",
      askLocationPermission: "அருகிலுள்ள வங்கிகளை சேர்க்க உங்கள் இடம் பயன்படுத்தலாமா? (yes/no)",
      askLocationShare: "தயவு செய்து app-ல் location share செய்யுங்கள். பிறகு அருகிலுள்ள வங்கிகளை சேர்க்கிறேன். location இல்லாமலும் தொடரலாம்.",
      locationSaved: "Location விருப்பம் சேமிக்கப்பட்டது.",
      rememberedContext: `முந்தைய விவரம்: தொகை ${vars.amountText}, காலம் ${vars.tenureText}.`
    },
    bn: {
      askAmount: "আপনি কত টাকা বিনিয়োগ করতে চান?",
      askTenure: "কত সময়ের জন্য রাখতে চান? (১ বছর / ২ বছর)",
      askIntent: "আমি FD এবং সেভিংস নিয়ে সাহায্য করতে পারি। FD পরামর্শ চাইলে বলুন।",
      invalidAmount: "দয়া করে সঠিক পরিমাণ বলুন, যেমন 100000।",
      invalidTenure: "দয়া করে সময়সীমা পরিষ্কার বলুন, যেমন 12 মাস বা 1 বছর।",
      intro: `আপনি ${vars.amountText} টাকা ${vars.tenureText} সময়ের জন্য রাখলে আনুমানিক আয় হতে পারে:`,
      top3: "সেরা ৩টি বিকল্প:",
      nearbyEmpty: "আপনার ইনপুটে কাছাকাছি ব্যাংকের তথ্য পাওয়া যায়নি।",
      nearbyIntro: "আপনার কাছাকাছি ব্যাংকগুলো:",
      donePrompt: "চাইলে অন্য পরিমাণ বা সময়ের জন্যও তুলনা করে দিতে পারি।",
      askLocationPermission: "পরামর্শে কাছাকাছি ব্যাংক যোগ করতে আপনার লোকেশন ব্যবহার করতে পারি? (yes/no)",
      askLocationShare: "অ্যাপে লোকেশন শেয়ার করুন, তাহলে আমি কাছাকাছি ব্যাংক দেখাব। লোকেশন ছাড়াও চালিয়ে যেতে পারেন।",
      locationSaved: "লোকেশন পছন্দ সংরক্ষণ হয়েছে।",
      rememberedContext: `আগের তথ্য: পরিমাণ ${vars.amountText}, সময় ${vars.tenureText}.`
    },
    kn: {
      askAmount: "ನೀವು ಎಷ್ಟು ಹಣ ಹೂಡಿಕೆ ಮಾಡಲು ಬಯಸುತ್ತೀರಿ?",
      askTenure: "ಎಷ್ಟು ಅವಧಿಗೆ ಇಡಲು ಬಯಸುತ್ತೀರಿ? (1 ವರ್ಷ / 2 ವರ್ಷ)",
      askIntent: "ನಾನು FD ಮತ್ತು ಉಳಿತಾಯದಲ್ಲಿ ಸಹಾಯ ಮಾಡಬಹುದು. FD ಸಲಹೆ ಬೇಕಿದ್ರೆ ಹೇಳಿ.",
      invalidAmount: "ದಯವಿಟ್ಟು ಸರಿಯಾದ ಮೊತ್ತವನ್ನು ತಿಳಿಸಿ, ಉದಾಹರಣೆ 100000.",
      invalidTenure: "ದಯವಿಟ್ಟು ಅವಧಿಯನ್ನು ಸ್ಪಷ್ಟವಾಗಿ ಹೇಳಿ, ಉದಾಹರಣೆ 12 ತಿಂಗಳು ಅಥವಾ 1 ವರ್ಷ.",
      intro: `ನೀವು ${vars.amountText} ಅನ್ನು ${vars.tenureText} ಅವಧಿಗೆ ಇಟ್ಟರೆ ಅಂದಾಜು ಆದಾಯ ಹೀಗಿರಬಹುದು:`,
      top3: "ಟಾಪ್ 3 ಉತ್ತಮ ಆಯ್ಕೆಗಳು:",
      nearbyEmpty: "ನಿಮ್ಮ ಇನ್‌ಪುಟ್‌ನಲ್ಲಿ ಸಮೀಪದ ಬ್ಯಾಂಕ್ ಮಾಹಿತಿ ಸಿಗಲಿಲ್ಲ.",
      nearbyIntro: "ನಿಮ್ಮ ಸಮೀಪದ ಬ್ಯಾಂಕ್‌ಗಳು:",
      donePrompt: "ಬೇಡಿಕೆ ಇದ್ದರೆ ಬೇರೆ ಮೊತ್ತ ಅಥವಾ ಅವಧಿಗೂ ಹೋಲಿಕೆ ಮಾಡುತ್ತೇನೆ.",
      askLocationPermission: "ಸಲಹೆಯಲ್ಲಿ ಸಮೀಪದ ಬ್ಯಾಂಕ್ ಸೇರಿಸಲು ನಿಮ್ಮ ಸ್ಥಳವನ್ನು ಬಳಸಬಹುದೇ? (yes/no)",
      askLocationShare: "ದಯವಿಟ್ಟು ಆಪ್‌ನಲ್ಲಿ ಸ್ಥಳ ಹಂಚಿಕೊಳ್ಳಿ. ನಂತರ ಸಮೀಪದ ಬ್ಯಾಂಕ್‌ಗಳನ್ನು ಸೇರಿಸುತ್ತೇನೆ. ಸ್ಥಳವಿಲ್ಲದೇ ಮುಂದುವರಿಯಬಹುದು.",
      locationSaved: "ಸ್ಥಳ ಆಯ್ಕೆ ಉಳಿಸಲಾಗಿದೆ.",
      rememberedContext: `ಹಿಂದಿನ ವಿವರ: ಮೊತ್ತ ${vars.amountText}, ಅವಧಿ ${vars.tenureText}.`
    },
    ml: {
      askAmount: "നിങ്ങൾ എത്ര തുക നിക്ഷേപിക്കാൻ ആഗ്രഹിക്കുന്നു?",
      askTenure: "എത്ര കാലത്തേക്ക് നിക്ഷേപിക്കണം? (1 വർഷം / 2 വർഷം)",
      askIntent: "FDയും സംരക്ഷണവും സംബന്ധിച്ച് ഞാൻ സഹായിക്കാം. FD നിർദേശം വേണമെങ്കിൽ പറയൂ.",
      invalidAmount: "ദയവായി ശരിയായ തുക പറയൂ, ഉദാ: 100000.",
      invalidTenure: "ദയവായി കാലാവധി വ്യക്തമാക്കൂ, ഉദാ: 12 മാസം അല്ലെങ്കിൽ 1 വർഷം.",
      intro: `${vars.amountText} തുക ${vars.tenureText} കാലത്തേക്ക് വെച്ചാൽ പ്രതീക്ഷിക്കാവുന്ന വരുമാനം:`,
      top3: "മികച്ച 3 ഓപ്ഷനുകൾ:",
      nearbyEmpty: "നിങ്ങളുടെ ഇൻപുട്ടിൽ സമീപ ബാങ്ക് വിവരം കണ്ടെത്താനായില്ല.",
      nearbyIntro: "നിങ്ങളുടെ സമീപ ബാങ്കുകൾ:",
      donePrompt: "ആവശ്യമെങ്കിൽ മറ്റൊരു തുക/കാലാവധിക്കും താരതമ്യം നൽകി തരും.",
      askLocationPermission: "നിർദേശത്തിൽ സമീപ ബാങ്കുകൾ ചേർക്കാൻ നിങ്ങളുടെ ലൊക്കേഷൻ ഉപയോഗിക്കട്ടെയോ? (yes/no)",
      askLocationShare: "ആപ്പിൽ ലൊക്കേഷൻ ഷെയർ ചെയ്യൂ. ശേഷം സമീപ ബാങ്കുകൾ ചേർക്കാം. ലൊക്കേഷൻ ഇല്ലാതെയും തുടരാം.",
      locationSaved: "ലൊക്കേഷൻ മുൻഗണന സേവ് ചെയ്തു.",
      rememberedContext: `മുൻ വിവരങ്ങൾ: തുക ${vars.amountText}, കാലാവധി ${vars.tenureText}.`
    },
    mr: {
      askAmount: "तुम्हाला किती रक्कम गुंतवायची आहे?",
      askTenure: "किती कालावधीसाठी ठेवायचे आहे? (1 वर्ष / 2 वर्षे)",
      askIntent: "मी FD आणि बचतीत मदत करू शकतो. FD सल्ला हवा असल्यास सांगा.",
      invalidAmount: "कृपया योग्य रक्कम सांगा, उदा. 100000.",
      invalidTenure: "कृपया कालावधी स्पष्ट सांगा, उदा. 12 महिने किंवा 1 वर्ष.",
      intro: `तुम्ही ${vars.amountText} रक्कम ${vars.tenureText} कालावधीसाठी ठेवल्यास अंदाजे कमाई अशी होऊ शकते:`,
      top3: "सर्वोत्तम 3 पर्याय:",
      nearbyEmpty: "तुमच्या इनपुटमध्ये जवळच्या बँकेची माहिती मिळाली नाही.",
      nearbyIntro: "तुमच्या जवळच्या बँका:",
      donePrompt: "हवे असल्यास दुसऱ्या रक्कम/कालावधीसाठीही तुलना करू शकतो.",
      askLocationPermission: "सूचनांमध्ये जवळच्या बँका जोडण्यासाठी तुमचे लोकेशन वापरू का? (yes/no)",
      askLocationShare: "कृपया अॅपमध्ये लोकेशन शेअर करा. मग जवळच्या बँका जोडतो. लोकेशनशिवायही पुढे जाऊ शकता.",
      locationSaved: "लोकेशन प्राधान्य सेव्ह झाले आहे.",
      rememberedContext: `मागील माहिती: रक्कम ${vars.amountText}, कालावधी ${vars.tenureText}.`
    },
    od: {
      askAmount: "ଆପଣ କେତେ ଟଙ୍କା ନିବେଶ କରିବାକୁ ଚାହୁଁଛନ୍ତି?",
      askTenure: "କେତେ ସମୟ ପାଇଁ ରଖିବାକୁ ଚାହୁଁଛନ୍ତି? (1 ବର୍ଷ / 2 ବର୍ଷ)",
      askIntent: "ମୁଁ FD ଏବଂ ସେଭିଂସ୍‌ରେ ସାହାଯ୍ୟ କରିପାରିବି। FD ସୁପାରିଶ ଚାହୁଁଥିଲେ କହନ୍ତୁ।",
      invalidAmount: "ଦୟାକରି ଠିକ୍ ରାଶି କହନ୍ତୁ, ଯେପରି 100000।",
      invalidTenure: "ଦୟାକରି ସମୟସୀମା ସ୍ପଷ୍ଟ କରନ୍ତୁ, ଯେପରି 12 ମାସ କିମ୍ବା 1 ବର୍ଷ।",
      intro: `ଆପଣ ${vars.amountText} ଟଙ୍କାକୁ ${vars.tenureText} ପାଇଁ ରଖିଲେ ଅନୁମାନିତ ଆୟ ଏହିପରି ହୋଇପାରେ:`,
      top3: "ସର୍ବଶ୍ରେଷ୍ଠ 3ଟି ବିକଳ୍ପ:",
      nearbyEmpty: "ଆପଣଙ୍କ ଇନପୁଟ୍‌ରେ ନିକଟସ୍ଥ ବ୍ୟାଙ୍କ ସୂଚନା ମିଳିଲା ନାହିଁ।",
      nearbyIntro: "ଆପଣଙ୍କ ନିକଟର ବ୍ୟାଙ୍କଗୁଡ଼ିକ:",
      donePrompt: "ଚାହିଲେ ଅନ୍ୟ ରାଶି କିମ୍ବା ସମୟ ପାଇଁ ମଧ୍ୟ ତୁଳନା କରିଦେବି।",
      askLocationPermission: "ସୁପାରିଶରେ ନିକଟସ୍ଥ ବ୍ୟାଙ୍କ ଯୋଡ଼ିବା ପାଇଁ ଆପଣଙ୍କ ଲୋକେସନ୍ ବ୍ୟବହାର କରିପାରିବି କି? (yes/no)",
      askLocationShare: "ଦୟାକରି ଆପ୍‌ରେ ଲୋକେସନ୍ ସେୟାର କରନ୍ତୁ। ପରେ ନିକଟସ୍ଥ ବ୍ୟାଙ୍କ ଯୋଡ଼ିଦେବି। ଲୋକେସନ୍ ଛଡ଼ା ମଧ୍ୟ ଜାରି ରଖିପାରିବେ।",
      locationSaved: "ଲୋକେସନ୍ ପସନ୍ଦ ସେଭ୍ ହେଲା।",
      rememberedContext: `ପୂର୍ବ ତଥ୍ୟ: ରାଶି ${vars.amountText}, ସମୟ ${vars.tenureText}.`
    },
    pa: {
      askAmount: "ਤੁਸੀਂ ਕਿੰਨੀ ਰਕਮ ਨਿਵੇਸ਼ ਕਰਨੀ ਚਾਹੁੰਦੇ ਹੋ?",
      askTenure: "ਕਿੰਨੇ ਸਮੇਂ ਲਈ ਰੱਖਣਾ ਚਾਹੁੰਦੇ ਹੋ? (1 ਸਾਲ / 2 ਸਾਲ)",
      askIntent: "ਮੈਂ FD ਅਤੇ ਬਚਤ ਵਿੱਚ ਮਦਦ ਕਰ ਸਕਦਾ ਹਾਂ। FD ਸੁਝਾਅ ਚਾਹੀਦਾ ਹੋਵੇ ਤਾਂ ਦੱਸੋ।",
      invalidAmount: "ਕਿਰਪਾ ਕਰਕੇ ਠੀਕ ਰਕਮ ਦੱਸੋ, ਜਿਵੇਂ 100000.",
      invalidTenure: "ਕਿਰਪਾ ਕਰਕੇ ਮਿਆਦ ਸਪੱਸ਼ਟ ਦੱਸੋ, ਜਿਵੇਂ 12 ਮਹੀਨੇ ਜਾਂ 1 ਸਾਲ.",
      intro: `ਜੇ ਤੁਸੀਂ ${vars.amountText} ਨੂੰ ${vars.tenureText} ਲਈ ਰੱਖੋ, ਤਾਂ ਅੰਦਾਜ਼ੇ ਮੁਤਾਬਕ ਕਮਾਈ ਇਹ ਹੋ ਸਕਦੀ ਹੈ:`,
      top3: "ਸਭ ਤੋਂ ਵਧੀਆ 3 ਵਿਕਲਪ:",
      nearbyEmpty: "ਤੁਹਾਡੇ ਇਨਪੁੱਟ ਵਿੱਚ ਨੇੜਲੇ ਬੈਂਕ ਦੀ ਜਾਣਕਾਰੀ ਨਹੀਂ ਮਿਲੀ।",
      nearbyIntro: "ਤੁਹਾਡੇ ਨੇੜਲੇ ਬੈਂਕ:",
      donePrompt: "ਚਾਹੋ ਤਾਂ ਹੋਰ ਰਕਮ ਜਾਂ ਮਿਆਦ ਲਈ ਵੀ ਤੁਲਨਾ ਕਰ ਦੇਵਾਂ।",
      askLocationPermission: "ਸੁਝਾਅ ਵਿੱਚ ਨੇੜਲੇ ਬੈਂਕ ਜੋੜਨ ਲਈ ਤੁਹਾਡੀ ਲੋਕੇਸ਼ਨ ਵਰਤ ਲਵਾਂ? (yes/no)",
      askLocationShare: "ਕਿਰਪਾ ਕਰਕੇ ਐਪ ਵਿੱਚ ਲੋਕੇਸ਼ਨ ਸ਼ੇਅਰ ਕਰੋ। ਫਿਰ ਨੇੜਲੇ ਬੈਂਕ ਜੋੜ ਦਿਆਂਗਾ। ਲੋਕੇਸ਼ਨ ਤੋਂ ਬਿਨਾਂ ਵੀ ਜਾਰੀ ਰੱਖ ਸਕਦੇ ਹੋ।",
      locationSaved: "ਲੋਕੇਸ਼ਨ ਪਸੰਦ ਸੇਵ ਹੋ ਗਈ ਹੈ।",
      rememberedContext: `ਪਿਛਲੀ ਜਾਣਕਾਰੀ: ਰਕਮ ${vars.amountText}, ਮਿਆਦ ${vars.tenureText}.`
    },
    te: {
      askAmount: "మీరు ఎంత మొత్తం పెట్టుబడి పెట్టాలని అనుకుంటున్నారు?",
      askTenure: "ఎంత కాలానికి పెట్టాలనుకుంటున్నారు? (1 సంవత్సరం / 2 సంవత్సరాలు)",
      askIntent: "FD మరియు సేవింగ్స్‌లో నేను సహాయం చేయగలను. FD సూచనలు కావాలంటే చెప్పండి.",
      invalidAmount: "దయచేసి సరైన మొత్తం చెప్పండి, ఉదాహరణకు 100000.",
      invalidTenure: "దయచేసి కాలవ్యవధి స్పష్టంగా చెప్పండి, ఉదా: 12 నెలలు లేదా 1 సంవత్సరం.",
      intro: `మీరు ${vars.amountText} మొత్తాన్ని ${vars.tenureText} పాటు ఉంచితే అంచనా ఆదాయం ఇలా ఉండొచ్చు:`,
      top3: "టాప్ 3 ఉత్తమ ఎంపికలు:",
      nearbyEmpty: "మీ ఇన్‌పుట్‌లో సమీప బ్యాంక్ సమాచారం దొరకలేదు.",
      nearbyIntro: "మీకు సమీపంలోని బ్యాంకులు:",
      donePrompt: "కావాలంటే మరో మొత్తం లేదా కాలానికి కూడా పోలిక ఇస్తాను.",
      askLocationPermission: "సూచనల్లో సమీప బ్యాంకులు చేర్చడానికి మీ లొకేషన్ వాడవచ్చా? (yes/no)",
      askLocationShare: "దయచేసి యాప్‌లో లొకేషన్ షేర్ చేయండి. తర్వాత సమీప బ్యాంకులు చేర్చుతాను. లొకేషన్ లేకపోయినా కొనసాగవచ్చు.",
      locationSaved: "లొకేషన్ ఎంపిక సేవ్ అయింది.",
      rememberedContext: `మునుపటి వివరాలు: మొత్తం ${vars.amountText}, కాలం ${vars.tenureText}.`
    }
  };

  const i18n = map[lang] || map.en;
  return i18n[key] || map.en[key] || "";
}

export function earningsTextByLang(lang, amountText) {
  const map = {
    en: `you may get about ${amountText}`,
    hi: `आपको लगभग ${amountText} मिल सकता है`,
    hinglish: `aapko lagbhag ${amountText} mil sakta hai`,
    gu: `તમને અંદાજે ${amountText} મળી શકે`,
    ta: `சுமார் ${amountText} கிடைக்கலாம்`,
    bn: `আপনি প্রায় ${amountText} পেতে পারেন`,
    kn: `ನಿಮಗೆ ಸುಮಾರು ${amountText} ಸಿಗಬಹುದು`,
    ml: `നിങ്ങൾക്ക് ഏകദേശം ${amountText} ലഭിക്കാം`,
    mr: `तुम्हाला अंदाजे ${amountText} मिळू शकते`,
    od: `ଆପଣ ପ୍ରାୟ ${amountText} ପାଇପାରନ୍ତି`,
    pa: `ਤੁਹਾਨੂੰ ਲਗਭਗ ${amountText} ਮਿਲ ਸਕਦਾ ਹੈ`,
    te: `మీకు సుమారు ${amountText} రావచ్చు`
  };
  return map[lang] || map.en;
}

function loadFdData() {
  if (cachedBanks && cachedFdProducts) {
    return { banks: cachedBanks, fdProducts: cachedFdProducts };
  }

  const banksPath = resolveFirstExistingCsv(BANKS_CSV_CANDIDATES);
  const productsPath = resolveFirstExistingCsv(FD_PRODUCTS_CSV_CANDIDATES);

  if (!banksPath || !productsPath) {
    throw new Error("Required CSV files not found. Expected banks.csv/fd_banks_120.csv and fd_products.csv/fd_products_120.csv");
  }

  cachedBanks = parseCsvFile(banksPath).map((b) => ({
    bank_id: Number(b.bank_id),
    bank_name: b.bank_name,
    bank_type: String(b.bank_type || "").toLowerCase(),
    is_government: toBool(b.is_government),
    is_rbi_regulated: toBool(b.is_rbi_regulated),
    online_fd_available: toBool(b.online_fd_available),
    preferred_tag: b.preferred_tag || "trusted"
  }));

  cachedFdProducts = parseCsvFile(productsPath).map((p) => ({
    product_id: Number(p.product_id),
    bank_id: Number(p.bank_id),
    tenure_months: Number(p.tenure_months),
    interest_rate: Number(p.interest_rate),
    senior_citizen_rate: Number(p.senior_citizen_rate || 0)
  }));

  return { banks: cachedBanks, fdProducts: cachedFdProducts };
}

function getTrustScore(bank) {
  if (bank.is_government || bank.bank_type === "public") return 100;
  if (bank.bank_type === "private") return 80;
  if (bank.bank_type === "sfb") return 65;
  if (bank.bank_type === "cooperative") return 50;
  return 60;
}

function getDistanceScore(bankName, nearbyLookup) {
  const directDistance = nearbyLookup.get(normalizeBankName(bankName));
  const distance = Number(directDistance);

  if (!Number.isFinite(distance)) return 50;
  if (distance < 2) return 100;
  if (distance < 5) return 80;
  return 60;
}

export function resolveLangFromInput(userLanguage, fallbackText = "") {
  const raw = String(userLanguage || "auto").toLowerCase().trim();
  if (!raw || raw === "auto") {
    return detectLanguageStyle(fallbackText);
  }

  if (["english", "en"].includes(raw)) return "en";
  if (["hindi", "hi"].includes(raw)) return "hi";
  if (["hinglish"].includes(raw)) return "hinglish";
  if (["gujarati", "gu"].includes(raw)) return "gu";
  if (["tamil", "ta"].includes(raw)) return "ta";
  if (["bengali", "bangla", "bn"].includes(raw)) return "bn";
  if (["kannada", "kn"].includes(raw)) return "kn";
  if (["malayalam", "ml"].includes(raw)) return "ml";
  if (["marathi", "mr"].includes(raw)) return "mr";
  if (["odia", "oriya", "od"].includes(raw)) return "od";
  if (["punjabi", "pa"].includes(raw)) return "pa";
  if (["telugu", "te"].includes(raw)) return "te";
  return detectLanguageStyle(raw);
}

function buildFdReason(lang, item) {
  const isNearby = item.distanceText !== "N/A";
  const isHighReturn = item.interest_rate >= 7.0;
  const isSafe = item.tag === "trusted" || item.trust_score >= 90;

  const reasonByLang = {
    en: isHighReturn
      ? (isNearby ? "Good return and nearby branch for easier access" : "Good return for this tenure")
      : (isSafe ? "This bank is generally trusted and stable" : "Balanced option with simple process"),
    hi: isHighReturn
      ? (isNearby ? "रिटर्न अच्छा है और शाखा पास में है" : "इस अवधि के लिए रिटर्न अच्छा है")
      : (isSafe ? "यह बैंक आम तौर पर भरोसेमंद और स्थिर है" : "यह विकल्प संतुलित और आसान है"),
    hinglish: isHighReturn
      ? (isNearby ? "Return achha hai aur branch paas me hai" : "Is tenure ke liye return achha hai")
      : (isSafe ? "Yeh bank usually trusted aur stable hai" : "Yeh balanced aur easy option hai"),
    gu: isHighReturn
      ? (isNearby ? "રિટર્ન સારું છે અને બ્રાંચ નજીકમાં છે" : "આ અવધિ માટે રિટર્ન સારું છે")
      : (isSafe ? "આ બેંક સામાન્ય રીતે વિશ્વસનીય અને સ્થિર છે" : "આ વિકલ્પ સંતુલિત અને સરળ છે"),
    ta: isHighReturn
      ? (isNearby ? "வருமானம் நல்லது, கிளை அருகில் உள்ளது" : "இந்த காலத்திற்கு நல்ல வருமானம் தருகிறது")
      : (isSafe ? "இந்த வங்கி பொதுவாக நம்பகமானதும் நிலைத்தன்மையுடனும் உள்ளது" : "இது சமநிலையான எளிய தேர்வு"),
    bn: isHighReturn
      ? (isNearby ? "রিটার্ন ভালো এবং শাখা কাছাকাছি" : "এই মেয়াদের জন্য রিটার্ন ভালো")
      : (isSafe ? "এই ব্যাংক সাধারণত বিশ্বস্ত এবং স্থিতিশীল" : "এটি একটি ব্যালান্সড ও সহজ বিকল্প"),
    kn: isHighReturn
      ? (isNearby ? "ರಿಟರ್ನ್ ಉತ್ತಮ ಮತ್ತು ಶಾಖೆ ಹತ್ತಿರದಲ್ಲಿದೆ" : "ಈ ಅವಧಿಗೆ ರಿಟರ್ನ್ ಉತ್ತಮವಾಗಿದೆ")
      : (isSafe ? "ಈ ಬ್ಯಾಂಕ್ ಸಾಮಾನ್ಯವಾಗಿ ವಿಶ್ವಾಸಾರ್ಹ ಮತ್ತು ಸ್ಥಿರವಾಗಿದೆ" : "ಇದು ಸಮತೋಲನದ ಸರಳ ಆಯ್ಕೆ"),
    ml: isHighReturn
      ? (isNearby ? "റിട്ടേൺ നല്ലതാണ്, ശാഖ അടുത്തിലാണ്" : "ഈ കാലയളവിന് റിട്ടേൺ നല്ലതാണ്")
      : (isSafe ? "ഈ ബാങ്ക് സാധാരണയായി വിശ്വസനീയവും സ്ഥിരവുമാണ്" : "ഇത് ബാലൻസ്ഡ്, ലളിതമായ ഓപ്ഷൻ ആണ്"),
    mr: isHighReturn
      ? (isNearby ? "परतावा चांगला आहे आणि शाखा जवळ आहे" : "या कालावधीसाठी परतावा चांगला आहे")
      : (isSafe ? "ही बँक साधारणपणे विश्वासार्ह आणि स्थिर आहे" : "हा संतुलित आणि सोपा पर्याय आहे"),
    od: isHighReturn
      ? (isNearby ? "ରିଟର୍ନ ଭଲ ଏବଂ ଶାଖା ନିକଟରେ ଅଛି" : "ଏହି ଅବଧି ପାଇଁ ରିଟର୍ନ ଭଲ")
      : (isSafe ? "ଏହି ବ୍ୟାଙ୍କ ସାଧାରଣତଃ ଭରସାଯୋଗ୍ୟ ଏବଂ ସ୍ଥିର" : "ଏହା ଏକ ସନ୍ତୁଳିତ ଏବଂ ସହଜ ବିକଳ୍ପ"),
    pa: isHighReturn
      ? (isNearby ? "ਰਿਟਰਨ ਚੰਗਾ ਹੈ ਅਤੇ ਸ਼ਾਖਾ ਨੇੜੇ ਹੈ" : "ਇਸ ਮਿਆਦ ਲਈ ਰਿਟਰਨ ਚੰਗਾ ਹੈ")
      : (isSafe ? "ਇਹ ਬੈਂਕ ਆਮ ਤੌਰ ਤੇ ਭਰੋਸੇਯੋਗ ਅਤੇ ਸਥਿਰ ਹੈ" : "ਇਹ ਸੰਤੁਲਿਤ ਅਤੇ ਆਸਾਨ ਵਿਕਲਪ ਹੈ"),
    te: isHighReturn
      ? (isNearby ? "రిటర్న్ బాగుంది, శాఖ దగ్గరలో ఉంది" : "ఈ కాలానికి రిటర్న్ మంచి స్థాయిలో ఉంది")
      : (isSafe ? "ఈ బ్యాంక్ సాధారణంగా నమ్మదగినది మరియు స్థిరమైనది" : "ఇది సమతుల్యమైన సులభమైన ఎంపిక")
  };

  return reasonByLang[lang] || reasonByLang.en;
}

export function getFdRecommendationsCore({ amount, tenureMonths, userLanguage, nearbyBanks, userText = "" }) {
  const { banks, fdProducts } = loadFdData();
  const banksById = new Map(banks.map((b) => [b.bank_id, b]));
  const hasNearbyData = Array.isArray(nearbyBanks) && nearbyBanks.length > 0;

  const nearbyLookup = new Map(
    (nearbyBanks || []).map((b) => [
      normalizeBankName(b.name),
      Number(b.distance_km)
    ])
  );

  const filtered = fdProducts
    .filter((p) => p.tenure_months === tenureMonths)
    .map((p) => {
      const bank = banksById.get(p.bank_id);
      if (!bank) return null;

      const bankReturn = amount * (p.interest_rate / 100);
      const distance = nearbyLookup.get(normalizeBankName(bank.bank_name));
      const distanceText = Number.isFinite(Number(distance)) ? `${Number(distance).toFixed(2)} km` : "N/A";

      return {
        bank,
        product: p,
        bank_return: bankReturn,
        trust_score: getTrustScore(bank),
        ease_score: bank.online_fd_available ? 100 : 50,
        distance_score: getDistanceScore(bank.bank_name, nearbyLookup),
        distanceText
      };
    })
    .filter(Boolean);

  if (!filtered.length) {
    return { lang: resolveLangFromInput(userLanguage, userText), recommendations: [] };
  }

  const maxReturn = Math.max(...filtered.map((x) => x.bank_return));
  const lang = resolveLangFromInput(userLanguage, userText);

  const scored = filtered.map((item) => {
    const returns_score = maxReturn > 0 ? (item.bank_return / maxReturn) * 100 : 0;
    const score = hasNearbyData
      ? (
        (returns_score * 0.5) +
        (item.trust_score * 0.25) +
        (item.ease_score * 0.15) +
        (item.distance_score * 0.1)
      )
      : (
        (returns_score * 0.6) +
        (item.trust_score * 0.25) +
        (item.ease_score * 0.15)
      );

    return {
      ...item,
      returns_score,
      score
    };
  });

  const recommendations = scored
    .sort((a, b) => b.score - a.score)
    .slice(0, 3)
    .map((item) => ({
      bank_name: item.bank.bank_name,
      expected_return: item.bank_return.toFixed(2),
      interest_rate: `${item.product.interest_rate.toFixed(2)}%`,
      reason: buildFdReason(lang, item),
      distance: item.distanceText,
      tag: item.bank.preferred_tag
    }));

  return { lang, recommendations };
}

export function getDistanceKm(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;

  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) *
    Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) ** 2;

  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

async function fetchOverpassWithRetry(url, retries = 2, timeoutMs = 15000) {
  try {
    let text;
    const requestHeaders = {
      "User-Agent": "vernacular-fd-advisor/1.0 (+https://vernancular-fd-advisor.onrender.com)",
      Accept: "*/*"
    };

    if (typeof fetch === "function") {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
      try {
        const response = await fetch(url, {
          signal: controller.signal,
          headers: requestHeaders
        });
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }
        text = await response.text();
      } finally {
        clearTimeout(timeoutId);
      }
    } else {
      text = await fetchTextViaHttps(url, timeoutMs, requestHeaders);
    }

    return text;
  } catch (error) {
    if (retries > 0) {
      return fetchOverpassWithRetry(url, retries - 1, timeoutMs);
    }
    throw error;
  }
}

function fetchTextViaHttps(url, timeoutMs = 15000, headers = {}) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, { headers }, (res) => {
      const status = Number(res.statusCode || 0);
      let body = "";

      res.setEncoding("utf8");
      res.on("data", (chunk) => {
        body += chunk;
      });

      res.on("end", () => {
        if (status >= 200 && status < 300) {
          resolve(body);
          return;
        }
        reject(new Error(`HTTP ${status || "unknown"}`));
      });
    });

    req.setTimeout(timeoutMs, () => {
      req.destroy(new Error("Request timeout"));
    });

    req.on("error", reject);
  });
}

export async function fetchOverpassFromMirrors(query) {
  let lastError = null;

  for (const baseUrl of OVERPASS_MIRRORS) {
    const url = `${baseUrl}?data=${encodeURIComponent(query)}`;
    try {
      return await fetchOverpassWithRetry(url, 1, 12000);
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError || new Error("All Overpass mirrors failed");
}

export async function fetchNearbyBanksForCoords(lat, lng, limit = 3) {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return [];

  const query = `
[out:json][timeout:25];
(
  node["amenity"~"bank|atm"](around:${SEARCH_RADIUS_METERS},${lat},${lng});
  way["amenity"~"bank|atm"](around:${SEARCH_RADIUS_METERS},${lat},${lng});
);
out center;
`;

  const text = await fetchOverpassFromMirrors(query);
  const data = JSON.parse(text);
  const elements = Array.isArray(data.elements) ? data.elements : [];

  return elements
    .map((place) => {
      const placeLat = place.lat || place.center?.lat;
      const placeLng = place.lon || place.center?.lon;
      if (!Number.isFinite(placeLat) || !Number.isFinite(placeLng)) return null;
      return {
        name: place.tags?.name || place.tags?.brand || (place.tags?.amenity === "atm" ? "ATM" : "Bank"),
        distance_km: Number(getDistanceKm(lat, lng, placeLat, placeLng).toFixed(2))
      };
    })
    .filter(Boolean)
    .sort((a, b) => a.distance_km - b.distance_km)
    .slice(0, limit);
}

export function formatTenureTextForLang(lang, tenureMonths) {
  if (tenureMonths % 12 !== 0) {
    return `${tenureMonths} months`;
  }

  const years = Math.round(tenureMonths / 12);
  const byLang = {
    en: `${years} ${years === 1 ? "year" : "years"}`,
    hi: `${years} साल`,
    hinglish: `${years} saal`,
    gu: `${years} વર્ષ`,
    ta: `${years} ஆண்டு`
  };

  return byLang[lang] || byLang.en;
}

export function createResponseByLang(lang, message) {
  const localizedMessage = localizeDigits(message, lang);
  return {
    text: localizedMessage,
    speech: localizedMessage.replace(/[\n\r]+/g, " ").trim()
  };
}

function buildUnsafeAdviceMessage(lang) {
  const msg = {
    en: "I can help with safe basics like saving, budgeting, FD, SIP, mutual fund basics, banking, and nearby banks or ATMs. I cannot suggest guaranteed-profit or illegal financial actions.",
    hi: "मैं सुरक्षित और बेसिक वित्तीय सलाह में मदद कर सकता हूं जैसे बचत, बजट, FD, SIP, म्यूचुअल फंड की बुनियादी जानकारी, बैंकिंग और नजदीकी बैंक या ATM. मैं गारंटीड प्रॉफिट या गैरकानूनी सलाह नहीं दे सकता.",
    hinglish: "Main safe aur basic financial guidance de sakta hoon jaise savings, budgeting, FD, SIP, mutual fund basics, banking, aur nearby bank ya ATM. Guaranteed profit ya illegal advice nahi de sakta.",
    gu: "હું સુરક્ષિત અને મૂળભૂત નાણાકીય માર્ગદર્શન આપી શકું છું જેમ કે બચત, બજેટ, FD, SIP, મ્યુચ્યુઅલ ફંડની બેઝિક માહિતી, બેન્કિંગ અને નજીકના બેન્ક અથવા ATM. ગેરકાયદેસર અથવા ગેરંટી પ્રોફિટની સલાહ આપી શકાતી નથી.",
    ta: "நான் பாதுகாப்பான அடிப்படை நிதி வழிகாட்டுதலை வழங்க முடியும். உதாரணமாக சேமிப்பு, பட்ஜெட், FD, SIP, மியூச்சுவல் ஃபண்ட் அடிப்படை, வங்கி கேள்விகள் மற்றும் அருகிலுள்ள வங்கி அல்லது ATM. உத்தரவாத லாபம் அல்லது சட்டவிரோத ஆலோசனை வழங்க முடியாது."
  };
  return msg[lang] || msg.en;
}

export function formatBanksMessage(lang, banks = [], radiusKm = null) {
  const radiusText = Number.isFinite(radiusKm) ? ` ${radiusKm}` : "";

  const lines = banks.slice(0, 5).map((b, idx) => {
    const name = b.name || "Bank";
    const type = b.type || "Bank";
    const distance = Number.isFinite(Number(b.distanceKm)) ? `${Number(b.distanceKm).toFixed(2)} km` : "N/A";
    return `${idx + 1}. ${name} (${type}) - ${distance}`;
  });

  const byLang = {
    en: {
      intro: `Here are ${banks.length} nearby banks/ATMs${radiusText ? ` within ${radiusText} km` : ""}:`,
      empty: "I could not find nearby banks right now. Please try again with location details."
    },
    hi: {
      intro: `यहां ${banks.length} नजदीकी बैंक या ATM हैं${radiusText ? ` ${radiusText} किमी के अंदर` : ""}:`,
      empty: "अभी नजदीकी बैंक नहीं मिले. कृपया लोकेशन के साथ दोबारा कोशिश करें."
    },
    hinglish: {
      intro: `Yahan ${banks.length} nearby bank ya ATM mil gaye${radiusText ? ` ${radiusText} km ke andar` : ""}:`,
      empty: "Abhi nearby bank nahi mila. Please location ke saath dobara try karo."
    },
    gu: {
      intro: `અહીં ${banks.length} નજીકના બેન્ક અથવા ATM છે${radiusText ? ` ${radiusText} કિમીની અંદર` : ""}:`,
      empty: "હમણાં નજીકના બેન્ક મળ્યા નથી. કૃપા કરીને ફરી પ્રયાસ કરો."
    },
    ta: {
      intro: `இங்கே ${banks.length} அருகிலுள்ள வங்கி அல்லது ATM உள்ளன${radiusText ? ` ${radiusText} கிமீ உள்ளே` : ""}:`,
      empty: "இப்போது அருகிலுள்ள வங்கி தகவல் கிடைக்கவில்லை. மீண்டும் முயற்சிக்கவும்."
    }
  };

  const i18n = byLang[lang] || byLang.en;
  if (!banks.length) return i18n.empty;
  return `${i18n.intro}\n${lines.join("\n")}`;
}

export function buildFinancialReply(userText, lang) {
  const t = String(userText || "").toLowerCase();

  const isRisky = /guaranteed|double money|insider|bet|illegal|sure profit|100% return/.test(t);
  if (isRisky) return buildUnsafeAdviceMessage(lang);

  const messages = {
    en: {
      savings: "Start with a simple rule: Savings = Income - Expenses. Try to save at least 20% of monthly income. Keep emergency fund equal to 3 to 6 months of expenses.",
      budget: "Use a simple monthly budget: needs, wants, and savings. Track all expenses for 30 days, then cut 1 or 2 non-essential spends and move that amount to savings.",
      invest: "For beginners, FD gives stability and SIP helps long-term growth through compounding. Start small, stay regular, and review every 6 months.",
      bank: "For banking help, I can guide on account basics, FD opening steps, KYC, and digital banking safety. Tell me your exact query.",
      default: "I can help with savings, budgeting, FD, SIP, mutual fund basics, banking, and nearby banks or ATMs. Tell me your goal and monthly income and expenses for a simple plan."
    },
    hi: {
      savings: "एक आसान नियम रखें: बचत = आय - खर्च. हर महीने कम से कम 20% बचत करने की कोशिश करें. साथ में 3 से 6 महीने के खर्च जितना इमरजेंसी फंड बनाएं.",
      budget: "मासिक बजट को 3 हिस्सों में रखें: जरूरी खर्च, इच्छाएं, और बचत. 30 दिन खर्च लिखें, फिर 1 या 2 गैर-जरूरी खर्च कम करके वह राशि बचत में डालें.",
      invest: "शुरुआत के लिए FD स्थिरता देती है और SIP लंबी अवधि में कंपाउंडिंग से मदद करती है. छोटी राशि से शुरू करें, नियमित निवेश करें, और हर 6 महीने समीक्षा करें.",
      bank: "बैंकिंग में मैं अकाउंट बेसिक्स, FD खोलने के स्टेप्स, KYC और डिजिटल बैंकिंग सुरक्षा में मदद कर सकता हूं. अपना सटीक सवाल बताएं.",
      default: "मैं बचत, बजट, FD, SIP, म्यूचुअल फंड बेसिक्स, बैंकिंग और नजदीकी बैंक या ATM में मदद कर सकता हूं. अगर आप आय और खर्च बताएं तो मैं सरल प्लान दूंगा."
    },
    hinglish: {
      savings: "Simple rule rakho: Savings = Income - Expenses. Har month kam se kam 20 percent save karne ki koshish karo. Emergency fund 3 se 6 month ke expenses jitna banao.",
      budget: "Monthly budget ko needs, wants aur savings me divide karo. 30 din expense track karo, phir 1 ya 2 non-essential kharch cut karke saving me daalo.",
      invest: "Beginner ke liye FD stable hota hai aur SIP long term compounding me help karta hai. Small amount se start karo, regular raho, aur 6 month me review karo.",
      bank: "Banking help me main account basics, FD opening steps, KYC, aur digital banking safety bata sakta hoon. Apna exact query bhejo.",
      default: "Main savings, budgeting, FD, SIP, mutual fund basics, banking, aur nearby bank ya ATM me help kar sakta hoon. Aap income aur expense batao, main simple plan dunga."
    },
    gu: {
      savings: "સરળ નિયમ રાખો: બચત = આવક - ખર્ચ. દર મહિને ઓછામાં ઓછું 20 ટકા બચાવવાનો પ્રયાસ કરો. સાથે 3 થી 6 મહિનાના ખર્ચ જેટલો ઇમરજન્સી ફંડ બનાવો.",
      budget: "માસિક બજેટને ત્રણ ભાગમાં રાખો: જરૂરી ખર્ચ, ઇચ્છિત ખર્ચ અને બચત. 30 દિવસ ખર્ચ લખો, પછી 1 કે 2 અનાવશ્યક ખર્ચ ઘટાડીને બચતમાં મૂકો.",
      invest: "શરૂઆત માટે FD સ્થિરતા આપે છે અને SIP લાંબા ગાળે કંપાઉન્ડિંગથી મદદ કરે છે. નાની રકમથી શરૂ કરો, નિયમિત રહો, અને 6 મહિને એક વખત સમીક્ષા કરો.",
      bank: "બેન્કિંગ માટે હું એકાઉન્ટ, FD, KYC અને ડિજિટલ બેન્કિંગ સુરક્ષા અંગે મદદ કરી શકું છું. તમારો ચોક્કસ પ્રશ્ન મોકલો.",
      default: "હું બચત, બજેટિંગ, FD, SIP, મ્યુચ્યુઅલ ફંડ બેઝિક્સ, બેન્કિંગ અને નજીકના બેન્ક અથવા ATM અંગે મદદ કરી શકું છું. તમારી આવક અને ખર્ચ જણાવો, હું સરળ યોજના આપું."
    },
    ta: {
      savings: "எளிய விதி: சேமிப்பு = வருமானம் - செலவு. மாத வருமானத்தின் குறைந்தது 20 சதவீதம் சேமிக்க முயற்சி செய்யுங்கள். அவசர நிதி 3 முதல் 6 மாத செலவுக்கு சமமாக இருக்க வேண்டும்.",
      budget: "மாத பட்ஜெட்டை தேவைகள், விருப்பங்கள், சேமிப்பு என்று பிரியுங்கள். 30 நாட்கள் செலவை பதிவு செய்து, தேவையற்ற 1 அல்லது 2 செலவுகளை குறைத்து சேமிப்பில் மாற்றுங்கள்.",
      invest: "தொடக்க நிலைக்கு FD நிலைத்தன்மை தரும்; SIP நீண்ட காலத்தில் காம்பவுண்டிங் மூலம் வளர உதவும். சிறிய தொகையில் தொடங்கி, தொடர்ந்து செய்து, 6 மாதத்திற்கு ஒருமுறை பரிசீலியுங்கள்.",
      bank: "வங்கி தொடர்பாக கணக்கு அடிப்படை, FD திறப்பு, KYC மற்றும் டிஜிட்டல் பாதுகாப்பில் உதவ முடியும். உங்கள் கேள்வியை கூறுங்கள்.",
      default: "சேமிப்பு, பட்ஜெட், FD, SIP, மியூச்சுவல் ஃபண்ட் அடிப்படை, வங்கி கேள்விகள் மற்றும் அருகிலுள்ள வங்கி அல்லது ATM பற்றி உதவ முடியும். உங்கள் வருமானம் மற்றும் செலவை பகிர்ந்தால் எளிய திட்டம் தருகிறேன்."
    }
  };

  const i18n = messages[lang] || messages.en;

  if (/(save|saving|बचत|savings|bachat|બચત|சேமிப்பு)/.test(t)) return i18n.savings;
  if (/(budget|बजट|budgeting|બજેટ|பட்ஜெட்)/.test(t)) return i18n.budget;
  if (/(sip|fd|mutual|investment|invest|निवेश|રોકાણ|முதலீடு)/.test(t)) return i18n.invest;
  if (/(bank|atm|banking|बैंक|एटीएम|બેન્ક|ஏடிஎம்|வங்கி)/.test(t)) return i18n.bank;
  return i18n.default;
}
