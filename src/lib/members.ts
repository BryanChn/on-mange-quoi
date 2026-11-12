// Un membre de groupe, tel que l'app l'affiche. Toutes les requêtes passent par toMembers :
// le nom de secours et l'ordre sont décidés une seule fois, ici.

export type Member = { id: string; name: string; joinedAt: string };

// Forme renvoyée par la jointure group_members(profile_id, joined_at, profiles(display_name)).
export type MemberRow = {
  profile_id: string;
  joined_at: string;
  profiles: { display_name: string } | null;
};

// La jointure est sélectionnée partout avec ce texte : une seule source, pas de faute de frappe.
export const MEMBER_COLUMNS = "group_members(profile_id, joined_at, profiles(display_name))";

// Même ordre que leave_group : le plus ancien d'abord (joined_at), puis l'identifiant pour
// départager. Les uuid en minuscules se comparent comme Postgres les trie.
export function compareByJoinDate(a: Member, b: Member): number {
  return a.joinedAt.localeCompare(b.joinedAt) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
}

// Membres du plus ancien au plus récent. Profil illisible (cas théorique : la RLS montre
// les profils des membres de ses groupes) : « Un membre » plutôt qu'un trou à l'écran.
export function toMembers(rows: MemberRow[]): Member[] {
  return rows
    .map((row) => ({
      id: row.profile_id,
      name: row.profiles?.display_name ?? "Un membre",
      joinedAt: row.joined_at,
    }))
    .sort(compareByJoinDate);
}

// Qui hérite du groupe si leavingId part : le plus ancien des autres membres.
export function pickSuccessor(members: Member[], leavingId: string): Member | null {
  const others = members.filter((member) => member.id !== leavingId).sort(compareByJoinDate);
  return others[0] ?? null;
}
