import React, { useEffect, useRef } from "react";
import { Animated, Easing, StyleSheet, Text, View } from "react-native";
import { colors } from "../theme";

export default function AgentAvatar({ speaking, label }) {
  const pulse = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!speaking) {
      pulse.stopAnimation();
      pulse.setValue(0);
      return;
    }

    const loop = Animated.loop(
      Animated.timing(pulse, {
        toValue: 1,
        duration: 1300,
        easing: Easing.out(Easing.ease),
        useNativeDriver: true
      })
    );

    loop.start();

    return () => {
      loop.stop();
      pulse.stopAnimation();
      pulse.setValue(0);
    };
  }, [speaking, pulse]);

  const rippleScale = pulse.interpolate({
    inputRange: [0, 1],
    outputRange: [1, 1.8]
  });

  const rippleOpacity = pulse.interpolate({
    inputRange: [0, 1],
    outputRange: [0.4, 0]
  });

  return (
    <View style={styles.wrap}>
      <Animated.View
        pointerEvents="none"
        style={[
          styles.ripple,
          speaking && {
            opacity: rippleOpacity,
            transform: [{ scale: rippleScale }]
          }
        ]}
      />
      <View style={[styles.avatar, speaking && styles.avatarSpeaking]}>
        <Text style={styles.emoji}>👩</Text>
      </View>
      <Text style={styles.label}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    alignItems: "center",
    justifyContent: "center"
  },
  ripple: {
    position: "absolute",
    width: 76,
    height: 76,
    borderRadius: 999,
    backgroundColor: colors.primarySoft
  },
  avatar: {
    width: 62,
    height: 62,
    borderRadius: 999,
    backgroundColor: "#FFFFFF",
    borderWidth: 2,
    borderColor: colors.border,
    alignItems: "center",
    justifyContent: "center"
  },
  avatarSpeaking: {
    borderColor: colors.primary,
    backgroundColor: colors.primarySoft
  },
  emoji: {
    fontSize: 30
  },
  label: {
    marginTop: 6,
    fontSize: 13,
    fontWeight: "700",
    color: colors.subText
  }
});
