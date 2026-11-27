import { useEffect, useMemo, useState } from "react";
import { StyleSheet, Text, View } from "react-native";

import { ListCard, ListSwitchRow } from "@/components/list";
import { hapticToggle } from "@/lib/haptics";
import {
  DEFAULT_NOTIFICATION_SETTINGS,
  fetchNotificationSettings,
  saveNotificationSetting,
  type NotificationCategory,
  type NotificationSettings,
} from "@/lib/notification-settings";
import { createSerialQueue } from "@/lib/serial-queue";
import { failureMessage } from "@/lib/network-errors";
import { useTheme, type Theme } from "@/theme";

// Mon compte : les deux interrupteurs des notifications (CLAUDE.md, « Notifications d'un
// repas »). Le serveur ne prévient plus qui a coupé une catégorie.
export function NotificationSettingsCard() {
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  // null tant que les réglages ne sont pas lus : interrupteurs grisés, pour ne pas afficher
  // « activé » puis basculer sous le doigt.
  const [settings, setSettings] = useState<NotificationSettings | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Basculer vite deux fois envoie deux requêtes : elles partent dans l'ordre des touchers.
  const [enqueue] = useState(createSerialQueue);

  // Lecture au montage de l'écran : la base est un système externe, l'effet est justifié.
  useEffect(() => {
    let isCurrent = true;
    fetchNotificationSettings()
      .then((loaded) => {
        if (isCurrent) setSettings(loaded);
      })
      .catch((loadError: unknown) => {
        if (isCurrent) setError(failureMessage("Tes réglages ne se chargent pas", loadError));
      });
    return () => {
      isCurrent = false;
    };
  }, []);

  // Optimiste : l'interrupteur bascule tout de suite, et revient si l'enregistrement échoue.
  function handleChange(category: NotificationCategory, isOn: boolean) {
    hapticToggle(isOn);
    setError(null);
    setSettings((current) => (current ? { ...current, [category]: isOn } : current));
    enqueue(() => saveNotificationSetting(category, isOn)).catch((saveError: unknown) => {
      setSettings((current) => (current ? { ...current, [category]: !isOn } : current));
      setError(failureMessage("Ton réglage n’est pas enregistré", saveError));
    });
  }

  const shown = settings ?? DEFAULT_NOTIFICATION_SETTINGS;
  const isDisabled = settings === null;

  return (
    <View style={styles.block}>
      <Text style={styles.title} accessibilityRole="header">
        Me prévenir
      </Text>
      <ListCard>
        <ListSwitchRow
          icon="bell"
          label="Votes du foyer"
          subtitle="Un vote commence, un rappel si tu n’as rien coché, le plat choisi"
          value={shown.votes}
          onChange={(isOn) => handleChange("votes", isOn)}
          isDisabled={isDisabled}
        />
        <ListSwitchRow
          icon="users"
          label="Repas à plusieurs"
          subtitle="Qui rejoint et qui apporte quoi, les votes du repas"
          value={shown.meals}
          onChange={(isOn) => handleChange("meals", isOn)}
          isDisabled={isDisabled}
        />
        <ListSwitchRow
          icon="shopping-cart"
          label="Liste de courses"
          subtitle="Quelqu’un part faire les courses, ce que le foyer ajoute pendant les tiennes"
          value={shown.shopping}
          onChange={(isOn) => handleChange("shopping", isOn)}
          isDisabled={isDisabled}
        />
      </ListCard>
      {/* Retour d'usage du 2026-11-25 : un test seul, sans notification pour son propre
          apport, faisait croire à une panne. */}
      <Text style={styles.hint}>Jamais pour ce que tu fais toi-même.</Text>
      {error ? (
        <Text style={styles.error} accessibilityRole="alert" accessibilityLiveRegion="assertive">
          {error}
        </Text>
      ) : null}
    </View>
  );
}

function createStyles({ colors, spacing, fonts, fontSize }: Theme) {
  return StyleSheet.create({
    block: { gap: spacing.sm },
    title: { color: colors.text, fontFamily: fonts.displayBold, fontSize: fontSize.cardTitle },
    error: { color: colors.danger, fontSize: fontSize.small },
    hint: { color: colors.textMuted, fontSize: fontSize.caption },
  });
}
