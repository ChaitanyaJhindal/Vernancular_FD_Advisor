import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Platform,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View
} from "react-native";
import { Audio } from "expo-av";
import * as Localization from "expo-localization";
import * as Location from "expo-location";
import * as FileSystem from "expo-file-system";
import * as LegacyFileSystem from "expo-file-system/legacy";
import MicButton from "./src/components/MicButton";
import ResultCard from "./src/components/ResultCard";
import AgentAvatar from "./src/components/AgentAvatar";
import {
  askFdAdvisor,
  fetchNearbyBanks,
  requestTtsToLocalFile,
  transcribeFromUri
} from "./src/api/client";
import { useVoiceRecorder } from "./src/hooks/useVoiceRecorder";
import { colors, radii, spacing } from "./src/theme";

function detectLangCode() {
  const firstLocale = Localization.getLocales?.()?.[0] || {};
  const languageCode = String(firstLocale.languageCode || "").toLowerCase();
  const languageTag = String(firstLocale.languageTag || "").toLowerCase();
  const tagCode = languageTag.includes("-") ? languageTag.split("-")[0] : languageTag;
  const candidate = languageCode || tagCode;
  if (SUPPORTED_LANGUAGE_CODES.has(candidate)) return candidate;
  return "en";
}

const LANGUAGE_OPTIONS = [
  { code: "en", locale: "en-IN", label: "English" },
  { code: "bn", locale: "bn-IN", label: "Bengali" },
  { code: "gu", locale: "gu-IN", label: "Gujarati" },
  { code: "kn", locale: "kn-IN", label: "Kannada" },
  { code: "ml", locale: "ml-IN", label: "Malayalam" },
  { code: "mr", locale: "mr-IN", label: "Marathi" },
  { code: "od", locale: "od-IN", label: "Odia" },
  { code: "pa", locale: "pa-IN", label: "Punjabi" },
  { code: "ta", locale: "ta-IN", label: "Tamil" },
  { code: "te", locale: "te-IN", label: "Telugu" }
];

const SUPPORTED_LANGUAGE_CODES = new Set(LANGUAGE_OPTIONS.map((x) => x.code));

function getLocaleFromLanguageCode(code) {
  const match = LANGUAGE_OPTIONS.find((item) => item.code === code);
  return match?.locale || "en-IN";
}

