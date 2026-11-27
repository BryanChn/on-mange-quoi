// Animations de l'app : courbes, durées et réglages partagés. Un écran ne choisit pas ses
// propres valeurs, il pioche ici (comme les couleurs dans theme.ts).
//
// Règles suivies (compétence expo-animation) :
// - transform, opacité et couleurs seulement, sur le thread de l'interface (Reanimated) ;
// - gestes fréquents (cocher, voter) : quasi imperceptible, 150 à 200 ms, sans rebond
//   (un toucher n'a pas d'élan) ; jamais d'ease-in ;
// - « Réduire les animations » du téléphone : les mouvements et zooms disparaissent,
//   les fondus et les couleurs restent (ils expliquent le changement d'état).
import {
  cubicBezier,
  Easing,
  FadeIn,
  FadeOut,
  Keyframe,
  LinearTransition,
  ReduceMotion,
  type CSSTransitionProperties,
} from "react-native-reanimated";

// Ease-out marqué : réagit tout de suite, puis se pose.
const EASE_OUT = Easing.bezier(0.23, 1, 0.32, 1);
// Déplacement à l'écran (un plat qui glisse à sa nouvelle place).
const EASE_IN_OUT = Easing.bezier(0.77, 0, 0.175, 1);
const CSS_EASE_OUT = cubicBezier(0.23, 1, 0.32, 1);

// Couleur de fond et de contour qui change (case, ligne cochée, avatar qui se remplit).
// Transition CSS de Reanimated : à mettre dans le style d'un Animated.View.
export const colorTransition: CSSTransitionProperties = {
  transitionProperty: ["backgroundColor", "borderColor"],
  transitionDuration: 150,
  transitionTimingFunction: CSS_EASE_OUT,
};

// La coche apparaît : légère mise à l'échelle depuis 0,6 (jamais depuis 0), 150 ms.
export const checkEntering = new Keyframe({
  0: { opacity: 0, transform: [{ scale: 0.6 }] },
  100: { opacity: 1, transform: [{ scale: 1 }], easing: EASE_OUT },
})
  .duration(150)
  .reduceMotion(ReduceMotion.System);

// Le nouveau compteur arrive d'un cran plus bas, en fondu : on voit un vote arriver.
export const countEntering = new Keyframe({
  0: { opacity: 0, transform: [{ translateY: 6 }] },
  100: { opacity: 1, transform: [{ translateY: 0 }], easing: EASE_OUT },
})
  .duration(180)
  .reduceMotion(ReduceMotion.System);

// Un plat ajouté ou retiré : fondu (gardé même en mouvements réduits), et les autres
// glissent à leur place au lieu de sauter.
export const dishEntering = FadeIn.duration(200).easing(EASE_OUT).reduceMotion(ReduceMotion.Never);
export const dishExiting = FadeOut.duration(150).easing(EASE_OUT).reduceMotion(ReduceMotion.Never);
export const dishLayout = LinearTransition.duration(200)
  .easing(EASE_IN_OUT)
  .reduceMotion(ReduceMotion.System);

// Liste de courses : un article coché glisse jusqu'à « Déjà pris » comme si on l'y déposait
// (ressort amorti, sans rebond visible : il part vite et se pose en douceur). Plus lent que
// dishLayout parce que le trajet est long (d'une section à l'autre). En mouvements réduits,
// il change de place sans glisser.
export const listReorder = LinearTransition.springify()
  .damping(26)
  .stiffness(200)
  .mass(1)
  .reduceMotion(ReduceMotion.System);

// Le temps de pose avant que les articles cochés glissent : assez pour cocher le suivant
// sans que la liste bouge sous le doigt, assez court pour voir le résultat.
export const LIST_SETTLE_DELAY_MS = 900;
