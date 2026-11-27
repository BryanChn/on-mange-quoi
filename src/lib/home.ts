import type { Enums } from "./database.types";
import { MEMBER_COLUMNS, toMembers, type Member } from "./members";
import { getUserId, supabase } from "./supabase";
import type { HomeGroup } from "./tonight";

// Un repas à plusieurs en cours (« Bientôt » sur l'accueil).
export type HomeSoiree = {
  id: string;
  name: string;
  // Le jour du repas (AAAA-MM-JJ) ; null pour les repas créés avant « Quand ? ».
  mealDate: string | null;
  step: Enums<"soiree_step">;
  // Commande, resto, chez quelqu'un : l'étiquette de la carte en dépend.
  mode: Enums<"soiree_mode">;
  members: Member[];
};

// groups : les foyers seulement (« Ce soir », « Tes groupes ») ; soirees : à part.
// toBuyByGroup : nombre d'articles à acheter dans la liste de courses de chaque foyer.
// recipesByGroup : nombre de recettes dans le carnet de chaque foyer.
export type Home = {
  userId: string;
  groups: HomeGroup[];
  soirees: HomeSoiree[];
  toBuyByGroup: Map<string, number>;
  recipesByGroup: Map<string, number>;
};

// Tout l'accueil en une requête : les groupes du membre (la RLS filtre), leurs membres,
// et pour chacun sa session la plus récente avec ses plats et ses votes. Une requête par
// groupe (problème « N+1 ») ralentirait l'écran à chaque groupe ajouté.
export async function fetchHome(): Promise<Home> {
  const userId = await getUserId();
  // Les articles à acheter, en parallèle : une requête de plus, mais pas une par groupe.
  const toBuyRequest = supabase
    .from("shopping_items")
    .select("group_id")
    .is("checked_at", null)
    .is("cleared_at", null);
  // Les recettes des carnets (pas celles de base, sans foyer), en parallèle aussi.
  const recipesRequest = supabase.from("recipes").select("group_id").not("group_id", "is", null);
  const { data, error } = await supabase
    .from("groups")
    .select(
      `id, name, kind, soiree_step, soiree_mode, meal_date,
      ${MEMBER_COLUMNS},
      vote_sessions(id, status, created_at, closed_at, moment,
        winner:proposals!vote_sessions_winner_fk(name),
        proposals!proposals_session_id_fkey(name, votes(profile_id)))`,
    )
    .order("created_at", { ascending: true })
    // La plus récente seulement : c'est l'ouverte s'il y en a une (une seule par groupe).
    .order("created_at", { referencedTable: "vote_sessions", ascending: false })
    .limit(1, { referencedTable: "vote_sessions" });

  if (error) throw error;

  const { data: toBuy, error: toBuyError } = await toBuyRequest;
  if (toBuyError) throw toBuyError;
  const toBuyByGroup = new Map<string, number>();
  for (const item of toBuy) {
    toBuyByGroup.set(item.group_id, (toBuyByGroup.get(item.group_id) ?? 0) + 1);
  }

  const { data: recipes, error: recipesError } = await recipesRequest;
  if (recipesError) throw recipesError;
  const recipesByGroup = new Map<string, number>();
  for (const recipe of recipes) {
    if (recipe.group_id === null) continue;
    recipesByGroup.set(recipe.group_id, (recipesByGroup.get(recipe.group_id) ?? 0) + 1);
  }

  const soirees = data.flatMap((group): HomeSoiree[] =>
    group.kind === "soiree" && group.soiree_step
      ? [
          {
            id: group.id,
            name: group.name,
            mealDate: group.meal_date,
            step: group.soiree_step,
            mode: group.soiree_mode ?? "commande",
            members: toMembers(group.group_members),
          },
        ]
      : [],
  );

  const groups = data
    .filter((group) => group.kind === "foyer")
    .map((group): HomeGroup => {
      const members = toMembers(group.group_members);
      const session = group.vote_sessions.at(0);

      if (!session) return { id: group.id, name: group.name, members, latestSession: null };

      if (session.status === "open") {
        const voterIds = new Set(
          session.proposals.flatMap((proposal) => proposal.votes.map((vote) => vote.profile_id)),
        );
        return {
          id: group.id,
          name: group.name,
          members,
          latestSession: {
            id: session.id,
            isOpen: true,
            createdAt: session.created_at,
            proposals: session.proposals.map((proposal) => ({
              name: proposal.name,
              voteCount: proposal.votes.length,
            })),
            voterIds: [...voterIds],
          },
        };
      }

      return {
        id: group.id,
        name: group.name,
        members,
        latestSession: {
          id: session.id,
          isOpen: false,
          // Une session clôturée a toujours une date et un gagnant (contraintes de vote_sessions).
          closedAt: session.closed_at ?? session.created_at,
          // Toujours posé pour un foyer (trigger vote_sessions_set_moment).
          moment: session.moment ?? "soir",
          winnerName: session.winner?.name ?? "",
        },
      };
    });

  return { userId, groups, soirees, toBuyByGroup, recipesByGroup };
}

// Plusieurs membres qui cochent en même temps déclenchent une rafale d'événements : on
// attend ce délai sans nouvel événement avant de recharger, une seule fois.
const RELOAD_DELAY_MS = 300;

// Appelle onChange quand un vote, un plat, une session ou une soirée change dans un groupe du membre
// (la RLS ne laisse passer que ceux-là), regroupés par RELOAD_DELAY_MS. Pas de filtre :
// un DELETE ne transporte que l'id de la ligne, un filtre l'écarterait (limite de
// Supabase Realtime). Renvoie la fonction de désabonnement.
export function subscribeToHome(onChange: () => void): () => void {
  let timer: ReturnType<typeof setTimeout> | undefined;

  function scheduleReload() {
    clearTimeout(timer);
    timer = setTimeout(onChange, RELOAD_DELAY_MS);
  }

  const channel = supabase
    .channel("home")
    .on("postgres_changes", { event: "*", schema: "public", table: "votes" }, scheduleReload)
    .on("postgres_changes", { event: "*", schema: "public", table: "proposals" }, scheduleReload)
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "vote_sessions" },
      scheduleReload,
    )
    // Soirées : quelqu'un arrive, l'étape change.
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "group_members" },
      scheduleReload,
    )
    .on("postgres_changes", { event: "*", schema: "public", table: "groups" }, scheduleReload)
    // Liste de courses : le compteur « 4 à acheter » de l'accueil.
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "shopping_items" },
      scheduleReload,
    )
    // Carnet : le compteur « 5 dans le carnet ».
    .on("postgres_changes", { event: "*", schema: "public", table: "recipes" }, scheduleReload)
    // (Re)connexion confirmée : rattrape ce qui a changé pendant une coupure.
    .subscribe((status) => {
      if (status === "SUBSCRIBED") scheduleReload();
    });

  return () => {
    clearTimeout(timer);
    supabase.removeChannel(channel);
  };
}