function getUiText(lang) {
  const texts = {
    en: {
      greeting: "Hello, I am your FD advisor.",
      languageSwitched: "Language updated. I will continue in English.",
      chooseLanguage: "Choose Language",
      notUnderstood: "I could not understand that. Please say it again.",
      processing: "Thinking...",
      inputPlaceholder: "Type your message",
      modeVoice: "Voice + Listen",
      modeText: "Text Mode",
      modeHint: "You can use both voice and text anytime.",
      autoListenHint: "Mic auto starts after every assistant reply.",
      startChatVoice: "Start conversation",
      startChatText: "Continue with text",
      conversationTitle: "Conversation",
      stopVoice: "Stop Voice",
      send: "Send",
      topOptions: "Top 3 FD Options",
      askAgain: "Ask again",
      confirmQuestion: "Do you want to proceed with this FD?",
      yes: "Yes",
      no: "No",
      submitted: "Your FD request has been submitted",
      checkAgain: "Check again",
      bottomHintVoice: "Voice mode ON: speak freely.",
      bottomHintText: "Text mode ON.",
      avatarHomeIdle: "Your FD advisor",
      avatarSpeaking: "I am speaking...",
      avatarListening: "I am listening...",
      avatarWaiting: "Ask me anything"
    },

    hi: {
      greeting: "नमस्ते, मैं आपकी FD सलाहकार हूँ।",
      languageSwitched: "भाषा बदल गई है। अब मैं हिंदी में बात करूँगी।",
      chooseLanguage: "भाषा चुनें",
      notUnderstood: "समझ नहीं आया, फिर से बोलिए।",
      processing: "सोच रहे हैं...",
      inputPlaceholder: "यहाँ लिखें",
      modeVoice: "वॉइस + सुनना",
      modeText: "टेक्स्ट मोड",
      send: "भेजें",
      yes: "हाँ",
      no: "नहीं"
    },

    bn: {
      greeting: "নমস্কার, আমি আপনার FD পরামর্শদাতা।",
      chooseLanguage: "ভাষা নির্বাচন করুন",
      send: "পাঠান",
      yes: "হ্যাঁ",
      no: "না"
    },

    gu: {
      greeting: "નમસ્તે, હું તમારો FD સલાહકાર છું.",
      chooseLanguage: "ભાષા પસંદ કરો",
      send: "મોકલો",
      yes: "હા",
      no: "ના"
    },

    mr: {
      greeting: "नमस्कार, मी तुमचा FD सल्लागार आहे.",
      chooseLanguage: "भाषा निवडा",
      send: "पाठवा",
      yes: "होय",
      no: "नाही"
    },

    ta: {
      greeting: "வணக்கம், நான் உங்கள் FD ஆலோசகர்.",
      chooseLanguage: "மொழியை தேர்வு செய்யவும்",
      send: "அனுப்பு",
      yes: "ஆம்",
      no: "இல்லை"
    },

    te: {
      greeting: "నమస్తే, నేను మీ FD సలహాదారు.",
      chooseLanguage: "భాష ఎంచుకోండి",
      send: "పంపండి",
      yes: "అవును",
      no: "కాదు"
    },

    kn: {
      greeting: "ನಮಸ್ಕಾರ, ನಾನು ನಿಮ್ಮ FD ಸಲಹೆಗಾರ.",
      chooseLanguage: "ಭಾಷೆ ಆಯ್ಕೆಮಾಡಿ",
      send: "ಕಳುಹಿಸಿ",
      yes: "ಹೌದು",
      no: "ಇಲ್ಲ"
    },

    ml: {
      greeting: "നമസ്കാരം, ഞാൻ നിങ്ങളുടെ FD ഉപദേഷ്ടാവ് ആണ്.",
      chooseLanguage: "ഭാഷ തിരഞ്ഞെടുക്കുക",
      send: "അയയ്ക്കുക",
      yes: "അതെ",
      no: "ഇല്ല"
    },

    pa: {
      greeting: "ਸਤ ਸ੍ਰੀ ਅਕਾਲ, ਮੈਂ ਤੁਹਾਡਾ FD ਸਲਾਹਕਾਰ ਹਾਂ।",
      chooseLanguage: "ਭਾਸ਼ਾ ਚੁਣੋ",
      send: "ਭੇਜੋ",
      yes: "ਹਾਂ",
      no: "ਨਹੀਂ"
    },

    od: {
      greeting: "ନମସ୍କାର, ମୁଁ ଆପଣଙ୍କ FD ପରାମର୍ଶଦାତା।",
      chooseLanguage: "ଭାଷା ବାଛନ୍ତୁ",
      send: "ପଠାନ୍ତୁ",
      yes: "ହଁ",
      no: "ନା"
    }
  };

  return {
    ...texts.en,         // fallback defaults
    ...(texts[lang] || {})
  };
}

function stripThinkingBlocks(text) {
  const raw = String(text || "");
  const removedPaired = raw.replace(/<think>[\s\S]*?<\/think>/gi, " ");
  const removedDangling = removedPaired.replace(/<think>[\s\S]*$/gi, " ");
  return removedDangling.replace(/\s+/g, " ").trim();
}

function englishLetterRatio(text) {
  const raw = String(text || "");
  const letters = raw.match(/[A-Za-z]/g) || [];
  const devanagari = raw.match(/[\u0900-\u097F]/g) || [];
  const total = letters.length + devanagari.length;
  if (!total) return 0;
  return letters.length / total;
}

function refineVisibleAssistantText(rawText, lang) {
  const cleaned = stripThinkingBlocks(rawText);
  if (cleaned) return cleaned;
  if (lang !== "en" && rawText && englishLetterRatio(rawText) > 0.85) return rawText;
  return "";
}

