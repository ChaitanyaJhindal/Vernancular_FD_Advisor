import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { colors } from "../theme";

export default function MicButton({ recording, onPress }) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.outer, pressed && styles.outerPressed]}>
      <View style={[styles.inner, recording && styles.innerActive]}>
        <Text style={styles.mic}>{recording ? "■" : "🎤"}</Text>
      </View>
      <Text style={styles.label}>{recording ? "Stop" : "Tap and speak"}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  outer: {
    alignItems: "center",
    justifyContent: "center",
    width: 230,
    height: 230,
    borderRadius: 999,
    backgroundColor: colors.primarySoft,
    borderWidth: 2,
    borderColor: colors.border
  },
  outerPressed: {
    opacity: 0.8
  },
  inner: {
    width: 130,
    height: 130,
    borderRadius: 999,
    backgroundColor: colors.primary,
    alignItems: "center",
    justifyContent: "center"
  },
  innerActive: {
    backgroundColor: colors.danger
  },
  mic: {
    color: "#FFFFFF",
    fontSize: 42,
    fontWeight: "800"
  },
  label: {
    marginTop: 14,
    fontSize: 22,
    fontWeight: "800",
    color: colors.text
  }
});
