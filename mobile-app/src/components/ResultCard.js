import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { colors, radii } from "../theme";

export default function ResultCard({ item, onSelect }) {
  return (
    <View style={styles.card}>
      <View style={styles.topRow}>
        <Text style={styles.bank}>{item.bank_name || "Bank"}</Text>
        <Text style={styles.tag}>{item.tag || "Best"}</Text>
      </View>

      <Text style={styles.returnLabel}>Final Return</Text>
      <Text style={styles.amount}>₹ {item.expected_return || "-"}</Text>

      <Text style={styles.reason}>{item.reason || "Simple and trusted option"}</Text>
      <Text style={styles.distance}>{item.distance ? `${item.distance} door` : "Distance unavailable"}</Text>

      <Pressable style={styles.button} onPress={onSelect}>
        <Text style={styles.buttonText}>Select</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: radii.xl,
    padding: 16,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: 14
  },
  topRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center"
  },
  bank: {
    fontSize: 21,
    fontWeight: "800",
    color: colors.text,
    flexShrink: 1,
    paddingRight: 8
  },
  tag: {
    fontSize: 14,
    fontWeight: "800",
    color: colors.success,
    backgroundColor: colors.successSoft,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999
  },
  returnLabel: {
    marginTop: 12,
    fontSize: 14,
    fontWeight: "700",
    color: colors.subText
  },
  amount: {
    marginTop: 4,
    fontSize: 36,
    fontWeight: "900",
    color: colors.primary
  },
  reason: {
    marginTop: 8,
    fontSize: 16,
    color: colors.text,
    fontWeight: "600"
  },
  distance: {
    marginTop: 6,
    fontSize: 15,
    color: colors.subText
  },
  button: {
    marginTop: 14,
    height: 52,
    borderRadius: radii.lg,
    backgroundColor: colors.primary,
    alignItems: "center",
    justifyContent: "center"
  },
  buttonText: {
    fontSize: 18,
    fontWeight: "800",
    color: "#FFFFFF"
  }
});
