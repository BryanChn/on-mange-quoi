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
  // La carte du groupe affiché : la rangée s'y place à l'ouverture, et s'y recale quand des
  // cartes apparaissent ou disparaissent (un groupe supprimé, quitté ou rejoint).
  index?: number;
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
  index = 0,
  onIndexChange,
  accessibilityLabel,
  ref,
}: PeekCarouselProps) {
  const scrollRef = useRef<ScrollViewInstance>(null);
  const step = itemWidth + gap;

  useImperativeHandle(ref, () => ({
    scrollToIndex: (index) => scrollRef.current?.scrollTo({ x: index * step, animated: true }),
  }));

  function handleSettle(event: NativeSyntheticEvent<NativeScrollEvent>) {
    const index = Math.round(event.nativeEvent.contentOffset.x / step);
    onIndexChange?.(Math.min(Math.max(index, 0), items.length - 1));
  }

  // La largeur du contenu ne change que si le nombre de cartes change (un simple rechargement
  // garde la même rangée). À ce moment-là, et à l'ouverture, on se recale sur la bonne carte :
  // sans ça, un groupe supprimé laissait la rangée sur du vide. contentOffset n'existe que sur
  // iOS, d'où scrollTo, valable sur les deux plateformes.
  function handleContentSizeChange() {
    scrollRef.current?.scrollTo({ x: index * step, animated: false });
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
