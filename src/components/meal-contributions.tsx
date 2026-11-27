import { Feather } from "@expo/vector-icons";
import { useMemo, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from "react-native";

import { Avatar } from "@/components/avatar";
import { hapticAdded, hapticReject } from "@/lib/haptics";
import { failureMessage } from "@/lib/network-errors";
import {
  addContribution,
  CONTRIBUTION_MAX_LENGTH,
  removeContribution,
  type SoireeDetail,
} from "@/lib/soirees";
import { useTheme, type Theme } from "@/theme";

type MealContributionsProps = {
  soiree: SoireeDetail;
  userId: string | undefined;
  isOwner: boolean;
  // Après chaque écriture : l'écran recharge le repas (et le temps réel prévient les autres).
  onChanged: () => void;
};

// « Qui apporte quoi » d'un repas chez quelqu'un : chacun écrit ce qu'il apporte, tout le monde
// le voit en direct. Même geste que la liste de courses : un champ, un « + ».
export function MealContributions({ soiree, userId, isOwner, onChanged }: MealContributionsProps) {
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const [label, setLabel] = useState("");
  const [isAdding, setIsAdding] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const memberById = new Map(soiree.members.map((member) => [member.id, member]));

  async function handleAdd() {
    if (label.trim() === "") {
      setError("Écris ce que tu apportes.");
      return;
    }
    setError(null);
    setIsAdding(true);
    try {
      await addContribution(soiree.id, label);
      hapticAdded();
      setLabel("");
      onChanged();
    } catch (error) {
      hapticReject();
      setError(failureMessage("Ce n’est pas ajouté", error));
    } finally {
      setIsAdding(false);
    }
  }

  async function handleRemove(contributionId: string) {
    setError(null);
    try {
      await removeContribution(contributionId);
      onChanged();
    } catch (error) {
      hapticReject();
      setError(failureMessage("Ce n’est pas retiré", error));
    }
  }

  return (
    <View style={styles.section}>
      <View style={styles.header}>
        <Text style={styles.title} accessibilityRole="header">
          Qui apporte quoi
        </Text>
        <Text style={styles.count}>{soiree.contributions.length}</Text>
      </View>

      <View style={styles.composer}>
        <View style={[styles.field, error !== null && styles.fieldError]}>
          <TextInput
            value={label}
            onChangeText={setLabel}
            placeholder="J’apporte…"
            placeholderTextColor={theme.colors.textMuted}
            accessibilityLabel="Ce que tu apportes"
            autoCapitalize="sentences"
            maxLength={CONTRIBUTION_MAX_LENGTH}
            editable={!isAdding}
            onSubmitEditing={handleAdd}
            style={styles.input}
          />
        </View>
        <Pressable
          onPress={handleAdd}
          disabled={isAdding}
          accessibilityRole="button"
          accessibilityLabel="Ajouter"
          accessibilityState={{ busy: isAdding }}
          style={({ pressed }) => [styles.addButton, pressed && styles.pressed]}
        >
          {isAdding ? (
            <ActivityIndicator color={theme.colors.onPrimary} />
          ) : (
            <Feather name="plus" size={24} color={theme.colors.onPrimary} />
          )}
        </Pressable>
      </View>
      {error ? (
        <Text style={styles.error} accessibilityRole="alert" accessibilityLiveRegion="assertive">
          {error}
        </Text>
      ) : null}

      <View style={styles.list}>
        {soiree.contributions.length === 0 ? (
          <Text style={styles.empty}>
            Personne n’a encore rien dit. Le vin, le pain, les chips ?
          </Text>
        ) : (
          soiree.contributions.map((line, index) => {
            const member = memberById.get(line.profileId);
            const isMine = line.profileId === userId;
            const name = isMine ? "toi" : (member?.name ?? "Quelqu’un");
            return (
              <View key={line.id} style={[styles.row, index > 0 && styles.separated]}>
                <Avatar
                  name={member?.name ?? "?"}
                  avatar={member?.avatar ?? null}
                  photoPath={member?.photoPath ?? null}
                  size={32}
                />
                <View
                  style={styles.rowText}
                  accessible
                  accessibilityLabel={`${name} apporte ${line.label}`}
                >
                  <Text style={styles.label}>{line.label}</Text>
                  <Text style={styles.name}>{name}</Text>
                </View>
                {/* Chacun retire sa ligne ; le responsable peut retirer celle d'un autre. */}
                {isMine || isOwner ? (
                  <Pressable
                    onPress={() => handleRemove(line.id)}
                    accessibilityRole="button"
                    accessibilityLabel={`Retirer « ${line.label} »`}
                    hitSlop={4}
                    style={({ pressed }) => [styles.remove, pressed && styles.pressed]}
                  >
                    <Feather name="x" size={18} color={theme.colors.textMuted} />
                  </Pressable>
                ) : null}
              </View>
            );
          })
        )}
      </View>
    </View>
  );
}

function createStyles({ colors, spacing, radius, control, fontSize, cardShadow }: Theme) {
  return StyleSheet.create({
    pressed: { opacity: 0.6 },
    section: { gap: spacing.sm },
    header: {
      flexDirection: "row",
      alignItems: "baseline",
      justifyContent: "space-between",
      paddingHorizontal: spacing.xs,
    },
    title: { color: colors.textMuted, fontSize: fontSize.small, fontWeight: "700" },
    count: { color: colors.textMuted, fontSize: fontSize.small },
    composer: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
    field: {
      flex: 1,
      minWidth: 0,
      height: control.lg,
      justifyContent: "center",
      paddingHorizontal: 18,
      borderRadius: radius.pill,
      borderWidth: 1.5,
      borderColor: colors.inputBorder,
      backgroundColor: colors.surface,
    },
    fieldError: { borderColor: colors.danger },
    input: { color: colors.text, fontSize: fontSize.body },
    addButton: {
      width: control.lg,
      height: control.lg,
      borderRadius: radius.pill,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: colors.primary,
    },
    error: { color: colors.danger, fontSize: fontSize.small },
    list: {
      paddingHorizontal: spacing.lg,
      paddingVertical: spacing.xs,
      borderRadius: radius.lg,
      backgroundColor: colors.surface,
      boxShadow: cardShadow,
    },
    empty: { color: colors.textMuted, fontSize: fontSize.small, paddingVertical: spacing.lg },
    row: { minHeight: 60, flexDirection: "row", alignItems: "center", gap: spacing.md },
    separated: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
    rowText: { flex: 1, minWidth: 0, gap: 2, paddingVertical: spacing.sm },
    label: { color: colors.text, fontSize: fontSize.body, fontWeight: "700" },
    name: { color: colors.textMuted, fontSize: fontSize.caption },
    remove: { width: 44, height: 44, alignItems: "center", justifyContent: "center" },
  });
}
