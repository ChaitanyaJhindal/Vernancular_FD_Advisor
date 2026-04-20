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
  const locale = String(Localization.getLocales?.()?.[0]?.languageCode || "hi").toLowerCase();
  if (["hi", "en", "ta", "gu"].includes(locale)) return locale;
  return "hi";
}

function getUiText(lang) {
  if (lang === "en") {
    return {
      greeting: "Hello, ready to find the best FD for you?",
      askAmount: "How much amount do you want to invest?",
      askTenure: "For how many months do you want the FD?",
      genericPrompt: "Tell me your preference and I will help.",
      notUnderstood: "I could not understand that. Please say it again.",
      processing: "Thinking...",
      inputPlaceholder: "Type your message",
      repeatHint: "Please answer the last question so I can continue without repeating.",
      repeatHardStop: "I am still waiting for your previous answer. Please share amount or tenure so I can proceed."
    };
  }

  return {
    greeting: "Namaste, FD ke liye taiyaar hain?",
    askAmount: "Kitna paisa invest karna chahte hain?",
    askTenure: "Kitne time ke liye FD karna chahte hain?",
    genericPrompt: "Boliyega, main madad karta hoon.",
    notUnderstood: "Samajh nahi aaya, dobara bolenge?",
    processing: "Soch rahe hain...",
    inputPlaceholder: "Yahan type karein",
    repeatHint: "Aap pichhle sawal ka answer de dijiye, fir main aage continue karungi.",
    repeatHardStop: "Main abhi bhi aapke pichhle answer ka wait kar rahi hoon. Amount ya tenure bata dijiye."
  };
}

function stageToQuestion(stage, lang) {
  const ui = getUiText(lang);
  if (stage === "awaiting_amount") return ui.askAmount;
  if (stage === "awaiting_tenure") return ui.askTenure;
  return ui.genericPrompt;
}

