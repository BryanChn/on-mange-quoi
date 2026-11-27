import { Feather, MaterialCommunityIcons } from "@expo/vector-icons";
import { router } from "expo-router";
import { useMemo, useState, type ComponentProps } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { PrimaryButton } from "@/components/primary-button";
import { TextField } from "@/components/text-field";
import { hapticToggle } from "@/lib/haptics";
import {
  addDays,
  formatLongDay,
  formatMonth,
  formatShortDay,
  isSelectable,
  monthWeeks,
  toDay,
} from "@/lib/meal-date";
import { useProfile } from "@/lib/profile";
import { defaultSoireeName, SOIREE_NAME_MAX_LENGTH } from "@/lib/soiree-rules";
import { createSoiree, type SoireeMode } from "@/lib/soirees";
import { MENU_TOPICS, topicWords, type VoteTopic } from "@/lib/vote-topic";
import { failureMessage } from "@/lib/network-errors";
import { useTheme, type Theme } from "@/theme";

type IconName = ComponentProps<typeof MaterialCommunityIcons>["name"];

// Les trois façons de faire un repas (maquette du 24/11 :
// https://claude.ai/artifact/Y3YUASnGDVfdk6pqzDvk4p). Un toucher crée le repas ; seul « chez
// quelqu'un » demande une étape de plus, déjà pré-remplie au plus probable.
const PLANS: { mode: SoireeMode; icon: IconName; title: string; subtitle: string }[] = [
  {
    mode: "commande",
    icon: "moped-outline",
    title: "On se commande un truc",
    subtitle: "Kebab, pizza… chacun note ce qu’il veut",
  },
  {
    mode: "resto",
    icon: "silverware-fork-knife",
    title: "On va au resto",
    subtitle: "On vote le resto, et c’est réglé",
  },
  {
    mode: "maison",
    icon: "home-heart",
    title: "On mange chez quelqu’un",
    subtitle: "On vote le menu, chacun dit ce qu’il apporte",
  },
];

type When = "today" | "tomorrow" | "date";

