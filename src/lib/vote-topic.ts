// Ce que décide un vote (migration meal_modes) et les mots pour en parler. Les phrases du vote
// se construisent avec ces formes : « cette entrée », « d'apéro », « la première » restent
// justes quel que soit le sujet. Sans React Native : testé avec node.

export type VoteTopic = "plat" | "resto" | "apero" | "entree" | "dessert";

export type TopicWords = {
  // « Plat », pour une étiquette.
  label: string;
  // « un plat », « une entrée ».
  a: string;
  // « ce plat », « cet apéro », « cette entrée ».
  this: string;
  // « de plat », « d'apéro » (après « pas encore »).
  of: string;
  // « le premier », « la première ».
  first: string;
  // « il », « elle ».
  it: string;
  // « » ou « e » : « ajouté », « ajoutée ».
  agree: string;
  // Exemple grisé du champ.
  example: string;
};

const WORDS: Record<VoteTopic, TopicWords> = {
  plat: {
    label: "Plat",
    a: "un plat",
    this: "ce plat",
    of: "de plat",
    first: "le premier",
    it: "il",
    agree: "",
    example: "Bolognaise",
  },
  resto: {
    label: "Resto",
    a: "un resto",
    this: "ce resto",
    of: "de resto",
    first: "le premier",
    it: "il",
    agree: "",
    example: "Pizza Roma",
  },
  apero: {
    label: "Apéro",
    a: "un apéro",
    this: "cet apéro",
    of: "d’apéro",
    first: "le premier",
    it: "il",
    agree: "",
    example: "Chips et houmous",
  },
  entree: {
    label: "Entrée",
    a: "une entrée",
    this: "cette entrée",
    of: "d’entrée",
    first: "la première",
    it: "elle",
    agree: "e",
    example: "Salade de chèvre chaud",
  },
  dessert: {
    label: "Dessert",
    a: "un dessert",
    this: "ce dessert",
    of: "de dessert",
    first: "le premier",
    it: "il",
    agree: "",
    example: "Tiramisu",
  },
};

export function topicWords(topic: VoteTopic): TopicWords {
  return WORDS[topic];
}

// L'ordre d'un repas : apéro, entrée, plat, dessert (puis resto, seul dans son repas).
export const MENU_TOPICS: VoteTopic[] = ["apero", "entree", "plat", "dessert"];

export function sortByMenuOrder<T extends { topic: VoteTopic }>(items: T[]): T[] {
  const rank = (topic: VoteTopic) => {
    const index = MENU_TOPICS.indexOf(topic);
    return index === -1 ? MENU_TOPICS.length : index;
  };
  return [...items].sort((a, b) => rank(a.topic) - rank(b.topic));
}

export function capitalize(text: string): string {
  return text.charAt(0).toLocaleUpperCase("fr") + text.slice(1);
}