function normalizeMessage(text) {
  return String(text || "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function refineRepeatedBotText(rawText, repeatCount, lang) {
  const ui = getUiText(lang);
  if (repeatCount <= 0) return rawText;
  if (repeatCount === 1) return `${rawText}\n\n${ui.repeatHint}`;
  return ui.repeatHardStop;
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
  const lang = useMemo(() => detectLangCode(), []);
  const uiText = useMemo(() => getUiText(lang), [lang]);
  const lastBotRef = useRef({ normalized: "", repeatCount: 0 });

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
    if (lang === "en") return "en-IN";
    if (lang === "ta") return "ta-IN";
    if (lang === "gu") return "gu-IN";
    return "hi-IN";
  };

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
    lastBotRef.current = { normalized: "", repeatCount: 0 };

    try {
      const response = await askFdAdvisor({
        session_id: sessionId.current,
        userInput,
        user_language: lang,
        response_language: lang,
        reasoning_mode: "llm_only",
        frontend_directive: "Use LLM reasoning only. Respond in same language as user_language.",
        location_permission: locationPermission,
        nearbyBanks: locationState.nearbyBanks,
        lat: locationState.lat,
        lng: locationState.lng
      });

      const incomingBot = String(response?.text || stageToQuestion(response?.stage, lang)).trim();
      const normalizedIncoming = normalizeMessage(incomingBot);
      const repeatCount =
        normalizedIncoming && normalizedIncoming === lastBotRef.current.normalized
          ? lastBotRef.current.repeatCount + 1
          : 0;
      lastBotRef.current = { normalized: normalizedIncoming, repeatCount };
      const botText = refineRepeatedBotText(incomingBot, repeatCount, lang);
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

  const goConversation = async () => {
    setScreen("conversation");

    if (messages.length === 0) {
      const greeting = uiText.greeting;
      setMessages([{ role: "bot", text: greeting }]);
      lastBotRef.current = { normalized: normalizeMessage(greeting), repeatCount: 0 };

      if (conversationMode === "voice") {
        await playText(greeting);
      }

      if (conversationMode === "voice" && !isRecording) {
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
            label={conversationMode === "voice" && isSpeaking ? "Advisor bol rahi hain..." : "Aapki FD didi"}
          />

          <View style={styles.langChip}>
            <Text style={styles.langText}>Language: {lang.toUpperCase()}</Text>
          </View>

          <View style={styles.modeRowHome}>
            <Pressable
              style={[styles.modePillHome, conversationMode === "voice" && styles.modePillHomeActive]}
              onPress={() => setConversationMode("voice")}
            >
              <Text style={[styles.modePillHomeText, conversationMode === "voice" && styles.modePillHomeTextActive]}>
                Voice + Listen
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
                Text Mode
              </Text>
            </Pressable>
          </View>

          <Text style={styles.modeHint}>Dono mode me aap mic aur text dono use kar sakte hain.</Text>
          {conversationMode === "voice" ? <Text style={styles.liveHelpText}>Reply ke baad mic auto start hoga</Text> : null}

          <MicButton
            recording={isRecording}
            onPress={async () => {
              await goConversation();
              if (conversationMode === "voice") {
                onMicPress();
              }
            }}
          />

          <Pressable onPress={goConversation} style={styles.secondaryBtn}>
            <Text style={styles.secondaryBtnText}>
              {conversationMode === "voice" ? "Baat-cheet shuru karein" : "Text se continue karein"}
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
          <Text style={styles.title}>Top 3 FD Options</Text>
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
            <Text style={styles.secondaryBtnText}>Phir se puchhein</Text>
          </Pressable>
        </ScrollView>
      </SafeAreaView>
    );
  }

  if (screen === "confirm") {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.centerCard}>
          <Text style={styles.confirmText}>Kya aap FD banana chahte hain?</Text>
          {selectedFd ? <Text style={styles.fdChoice}>{selectedFd.bank_name}</Text> : null}

          <Pressable style={styles.yesBtn} onPress={() => setScreen("success")}>
            <Text style={styles.yesNoText}>Haan</Text>
          </Pressable>
          <Pressable style={styles.noBtn} onPress={() => setScreen("results")}>
            <Text style={styles.yesNoText}>Nahi</Text>
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
          <Text style={styles.confirmText}>Aapki FD request submit ho gayi hai</Text>
          <Pressable
            style={styles.secondaryBtn}
            onPress={() => {
              setRecommendations([]);
              setSelectedFd(null);
              setMessages([]);
              setScreen("home");
            }}
          >
            <Text style={styles.secondaryBtnText}>Phir se check karein</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.chatWrap}>
        <Text style={styles.title}>Conversation</Text>

        <View style={styles.agentRow}>
          <AgentAvatar
            speaking={conversationMode === "voice" && isSpeaking}
            label={conversationMode === "voice" && isSpeaking ? "Main bol rahi hoon..." : isRecording ? "Main sun rahi hoon..." : "Main yahin hoon, poochiye"}
          />
          <Pressable style={styles.stopSpeakBtn} onPress={stopPlayback}>
            <Text style={styles.stopSpeakText}>Stop Voice</Text>
          </Pressable>
        </View>

        {conversationMode === "voice" ? <Text style={styles.liveHelpText}>Reply ke baad mic auto start hoga</Text> : null}

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
              Voice + Listen
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
              Text
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
          <Pressable style={styles.sendBtn} onPress={() => sendAdvisorInput(inputText)}>
            <Text style={styles.sendText}>Send</Text>
          </Pressable>
        </View>

        <View style={styles.bottomActionRow}>
          <MicButton recording={isRecording} onPress={onMicPress} />
          <Text style={styles.bottomHint}>
            {conversationMode === "voice"
              ? "Voice mode ON: boliye, main jawab dekar phir sunungi."
              : "Text mode ON: chaho to mic bhi use kar sakte ho."}
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
  langText: {
    fontSize: 16,
    fontWeight: "700",
    color: colors.text
  },
  modeRowHome: {
    flexDirection: "row",
    gap: 8,
    width: "100%",
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
    fontSize: 19,
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
  sendText: {
    fontSize: 17,
    color: "#FFFFFF",
    fontWeight: "900"
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