export default function NewSoiree() {
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const insets = useSafeAreaInsets();
  const { profile } = useProfile();
  // Nom proposé (« Samedi chez Bryan ») en exemple grisé : laissé vide, le repas le prend.
  const suggestedName = defaultSoireeName(new Date(), profile?.display_name ?? "");
  const today = toDay(new Date());

  const [step, setStep] = useState<"plan" | "menu">("plan");
  const [name, setName] = useState("");
  // Chez quelqu'un : plat et dessert, le cas le plus courant.
  const [topics, setTopics] = useState<VoteTopic[]>([]);
  const [when, setWhen] = useState<When>("today");
  const [pickedDay, setPickedDay] = useState<string | null>(null);
  const [shownMonth, setShownMonth] = useState(() => {
    const now = new Date();
    return { year: now.getFullYear(), month: now.getMonth() };
  });
  const [creating, setCreating] = useState<SoireeMode | null>(null);
  const [error, setError] = useState<string | null>(null);

  const mealDay =
    when === "today" ? today : when === "tomorrow" ? addDays(today, 1) : (pickedDay ?? today);

  async function create(mode: SoireeMode) {
    setError(null);
    setCreating(mode);
    try {
      const soiree = await createSoiree({
        name: name.trim() || suggestedName,
        mode,
        topics: mode === "maison" ? topics : [],
        date: mode === "maison" ? mealDay : null,
      });
      // replace : le retour ramène à l'accueil, pas à ce formulaire déjà envoyé.
      router.replace({ pathname: "/soiree/[id]", params: { id: soiree.id } });
    } catch (error) {
      setError(failureMessage("Le repas n’est pas créé", error));
      setCreating(null);
    }
  }

  function choosePlan(mode: SoireeMode) {
    if (mode === "maison") {
      setError(null);
      setStep("menu");
    } else {
      create(mode);
    }
  }

  function toggleTopic(topic: VoteTopic) {
    const isOn = !topics.includes(topic);
    hapticToggle(isOn);
    setTopics((current) =>
      isOn
        ? MENU_TOPICS.filter((t) => t === topic || current.includes(t))
        : current.filter((t) => t !== topic),
    );
  }

  function moveMonth(delta: number) {
    setShownMonth(({ year, month }) => {
      const next = new Date(year, month + delta, 1);
      return { year: next.getFullYear(), month: next.getMonth() };
    });
  }

  const isBusy = creating !== null;

  return (
    <ScrollView
      contentContainerStyle={[
        styles.container,
        { paddingBottom: insets.bottom + theme.spacing.xl },
      ]}
      keyboardShouldPersistTaps="handled"
    >
      <View style={styles.progress} accessibilityLabel={`Étape ${step === "plan" ? 1 : 2} sur 2`}>
        <View style={[styles.progressDot, styles.progressDotOn]} />
        <View style={[styles.progressDot, step === "menu" && styles.progressDotOn]} />
      </View>

      {step === "plan" ? (
        <>
          <View style={styles.heading}>
            <Text style={styles.title} accessibilityRole="header">
              C’est quoi le plan ?
            </Text>
            <Text style={styles.subtitle}>Touche, on s’occupe du reste.</Text>
          </View>

          <TextField
            label="Nom du repas"
            value={name}
            onChangeText={setName}
            placeholder={suggestedName}
            autoCapitalize="sentences"
            maxLength={SOIREE_NAME_MAX_LENGTH}
            editable={!isBusy}
          />

          <View style={styles.plans}>
            {/* Trois cartes identiques : aucune n'a l'air déjà choisie, un toucher suffit. */}
            {PLANS.map((plan) => {
              const isThisOne = creating === plan.mode;
              return (
                <Pressable
                  key={plan.mode}
                  onPress={() => choosePlan(plan.mode)}
                  disabled={isBusy}
                  accessibilityRole="button"
                  accessibilityLabel={`${plan.title}. ${plan.subtitle}`}
                  accessibilityState={{ busy: isThisOne, disabled: isBusy }}
                  style={({ pressed }) => [
                    styles.plan,
                    (pressed || (isBusy && !isThisOne)) && styles.pressed,
                  ]}
                >
                  <View style={styles.planIcon}>
                    {isThisOne ? (
                      <ActivityIndicator color={theme.colors.primary} />
                    ) : (
                      <MaterialCommunityIcons
                        name={plan.icon}
                        size={28}
                        color={theme.colors.primary}
                      />
                    )}
                  </View>
                  <View style={styles.planText}>
                    <Text style={styles.planTitle}>{plan.title}</Text>
                    <Text style={styles.planSubtitle}>{plan.subtitle}</Text>
                  </View>
                </Pressable>
              );
            })}
          </View>
        </>
      ) : (
        <>
          <Pressable
            onPress={() => setStep("plan")}
            disabled={isBusy}
            accessibilityRole="button"
            style={({ pressed }) => [styles.backLink, pressed && styles.pressed]}
          >
            <Feather name="chevron-left" size={18} color={theme.colors.textMuted} />
            <Text style={styles.backText}>Changer de plan</Text>
          </Pressable>

          <View style={styles.heading}>
            <View style={styles.kicker}>
              <MaterialCommunityIcons name="home-heart" size={16} color={theme.colors.primary} />
              <Text style={styles.kickerText}>On mange chez quelqu’un</Text>
            </View>
            <Text style={styles.title} accessibilityRole="header">
              On décide quoi ?
            </Text>
            <Text style={styles.subtitle}>
              Coche ce que vous votez. Le reste, chacun dit ce qu’il apporte.
            </Text>
          </View>

          <View style={styles.topics}>
            {MENU_TOPICS.map((topic) => {
              const isOn = topics.includes(topic);
              return (
                <Pressable
                  key={topic}
                  onPress={() => toggleTopic(topic)}
                  disabled={isBusy}
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: isOn }}
                  style={({ pressed }) => [
                    styles.topic,
                    isOn && styles.topicOn,
                    pressed && styles.pressed,
                  ]}
                >
                  <Text style={styles.topicLabel}>{topicWords(topic).label}</Text>
                  <View style={[styles.topicBox, isOn && styles.topicBoxOn]}>
                    {isOn ? (
                      <Feather name="check" size={15} color={theme.colors.onPrimary} />
                    ) : null}
                  </View>
                </Pressable>
              );
            })}
          </View>

          <View style={styles.whenBlock}>
            <Text style={styles.whenTitle}>Quand ?</Text>
            <View style={styles.whenChips}>
              {(
                [
                  ["today", "Aujourd’hui"],
                  ["tomorrow", "Demain"],
                  ["date", when === "date" && pickedDay ? formatShortDay(pickedDay) : "Une date"],
                ] as const
              ).map(([key, label]) => (
                <Pressable
                  key={key}
                  onPress={() => setWhen(key)}
                  disabled={isBusy}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: when === key }}
                  style={({ pressed }) => [
                    styles.whenChip,
                    when === key && styles.whenChipOn,
                    pressed && styles.pressed,
                  ]}
                >
                  {/* Une fois la date choisie, elle se suffit : sans icône, les trois tiennent sur
                      une ligne. */}
                  {key === "date" && !(when === "date" && pickedDay) ? (
                    <Feather
                      name="calendar"
                      size={16}
                      color={when === key ? theme.colors.onPrimary : theme.colors.text}
                    />
                  ) : null}
                  <Text style={[styles.whenChipText, when === key && styles.whenChipTextOn]}>
                    {label}
                  </Text>
                </Pressable>
              ))}
            </View>

            {when === "date" ? (
              <View style={styles.calendar}>
                <View style={styles.calendarHeader}>
                  <Pressable
                    onPress={() => moveMonth(-1)}
                    accessibilityRole="button"
                    accessibilityLabel="Mois précédent"
                    style={({ pressed }) => [styles.monthButton, pressed && styles.pressed]}
                  >
                    <Feather name="chevron-left" size={22} color={theme.colors.text} />
                  </Pressable>
                  <Text style={styles.monthTitle}>
                    {formatMonth(shownMonth.year, shownMonth.month)}
                  </Text>
                  <Pressable
                    onPress={() => moveMonth(1)}
                    accessibilityRole="button"
                    accessibilityLabel="Mois suivant"
                    style={({ pressed }) => [styles.monthButton, pressed && styles.pressed]}
                  >
                    <Feather name="chevron-right" size={22} color={theme.colors.text} />
                  </Pressable>
                </View>
                <View style={styles.weekRow}>
                  {["L", "M", "M", "J", "V", "S", "D"].map((day, index) => (
                    <Text key={index} style={styles.weekday} importantForAccessibility="no">
                      {day}
                    </Text>
                  ))}
                </View>
                {monthWeeks(shownMonth.year, shownMonth.month).map((week, weekIndex) => (
                  <View key={weekIndex} style={styles.weekRow}>
                    {week.map((day, dayIndex) => {
                      if (day === null) return <View key={dayIndex} style={styles.dayCell} />;
                      const canPick = isSelectable(day, today);
                      const isPicked = day === pickedDay;
                      return (
                        <Pressable
                          key={day}
                          onPress={() => setPickedDay(day)}
                          disabled={!canPick}
                          accessibilityRole="button"
                          accessibilityLabel={formatLongDay(day)}
                          accessibilityState={{ selected: isPicked, disabled: !canPick }}
                          style={styles.dayCell}
                        >
                          <View style={[styles.day, isPicked && styles.dayPicked]}>
                            <Text
                              style={[
                                styles.dayText,
                                !canPick && styles.dayTextOff,
                                day === today && styles.dayTextToday,
                                isPicked && styles.dayTextPicked,
                              ]}
                            >
                              {Number(day.slice(8))}
                            </Text>
                          </View>
                        </Pressable>
                      );
                    })}
                  </View>
                ))}
              </View>
            ) : null}
          </View>

          <PrimaryButton
            label={
              // Le bouton annonce ce qui va se passer : rien n'est coché d'office.
              topics.length === 0
                ? "C’est parti, sans vote"
                : `Lancer ${topics.length} vote${topics.length > 1 ? "s" : ""}`
            }
            onPress={() => create("maison")}
            isLoading={creating === "maison"}
          />
        </>
      )}

      {error ? (
        <Text style={styles.error} accessibilityRole="alert" accessibilityLiveRegion="assertive">
          {error}
        </Text>
      ) : null}
    </ScrollView>
  );
}

