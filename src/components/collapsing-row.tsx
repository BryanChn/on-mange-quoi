import { useEffect, useRef, type PropsWithChildren } from "react";
import type { LayoutChangeEvent, StyleProp, ViewStyle } from "react-native";
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from "react-native-reanimated";
import { scheduleOnRN } from "react-native-worklets";

import { dishEntering, ROW_COLLAPSE_EASING, ROW_COLLAPSE_MS } from "@/lib/motion";

type CollapsingRowProps = PropsWithChildren<{
  // Vrai : la ligne se replie (hauteur vers 0, en fondu), et les lignes du dessous remontent
  // avec elle, sans saut. Le repli va jusqu'au bout.
  isCollapsing: boolean;
  // Appelé quand la ligne est repliée : on peut la retirer de la liste sans que rien ne bouge.
  onCollapsed: () => void;
  style?: StyleProp<ViewStyle>;
}>;

// Une ligne de liste qui sait se replier sur place (liste de courses, option A du 27/11 :
// https://claude.ai/artifact/YPfGj11em5YcWXtLSsjtrW). La hauteur est mesurée au repos, puis
// animée sur le thread de l'interface : les lignes suivantes suivent image par image.
export function CollapsingRow({ isCollapsing, onCollapsed, style, children }: CollapsingRowProps) {
  const measured = useSharedValue(0);
  // 1 au repos, 0 replié. Démarre au repos : rien ne bouge au premier affichage.
  const progress = useSharedValue(1);

  // L'animation tourne sur le thread de l'interface (un système hors de React) : l'effet la
  // lance quand la ligne doit se replier, et prévient l'écran une fois repliée.
  // Le rappel le plus récent (l'écran le recrée à chaque rendu) ; le repli, lui, ne démarre
  // qu'une fois : un rendu pendant le repli ne le relance pas.
  const onCollapsedRef = useRef(onCollapsed);
  const hasStartedRef = useRef(false);
  useEffect(() => {
    onCollapsedRef.current = onCollapsed;
  });
  useEffect(() => {
    if (!isCollapsing || hasStartedRef.current) return;
    hasStartedRef.current = true;
    const notify = () => onCollapsedRef.current();
    progress.set(
      withTiming(0, { duration: ROW_COLLAPSE_MS, easing: ROW_COLLAPSE_EASING }, (finished) => {
        if (finished) scheduleOnRN(notify);
      }),
    );
  }, [isCollapsing, progress]);

  const animatedStyle = useAnimatedStyle(() => {
    // Au repos, la hauteur reste libre (un article qu'on modifie peut grandir).
    if (progress.value >= 1 || measured.value === 0) return { opacity: 1 };
    return { height: measured.value * progress.value, opacity: progress.value };
  });

  function handleLayout(event: LayoutChangeEvent) {
    if (!isCollapsing) measured.set(event.nativeEvent.layout.height);
  }

  return (
    <Animated.View
      entering={dishEntering}
      onLayout={handleLayout}
      style={[{ overflow: "hidden" }, style, animatedStyle]}
    >
      {children}
    </Animated.View>
  );
}
