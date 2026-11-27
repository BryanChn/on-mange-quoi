import { useImperativeHandle, useRef, type ReactNode, type Ref } from "react";
import {
  ScrollView,
  StyleSheet,
  View,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  type ScrollViewInstance,
} from "react-native";

export type PeekCarouselHandle = { scrollToIndex: (index: number) => void };

type PeekCarouselProps = {
  // Les cartes, chacune à itemWidth de large, avec une clé stable (l'id du groupe, du repas).
  items: { key: string; content: ReactNode }[];
  itemWidth: number;
  gap: number;
  // Marge de l'écran : la rangée déborde jusqu'aux bords, la première carte reste alignée sur
  // le contenu et la suivante dépasse à droite, pour qu'on devine qu'on peut faire glisser.
  edgeInset: number;
  // Carte affichée à l'ouverture.
  initialIndex?: number;
  // Appelé quand une carte s'arrête en place après un glissement.
  onIndexChange?: (index: number) => void;
  accessibilityLabel: string;
  // Pour faire glisser jusqu'à une carte depuis l'extérieur (une pastille touchée).
  ref?: Ref<PeekCarouselHandle>;
};

// Rangée de cartes qu'on fait glisser une par une (accueil : « Ce soir » par groupe,
// « Bientôt »). Une seule carte : elle prend toute la largeur, rien ne glisse.
export function PeekCarousel({
  items,
  itemWidth,
  gap,
  edgeInset,
  initialIndex = 0,
  onIndexChange,
  accessibilityLabel,
  ref,
}: PeekCarouselProps) {
  const scrollRef = useRef<ScrollViewInstance>(null);
  // La carte d'ouverture n'est placée qu'une fois : un rechargement ne ramène pas en arrière.
  const hasPlacedRef = useRef(false);
  const step = itemWidth + gap;

  useImperativeHandle(ref, () => ({
    scrollToIndex: (index) => scrollRef.current?.scrollTo({ x: index * step, animated: true }),
  }));

  function handleSettle(event: NativeSyntheticEvent<NativeScrollEvent>) {
    const index = Math.round(event.nativeEvent.contentOffset.x / step);
    onIndexChange?.(Math.min(Math.max(index, 0), items.length - 1));
  }

  // contentOffset n'existe que sur iOS : on place la carte d'ouverture dès que la rangée a
  // sa largeur, sur les deux plateformes.
  function handleContentSizeChange() {
    if (hasPlacedRef.current) return;
    hasPlacedRef.current = true;
    if (initialIndex > 0) {
      scrollRef.current?.scrollTo({ x: initialIndex * step, animated: false });
    }
  }

  return (
    <ScrollView
      ref={scrollRef}
      horizontal
      showsHorizontalScrollIndicator={false}
      snapToInterval={step}
      decelerationRate="fast"
      disableIntervalMomentum
      onMomentumScrollEnd={handleSettle}
      onContentSizeChange={handleContentSizeChange}
      style={{ marginHorizontal: -edgeInset }}
      contentContainerStyle={[styles.row, { gap, paddingHorizontal: edgeInset }]}
      accessibilityLabel={accessibilityLabel}
    >
      {items.map((item) => (
        <View key={item.key} style={{ width: itemWidth }}>
          {item.content}
        </View>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  // Toutes les cartes à la hauteur de la plus haute : la rangée reste nette.
  row: { alignItems: "stretch" },
});
