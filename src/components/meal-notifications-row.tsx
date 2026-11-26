import { useEffect, useMemo, useState } from "react";
import { StyleSheet, Text, View } from "react-native";

import { ListCard, ListSwitchRow } from "@/components/list";
import { hapticToggle } from "@/lib/haptics";
import {
  fetchMealNotificationsOn,
  fetchNotificationSettings,
  setMealNotificationsOn,
} from "@/lib/notification-settings";
import { createSerialQueue } from "@/lib/serial-queue";
import { failureMessage } from "@/lib/network-errors";
import { useTheme, type Theme } from "@/theme";

type State = { isOn: boolean; isMealsOff: boolean };

// Écran d'un repas : « Me tenir au courant », pour ce repas seulement (ses votes, qui rejoint,
// qui apporte quoi). Si « Repas à plusieurs » est coupé dans Mon compte, on le dit au lieu
// d'afficher un interrupteur qui ne changerait rien.
export function MealNotificationsRow({ soireeId }: { soireeId: string }) {
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  // null tant que ce n'est pas lu : pas d'« activé » qui bascule sous le doigt.
  const [state, setState] = useState<State | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [enqueue] = useState(createSerialQueue);

  // Lecture au montage : la base est un système externe, l'effet est justifié.
  useEffect(() => {
    let isCurrent = true;
    Promise.all([fetchMealNotificationsOn(soireeId), fetchNotificationSettings()])
      .then(([isOn, settings]) => {
        if (isCurrent) setState({ isOn, isMealsOff: !settings.meals });
      })
      .catch((loadError: unknown) => {
        if (isCurrent) setError(failureMessage("Ce réglage ne se charge pas", loadError));
      });
    return () => {
      isCurrent = false;
    };
  }, [soireeId]);

  // Optimiste : bascule tout de suite, revient si l'enregistrement échoue.
  function handleChange(isOn: boolean) {
    hapticToggle(isOn);
    setError(null);
    setState((current) => (current ? { ...current, isOn } : current));
    enqueue(() => setMealNotificationsOn(soireeId, isOn)).catch((saveError: unknown) => {
      setState((current) => (current ? { ...current, isOn: !isOn } : current));
      setError(failureMessage("Ton réglage n’est pas enregistré", saveError));
    });
  }

  const isMealsOff = state?.isMealsOff ?? false;

  return (
    <View style={styles.block}>
      <ListCard>
        <ListSwitchRow
          icon="bell"
          label="Me tenir au courant"
          subtitle={
            isMealsOff
              ? "Coupé pour tous les repas, dans Mon compte"
              : "Qui rejoint, qui apporte quoi, les votes de ce repas"
          }
          value={!isMealsOff && (state?.isOn ?? true)}
          onChange={handleChange}
          isDisabled={state === null || isMealsOff}
        />
      </ListCard>
      {error ? (
        <Text style={styles.error} accessibilityRole="alert" accessibilityLiveRegion="assertive">
          {error}
        </Text>
      ) : null}
    </View>
  );
}

function createStyles({ spacing, colors, fontSize }: Theme) {
  return StyleSheet.create({
    block: { gap: spacing.sm },
    error: { color: colors.danger, fontSize: fontSize.small },
  });
}