function createStyles({ colors, spacing, radius, fonts, fontSize }: Theme) {
  return StyleSheet.create({
    container: { padding: spacing.lg, paddingTop: spacing.md, gap: spacing.xl },
    pressed: { opacity: 0.6 },
    progress: { flexDirection: "row", gap: 6, alignSelf: "flex-end" },
    progressDot: {
      width: 22,
      height: 6,
      borderRadius: radius.pill,
      backgroundColor: colors.border,
    },
    progressDotOn: { backgroundColor: colors.primary },
    heading: { gap: spacing.sm },
    title: {
      color: colors.text,
      fontFamily: fonts.display,
      fontSize: fontSize.screenTitle,
      lineHeight: 34,
    },
    subtitle: { color: colors.textMuted, fontSize: fontSize.body },

    // Les trois plans : une ligne par plan, un toucher (refonte v4 : plus compactes).
    plans: { gap: spacing.md },
    plan: {
      minHeight: 76,
      flexDirection: "row",
      alignItems: "center",
      gap: spacing.lg,
      padding: spacing.lg,
      borderRadius: radius.lg,
      backgroundColor: colors.surface,
    },
    planIcon: {
      width: 44,
      height: 44,
      borderRadius: radius.md,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: colors.surface2,
    },
    planText: { flex: 1, gap: spacing.xs },
    planTitle: { color: colors.text, fontFamily: fonts.displayBold, fontSize: fontSize.cardTitle },
    planSubtitle: { color: colors.textMuted, fontSize: fontSize.small },

    backLink: {
      alignSelf: "flex-start",
      minHeight: 44,
      flexDirection: "row",
      alignItems: "center",
      gap: spacing.xs,
      marginBottom: -spacing.md,
    },
    backText: { color: colors.textMuted, fontSize: fontSize.small, fontWeight: "700" },
    kicker: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
    kickerText: { color: colors.primary, fontSize: fontSize.small, fontWeight: "700" },

    // Les sujets du menu : 2 colonnes de grosses cases.
    topics: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
    topic: {
      flexBasis: "47%",
      flexGrow: 1,
      height: 56,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      paddingHorizontal: spacing.lg,
      borderRadius: radius.lg,
      borderWidth: 1.5,
      borderColor: colors.surface,
      backgroundColor: colors.surface,
    },
    topicOn: { borderColor: colors.primary, backgroundColor: colors.chipBg },
    topicLabel: { color: colors.text, fontFamily: fonts.displayBold, fontSize: fontSize.cardTitle },
    topicBox: {
      width: 26,
      height: 26,
      borderRadius: 9,
      borderWidth: 2,
      borderColor: colors.inputBorder,
      alignItems: "center",
      justifyContent: "center",
    },
    topicBoxOn: { borderColor: colors.primary, backgroundColor: colors.primary },

    // Quand ? Ce soir, demain, ou une date du calendrier.
    whenBlock: { gap: spacing.md },
    whenTitle: { color: colors.textMuted, fontSize: fontSize.small, fontWeight: "700" },
    whenChips: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
    whenChip: {
      minHeight: 44,
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
      paddingHorizontal: 12,
      borderRadius: radius.pill,
      backgroundColor: colors.surface2,
    },
    whenChipOn: { backgroundColor: colors.primary },
    whenChipText: { color: colors.text, fontSize: fontSize.small, fontWeight: "700" },
    whenChipTextOn: { color: colors.onPrimary },
    calendar: { padding: spacing.md, borderRadius: radius.lg, backgroundColor: colors.surface },
    calendarHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
    monthButton: { width: 44, height: 44, alignItems: "center", justifyContent: "center" },
    monthTitle: { color: colors.text, fontFamily: fonts.displayBold, fontSize: fontSize.body },
    weekRow: { flexDirection: "row" },
    weekday: {
      flex: 1,
      textAlign: "center",
      color: colors.textMuted,
      fontSize: fontSize.caption,
      paddingVertical: spacing.xs,
    },
    dayCell: { flex: 1, height: 44, alignItems: "center", justifyContent: "center" },
    day: {
      width: 40,
      height: 40,
      borderRadius: radius.pill,
      alignItems: "center",
      justifyContent: "center",
    },
    dayPicked: { backgroundColor: colors.primary },
    dayText: { color: colors.text, fontSize: fontSize.body },
    dayTextOff: { color: colors.border },
    dayTextToday: { color: colors.primary, fontWeight: "700" },
    dayTextPicked: { color: colors.onPrimary, fontWeight: "700" },

    error: { color: colors.danger, fontSize: fontSize.small },
  });
}