export default function App() {
  const [screen, setScreen] = useState("home");
  const [conversationMode, setConversationMode] = useState("voice");
  const [inputText, setInputText] = useState("");
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isTtsLoading, setIsTtsLoading] = useState(false);
  const [ttsError, setTtsError] = useState("");
  const [locationPermission, setLocationPermission] = useState(false);
  const [locationState, setLocationState] = useState({ lat: null, lng: null, nearbyBanks: [] });
  const [recommendations, setRecommendations] = useState([]);
  const [selectedFd, setSelectedFd] = useState(null);

  const sessionId = useRef(`mobile-${Date.now()}`);
  const soundRef = useRef(null);
  const playbackIdRef = useRef(0);
  const deviceLang = useMemo(() => detectLangCode(), []);
  const [selectedLanguage, setSelectedLanguage] = useState(deviceLang);
  const [showLanguageMenu, setShowLanguageMenu] = useState(false);
  const uiText = useMemo(() => getUiText(selectedLanguage), [selectedLanguage]);

  const { isRecording, startRecording, stopRecording } = useVoiceRecorder();

  const stopPlayback = async () => {
    if (soundRef.current) {
      try {
        soundRef.current.setOnPlaybackStatusUpdate(null);
        await soundRef.current.stopAsync();
      } catch {
        // no-op
      }
      try {
        await soundRef.current.unloadAsync();
      } catch {
        // no-op
      }
      soundRef.current = null;
    }
    setIsSpeaking(false);
    setIsTtsLoading(false);
  };

  const resolveSpeechLocale = () => {
    return getLocaleFromLanguageCode(selectedLanguage);
  };

  const changeLanguage = async (nextLanguage) => {
    if (!nextLanguage || nextLanguage === selectedLanguage) {
      setShowLanguageMenu(false);
      return;
    }

    setSelectedLanguage(nextLanguage);
    setShowLanguageMenu(false);
  };

  const sendDisabled = loading || !inputText.trim();

  const playText = async (text, options = {}) => {
    if (!text) return;

    const autoListenAfter = Boolean(options.autoListenAfter);

    let localUri = "";
    let sound = null;

    try {
      setTtsError("");
      if (isRecording) {
        await stopRecording();
      }

      await stopPlayback();
      setIsTtsLoading(true);

      const playbackId = Date.now();
      playbackIdRef.current = playbackId;
      localUri = await requestTtsToLocalFile(text, resolveSpeechLocale());

      const isWebUrl = Platform.OS === "web" && (localUri.startsWith("blob:") || localUri.startsWith("data:"));
      if (!isWebUrl) {
        const getInfoAsync = LegacyFileSystem.getInfoAsync || FileSystem.getInfoAsync;
        const fileInfo = await getInfoAsync(localUri);
        if (!fileInfo.exists || !fileInfo.size) {
          throw new Error("TTS audio file missing or empty");
        }
      }

      await Audio.setAudioModeAsync({
        allowsRecordingIOS: false,
        playsInSilentModeIOS: true,
        shouldDuckAndroid: true,
        playThroughEarpieceAndroid: false
      });

      const created = await Audio.Sound.createAsync(
        { uri: localUri },
        { shouldPlay: false, progressUpdateIntervalMillis: 120 }
      );
      sound = created.sound;
      soundRef.current = sound;
      setIsSpeaking(true);

      await new Promise((resolve) => {
        sound.setOnPlaybackStatusUpdate((status) => {
          if (playbackIdRef.current !== playbackId) {
            resolve();
            return;
          }

          if (!status.isLoaded) {
            if (status.error) {
              setTtsError(`Playback load error: ${status.error}`);
              setIsSpeaking(false);
              resolve();
            }
            return;
          }

          if (status.didJustFinish) {
            setIsSpeaking(false);
            resolve();
          }
        });

        sound.playAsync().catch(() => {
          setIsSpeaking(false);
          resolve();
        });
      });

      await sound.unloadAsync();
      soundRef.current = null;
      setIsTtsLoading(false);

      if (autoListenAfter && conversationMode === "voice" && !isRecording) {
        await startRecording();
      }
    } catch (error) {
      setIsSpeaking(false);
      setIsTtsLoading(false);
      setTtsError(error?.message ? String(error.message) : "Voice playback failed");
    } finally {
      if (sound) {
        try {
          sound.setOnPlaybackStatusUpdate(null);
          await sound.unloadAsync();
        } catch {
          // no-op
        }
        if (soundRef.current === sound) {
          soundRef.current = null;
        }
      }

      if (localUri) {
        try {
          const isBlobUrl = Platform.OS === "web" && localUri.startsWith("blob:");
          if (isBlobUrl && typeof URL !== "undefined" && typeof URL.revokeObjectURL === "function") {
            URL.revokeObjectURL(localUri);
          } else if (!(Platform.OS === "web" && localUri.startsWith("data:"))) {
            const deleteAsync = LegacyFileSystem.deleteAsync || FileSystem.deleteAsync;
            await deleteAsync(localUri, { idempotent: true });
          }
        } catch {
          // no-op
        }
      }
    }
  };

  const resolveLocationIfPossible = async () => {
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      const granted = status === "granted";
      setLocationPermission(granted);

      if (!granted) {
        setLocationState({ lat: null, lng: null, nearbyBanks: [] });
        return;
      }

      const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      const lat = loc.coords.latitude;
      const lng = loc.coords.longitude;
      const banksResponse = await fetchNearbyBanks(lat, lng);
      const nearbyBanks = Array.isArray(banksResponse?.results)
        ? banksResponse.results.map((b) => ({ name: b.name, distance_km: b.distanceKm }))
        : [];

      setLocationState({ lat, lng, nearbyBanks });
    } catch {
      setLocationPermission(false);
    }
  };

  useEffect(() => {
    resolveLocationIfPossible();
  }, []);

  useEffect(() => {
    return () => {
      stopPlayback();
    };
  }, []);

  const sendAdvisorInput = async (userInput) => {
    if (!userInput.trim()) return;

    setLoading(true);
    setMessages((prev) => [...prev, { role: "user", text: userInput }]);

    try {
      const response = await askFdAdvisor({
        session_id: sessionId.current,
        userInput,
        user_language: selectedLanguage,
        response_language: selectedLanguage,
        reasoning_mode: "llm_only",
        frontend_directive:
          "Use only final answer format. Keep response concise, natural, and in response_language. Avoid repetitive fixed questions.",
        location_permission: locationPermission,
        nearbyBanks: locationState.nearbyBanks,
        lat: locationState.lat,
        lng: locationState.lng
      });

      const rawBotText = String(response?.text || "").trim();
      const botText = refineVisibleAssistantText(rawBotText, selectedLanguage) || uiText.notUnderstood;
      setMessages((prev) => [...prev, { role: "bot", text: botText }]);

      if (conversationMode === "voice") {
        await playText(botText, { autoListenAfter: true });
      }

      if (Array.isArray(response?.recommendations) && response.recommendations.length > 0) {
        setRecommendations(response.recommendations.slice(0, 3));
        setScreen("results");
      }
    } catch {
      setMessages((prev) => [...prev, { role: "bot", text: uiText.notUnderstood }]);
    } finally {
      setLoading(false);
      setInputText("");
    }
  };

  const onMicPress = async () => {
    try {
      if (!isRecording) {
        await stopPlayback();
        await startRecording();
        return;
      }

      const uri = await stopRecording();
      if (!uri) return;

      setLoading(true);
      const transcript = await transcribeFromUri(uri);
      const text = String(transcript?.transcript || transcript?.text || transcript?.output_text || "").trim();

      if (!text) {
        setLoading(false);
        setMessages((prev) => [...prev, { role: "bot", text: uiText.notUnderstood }]);
        return;
      }

      await sendAdvisorInput(text);
    } catch {
      setLoading(false);
      setMessages((prev) => [...prev, { role: "bot", text: uiText.notUnderstood }]);
    }
  };

  const goConversation = async (startListening = true) => {
    setScreen("conversation");

    if (messages.length === 0) {
      const greeting = uiText.greeting;
      setMessages([{ role: "bot", text: greeting }]);

      if (conversationMode === "voice") {
        await playText(greeting);
      }

      if (startListening && conversationMode === "voice" && !isRecording) {
        await startRecording();
      }
    }
  };

  if (screen === "home") {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.homeWrap}>
          <Text style={styles.brand}>Vernacular FD Advisor</Text>
          <AgentAvatar
            speaking={conversationMode === "voice" && isSpeaking}
            label={conversationMode === "voice" && isSpeaking ? uiText.avatarSpeaking : uiText.avatarHomeIdle}
          />

          <View style={styles.langChip}>
            <Pressable onPress={() => setShowLanguageMenu((prev) => !prev)}>
              <Text style={styles.langText}>{uiText.chooseLanguage}: {selectedLanguage.toUpperCase()}</Text>
            </Pressable>
          </View>

          {showLanguageMenu ? (
            <View style={styles.languageMenu}>
              <ScrollView style={styles.languageMenuScroll} nestedScrollEnabled>
                {LANGUAGE_OPTIONS.map((item) => (
                  <Pressable
                    key={item.code}
                    style={[styles.languageOption, selectedLanguage === item.code && styles.languageOptionActive]}
                    onPress={() => changeLanguage(item.code)}
                  >
                    <Text style={[styles.languageOptionText, selectedLanguage === item.code && styles.languageOptionTextActive]}>
                      {item.label} ({item.locale})
                    </Text>
                  </Pressable>
                ))}
              </ScrollView>
            </View>
          ) : null}

          <View style={styles.modeRowHome}>
            <Pressable
              style={[styles.modePillHome, conversationMode === "voice" && styles.modePillHomeActive]}
              onPress={() => setConversationMode("voice")}
            >
              <Text style={[styles.modePillHomeText, conversationMode === "voice" && styles.modePillHomeTextActive]}>
                {uiText.modeVoice}
              </Text>
            </Pressable>
            <Pressable
              style={[styles.modePillHome, conversationMode === "text" && styles.modePillHomeActive]}
              onPress={async () => {
                await stopPlayback();
                setConversationMode("text");
              }}
            >
              <Text style={[styles.modePillHomeText, conversationMode === "text" && styles.modePillHomeTextActive]}>
                {uiText.modeText}
              </Text>
            </Pressable>
          </View>

          <Text style={styles.modeHint}>{uiText.modeHint}</Text>
          {conversationMode === "voice" ? <Text style={styles.liveHelpText}>{uiText.autoListenHint}</Text> : null}

          <MicButton
            recording={isRecording}
            onPress={async () => {
              await goConversation(false);
              if (conversationMode === "voice") {
                onMicPress();
              }
            }}
          />

          <Pressable onPress={goConversation} style={styles.secondaryBtn}>
            <Text style={styles.secondaryBtnText}>
              {conversationMode === "voice" ? uiText.startChatVoice : uiText.startChatText}
            </Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  if (screen === "results") {
    return (
      <SafeAreaView style={styles.container}>
        <ScrollView contentContainerStyle={styles.resultsWrap}>
          <Text style={styles.title}>{uiText.topOptions}</Text>
          {recommendations.map((item, index) => (
            <ResultCard
              key={`${item.bank_name}-${index}`}
              item={item}
              onSelect={() => {
                setSelectedFd(item);
                setScreen("confirm");
              }}
            />
          ))}
          <Pressable style={styles.secondaryBtn} onPress={() => setScreen("conversation")}>
            <Text style={styles.secondaryBtnText}>{uiText.askAgain}</Text>
          </Pressable>
        </ScrollView>
      </SafeAreaView>
    );
  }

  if (screen === "confirm") {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.centerCard}>
          <Text style={styles.confirmText}>{uiText.confirmQuestion}</Text>
          {selectedFd ? <Text style={styles.fdChoice}>{selectedFd.bank_name}</Text> : null}

          <Pressable style={styles.yesBtn} onPress={() => setScreen("success")}>
            <Text style={styles.yesNoText}>{uiText.yes}</Text>
          </Pressable>
          <Pressable style={styles.noBtn} onPress={() => setScreen("results")}>
            <Text style={styles.yesNoText}>{uiText.no}</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  if (screen === "success") {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.centerCard}>
          <Text style={styles.successIcon}>✅</Text>
          <Text style={styles.confirmText}>{uiText.submitted}</Text>
          <Pressable
            style={styles.secondaryBtn}
            onPress={() => {
              setRecommendations([]);
              setSelectedFd(null);
              setMessages([]);
              setScreen("home");
            }}
          >
            <Text style={styles.secondaryBtnText}>{uiText.checkAgain}</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.chatWrap}>
        <Text style={styles.title}>{uiText.conversationTitle}</Text>

        <View style={styles.agentRow}>
          <AgentAvatar
            speaking={conversationMode === "voice" && isSpeaking}
            label={
              conversationMode === "voice" && isSpeaking
                ? uiText.avatarSpeaking
                : isRecording
                  ? uiText.avatarListening
                  : uiText.avatarWaiting
            }
          />
          <Pressable style={styles.stopSpeakBtn} onPress={stopPlayback}>
            <Text style={styles.stopSpeakText}>{uiText.stopVoice}</Text>
          </Pressable>
        </View>

        <View style={styles.inlineLanguageRow}>
          {LANGUAGE_OPTIONS.map((item) => (
            <Pressable
              key={item.code}
              style={[styles.inlineLanguageOption, selectedLanguage === item.code && styles.inlineLanguageOptionActive]}
              onPress={() => changeLanguage(item.code)}
            >
              <Text style={[styles.inlineLanguageText, selectedLanguage === item.code && styles.inlineLanguageTextActive]}>
                {item.code.toUpperCase()}
              </Text>
            </Pressable>
          ))}
        </View>

        {conversationMode === "voice" ? <Text style={styles.liveHelpText}>{uiText.autoListenHint}</Text> : null}

        <View style={styles.modeRowConversation}>
          <Pressable
            style={[styles.modePillConversation, conversationMode === "voice" && styles.modePillConversationActive]}
            onPress={() => setConversationMode("voice")}
          >
            <Text
              style={[
                styles.modePillConversationText,
                conversationMode === "voice" && styles.modePillConversationTextActive
              ]}
            >
              {uiText.modeVoice}
            </Text>
          </Pressable>
          <Pressable
            style={[styles.modePillConversation, conversationMode === "text" && styles.modePillConversationActive]}
            onPress={async () => {
              await stopPlayback();
              setConversationMode("text");
            }}
          >
            <Text
              style={[
                styles.modePillConversationText,
                conversationMode === "text" && styles.modePillConversationTextActive
              ]}
            >
              {uiText.modeText}
            </Text>
          </Pressable>
        </View>

        <FlatList
          data={messages}
          keyExtractor={(_, index) => String(index)}
          contentContainerStyle={styles.chatList}
          renderItem={({ item }) => (
            <View style={[styles.bubble, item.role === "user" ? styles.userBubble : styles.botBubble]}>
              <Text style={[styles.bubbleText, item.role === "user" && styles.userBubbleText]}>{item.text}</Text>
              {item.role === "bot" ? (
                <Pressable style={styles.playBtn} onPress={() => playText(item.text)}>
                  <Text style={styles.playText}>{isTtsLoading ? "..." : "▶ Suno"}</Text>
                </Pressable>
              ) : null}
            </View>
          )}
        />

        {loading ? (
          <View style={styles.loadingRow}>
            <ActivityIndicator color={colors.primary} />
            <Text style={styles.loadingText}>{uiText.processing}</Text>
          </View>
        ) : null}

        {ttsError ? <Text style={styles.errorText}>Voice issue: {ttsError}</Text> : null}

        <View style={styles.inputRow}>
          <TextInput
            style={styles.input}
            value={inputText}
            placeholder={uiText.inputPlaceholder}
            onChangeText={setInputText}
            returnKeyType="send"
            blurOnSubmit={false}
            onSubmitEditing={() => sendAdvisorInput(inputText)}
          />
          <Pressable
            style={[styles.sendBtn, sendDisabled && styles.sendBtnDisabled]}
            disabled={sendDisabled}
            onPress={() => sendAdvisorInput(inputText)}
          >
            <Text style={[styles.sendText, sendDisabled && styles.sendTextDisabled]}>{uiText.send}</Text>
          </Pressable>
        </View>

        <View style={styles.bottomActionRow}>
          <MicButton recording={isRecording} onPress={onMicPress} />
          <Text style={styles.bottomHint}>
            {conversationMode === "voice"
              ? uiText.bottomHintVoice
              : uiText.bottomHintText}
          </Text>
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bg
  },
  homeWrap: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    width: "100%",
    padding: spacing.xl,
    gap: spacing.xl
  },
  brand: {
    fontSize: 30,
    fontWeight: "900",
    color: colors.primary,
    textAlign: "center"
  },
  langChip: {
    backgroundColor: colors.primarySoft,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.full,
    paddingHorizontal: 16,
    paddingVertical: 8
  },
  languageMenu: {
    width: "100%",
    maxWidth: 280,
    maxHeight: 260,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    overflow: "hidden"
  },
  languageMenuScroll: {
    maxHeight: 260
  },
  languageOption: {
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.border
  },
  languageOptionActive: {
    backgroundColor: colors.primarySoft
  },
  languageOptionText: {
    fontSize: 14,
    fontWeight: "700",
    color: colors.text
  },
  languageOptionTextActive: {
    color: colors.primary
  },
  langText: {
    fontSize: 16,
    fontWeight: "700",
    color: colors.text
  },
  inlineLanguageRow: {
    flexDirection: "row",
    gap: 8,
    marginBottom: 10
  },
  inlineLanguageOption: {
    borderRadius: radii.full,
    borderWidth: 1,
    borderColor: colors.border,
    paddingVertical: 6,
    paddingHorizontal: 12,
    backgroundColor: colors.surface
  },
  inlineLanguageOptionActive: {
    borderColor: colors.primary,
    backgroundColor: colors.primarySoft
  },
  inlineLanguageText: {
    fontSize: 12,
    fontWeight: "800",
    color: colors.subText
  },
  inlineLanguageTextActive: {
    color: colors.primary
  },
  modeRowHome: {
    flexDirection: "row",
    gap: 8,
    width: "100%",
    maxWidth: 420,
    justifyContent: "center"
  },
  modePillHome: {
    flex: 1,
    maxWidth: 180,
    borderRadius: radii.full,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    paddingVertical: 12,
    paddingHorizontal: 12,
    alignItems: "center"
  },
  modePillHomeActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary
  },
  modePillHomeText: {
    fontSize: 14,
    color: colors.primary,
    fontWeight: "800"
  },
  modePillHomeTextActive: {
    color: "#FFFFFF"
  },
  modeHint: {
    fontSize: 14,
    fontWeight: "700",
    color: colors.subText,
    textAlign: "center",
    paddingHorizontal: 12
  },
  liveHelpText: {
    marginBottom: 10,
    fontSize: 13,
    color: colors.subText,
    fontWeight: "700"
  },
  agentRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 10
  },
  stopSpeakBtn: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.full,
    paddingHorizontal: 12,
    paddingVertical: 8
  },
  stopSpeakText: {
    fontSize: 12,
    fontWeight: "800",
    color: colors.primary
  },
  secondaryBtn: {
    backgroundColor: colors.surface,
    borderColor: colors.primary,
    borderWidth: 1,
    borderRadius: radii.lg,
    paddingHorizontal: 20,
    paddingVertical: 14,
    alignItems: "center",
    justifyContent: "center"
  },
  secondaryBtnText: {
    color: colors.primary,
    fontSize: 18,
    fontWeight: "800"
  },
  title: {
    fontSize: 28,
    fontWeight: "900",
    color: colors.text,
    marginBottom: 12
  },
  chatWrap: {
    flex: 1,
    width: "100%",
    maxWidth: 720,
    alignSelf: "center",
    padding: spacing.md
  },
  modeRowConversation: {
    flexDirection: "row",
    gap: 8,
    marginBottom: 10
  },
  modePillConversation: {
    flex: 1,
    height: 42,
    borderRadius: radii.full,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    alignItems: "center",
    justifyContent: "center"
  },
  modePillConversationActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary
  },
  modePillConversationText: {
    color: colors.primary,
    fontSize: 14,
    fontWeight: "800"
  },
  modePillConversationTextActive: {
    color: "#FFFFFF"
  },
  chatList: {
    flexGrow: 1,
    paddingBottom: 12,
    gap: 8
  },
  bubble: {
    borderRadius: radii.lg,
    padding: 14,
    maxWidth: "92%"
  },
  botBubble: {
    alignSelf: "flex-start",
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border
  },
  userBubble: {
    alignSelf: "flex-end",
    backgroundColor: colors.primary
  },
  bubbleText: {
    fontSize: 17,
    color: colors.text,
    fontWeight: "700"
  },
  userBubbleText: {
    color: "#FFFFFF"
  },
  playBtn: {
    marginTop: 8,
    alignSelf: "flex-start",
    backgroundColor: colors.primarySoft,
    borderRadius: radii.full,
    paddingHorizontal: 12,
    paddingVertical: 6
  },
  playText: {
    fontSize: 14,
    color: colors.primary,
    fontWeight: "800"
  },
  loadingRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 8
  },
  loadingText: {
    fontSize: 16,
    color: colors.subText,
    fontWeight: "700"
  },
  errorText: {
    marginBottom: 8,
    fontSize: 13,
    color: colors.danger,
    fontWeight: "700"
  },
  inputRow: {
    flexDirection: "row",
    gap: 8,
    alignItems: "center"
  },
  input: {
    flex: 1,
    height: 54,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.lg,
    paddingHorizontal: 14,
    fontSize: 17,
    color: colors.text,
    fontWeight: "700"
  },
  sendBtn: {
    height: 54,
    minWidth: 90,
    borderRadius: radii.lg,
    backgroundColor: colors.primary,
    alignItems: "center",
    justifyContent: "center"
  },
  sendBtnDisabled: {
    backgroundColor: colors.primarySoft,
    borderWidth: 1,
    borderColor: colors.border
  },
  sendText: {
    fontSize: 17,
    color: "#FFFFFF",
    fontWeight: "900"
  },
  sendTextDisabled: {
    color: colors.subText
  },
  bottomActionRow: {
    marginTop: 14,
    alignItems: "center",
    justifyContent: "center"
  },
  bottomHint: {
    marginTop: 8,
    fontSize: 14,
    fontWeight: "700",
    color: colors.subText,
    textAlign: "center",
    paddingHorizontal: 12
  },
  resultsWrap: {
    padding: spacing.md,
    paddingBottom: spacing.xxl
  },
  centerCard: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: spacing.xl,
    gap: spacing.md
  },
  confirmText: {
    fontSize: 32,
    fontWeight: "900",
    color: colors.text,
    textAlign: "center"
  },
  fdChoice: {
    fontSize: 20,
    fontWeight: "800",
    color: colors.primary,
    textAlign: "center"
  },
  yesBtn: {
    width: "100%",
    maxWidth: 360,
    height: 58,
    borderRadius: radii.lg,
    backgroundColor: colors.success,
    alignItems: "center",
    justifyContent: "center"
  },
  noBtn: {
    width: "100%",
    maxWidth: 360,
    height: 58,
    borderRadius: radii.lg,
    backgroundColor: colors.danger,
    alignItems: "center",
    justifyContent: "center"
  },
  yesNoText: {
    color: "#FFFFFF",
    fontSize: 22,
    fontWeight: "900"
  },
  successIcon: {
    fontSize: 58
  }
});
