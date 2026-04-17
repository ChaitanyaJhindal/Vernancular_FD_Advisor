import React, { useMemo, useRef, useState } from "react";
import { ActivityIndicator, FlatList, Pressable, SafeAreaView, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { Audio } from "expo-av";
import * as Localization from "expo-localization";
import * as Location from "expo-location";
import MicButton from "./src/components/MicButton";
import ResultCard from "./src/components/ResultCard";
import { askFdAdvisor, fetchNearbyBanks, requestTtsToLocalFile, transcribeFromUri } from "./src/api/client";
import { useVoiceRecorder } from "./src/hooks/useVoiceRecorder";
import { colors, radii, spacing } from "./src/theme";

function detectLangCode() {
  const locale = String(Localization.getLocales?.()?.[0]?.languageCode || "hi").toLowerCase();
  if (["hi", "en", "ta", "gu"].includes(locale)) return locale;
  return "hi";
}

function stageToQuestion(stage) {
  if (stage === "awaiting_amount") return "Kitna paisa invest karna chahte hain?";
  if (stage === "awaiting_tenure") return "Kitne time ke liye FD karna chahte hain?";
  return "Boliyega, main madad karta hoon.";
}

export default function App() {
  const [screen, setScreen] = useState("home");
  const [conversationMode, setConversationMode] = useState("voice");
  const [inputText, setInputText] = useState("");
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(false);
  const [locationState, setLocationState] = useState({ lat: null, lng: null, nearbyBanks: [] });
  const [recommendations, setRecommendations] = useState([]);
  const [selectedFd, setSelectedFd] = useState(null);

  const sessionId = useRef(`mobile-${Date.now()}`);
  const soundRef = useRef(null);
  const lang = useMemo(() => detectLangCode(), []);

  const { isRecording, startRecording, stopRecording } = useVoiceRecorder();

  const stopPlayback = async () => {
    if (soundRef.current) {
      await soundRef.current.stopAsync();
      await soundRef.current.unloadAsync();
      soundRef.current = null;
    }
  };

  const playText = async (text) => {
    if (!text) return;
    try {
      await stopPlayback();
      const localUri = await requestTtsToLocalFile(text, lang === "en" ? "en-IN" : "hi-IN");
      const { sound } = await Audio.Sound.createAsync({ uri: localUri });
      soundRef.current = sound;
      await sound.playAsync();
    } catch {
      // Silent fallback keeps UX simple for low-literacy users.
    }
  };

  const resolveLocationIfPossible = async () => {
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== "granted") return;

      const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      const lat = loc.coords.latitude;
      const lng = loc.coords.longitude;
      const banksResponse = await fetchNearbyBanks(lat, lng);
      const nearbyBanks = Array.isArray(banksResponse?.results)
        ? banksResponse.results.map((b) => ({ name: b.name, distance_km: b.distanceKm }))
        : [];

      setLocationState({ lat, lng, nearbyBanks });
    } catch {
      // Location is optional by product UX.
    }
  };

  const sendAdvisorInput = async (userInput) => {
    if (!userInput.trim()) return;

    setLoading(true);
    setMessages((prev) => [...prev, { role: "user", text: userInput }]);

    try {
      const response = await askFdAdvisor({
        session_id: sessionId.current,
        userInput,
        user_language: lang,
        nearbyBanks: locationState.nearbyBanks,
        lat: locationState.lat,
        lng: locationState.lng
      });

      const botText = String(response?.text || stageToQuestion(response?.stage));
      setMessages((prev) => [...prev, { role: "bot", text: botText }]);

      if (conversationMode === "voice") {
        await playText(botText);
      }

      if (Array.isArray(response?.recommendations) && response.recommendations.length > 0) {
        setRecommendations(response.recommendations.slice(0, 3));
        setScreen("results");
      }
    } catch {
      setMessages((prev) => [...prev, { role: "bot", text: "Samajh nahi aaya, dobara bolenge?" }]);
    } finally {
      setLoading(false);
      setInputText("");
    }
  };

  const onMicPress = async () => {
    try {
      if (!isRecording) {
        await startRecording();
        return;
      }

      const uri = await stopRecording();
      if (!uri) return;

      setLoading(true);
      const transcript = await transcribeFromUri(uri);
      const text = String(
        transcript?.transcript ||
        transcript?.text ||
        transcript?.output_text ||
        ""
      ).trim();

      if (!text) {
        setLoading(false);
        setMessages((prev) => [...prev, { role: "bot", text: "Samajh nahi aaya, dobara bolenge?" }]);
        return;
      }

      await sendAdvisorInput(text);
    } catch {
      setLoading(false);
      setMessages((prev) => [...prev, { role: "bot", text: "Samajh nahi aaya, dobara bolenge?" }]);
    }
  };

  const goConversation = async () => {
    setScreen("conversation");
    if (messages.length === 0) {
      const greeting = "Namaste, FD ke liye taiyaar hain?";
      setMessages([{ role: "bot", text: greeting }]);
      if (conversationMode === "voice") {
        await playText(greeting);
      }
      resolveLocationIfPossible();
    }
  };

  if (screen === "home") {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.homeWrap}>
          <Text style={styles.brand}>Vernacular FD Advisor</Text>
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
              onPress={() => setConversationMode("text")}
            >
              <Text style={[styles.modePillHomeText, conversationMode === "text" && styles.modePillHomeTextActive]}>
                Text Mode
              </Text>
            </Pressable>
          </View>

          <Text style={styles.modeHint}>Dono mode me aap mic aur text dono use kar sakte hain.</Text>

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
              {conversationMode === "voice" ? "Live baat-cheet shuru karein" : "Text se continue karein"}
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
            onPress={() => setConversationMode("text")}
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
                  <Text style={styles.playText}>▶ Suno</Text>
                </Pressable>
              ) : null}
            </View>
          )}
        />

        {loading ? (
          <View style={styles.loadingRow}>
            <ActivityIndicator color={colors.primary} />
            <Text style={styles.loadingText}>Soch rahe hain...</Text>
          </View>
        ) : null}

        <View style={styles.inputRow}>
          <TextInput
            style={styles.input}
            value={inputText}
            placeholder="Yahan type karein"
            onChangeText={setInputText}
          />
          <Pressable style={styles.sendBtn} onPress={() => sendAdvisorInput(inputText)}>
            <Text style={styles.sendText}>Send</Text>
          </Pressable>
        </View>

        <View style={styles.bottomActionRow}>
          <MicButton recording={isRecording} onPress={onMicPress} />
          <Text style={styles.bottomHint}>
            {conversationMode === "voice" ? "Voice mode ON: main jawab bolkar bhi bataunga." : "Text mode ON: chaho to mic bhi use kar sakte ho."}
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
