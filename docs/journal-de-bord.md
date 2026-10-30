# Journal de bord

État du projet au **2026-10-30**, pour reprendre dans une nouvelle session sans rien perdre.
À lire avec `CLAUDE.md` (règles du projet), `docs/schema.md` (base de données) et `docs/backlog.md` (idées hors MVP).

## 1. Où on en est

Ordre de construction (`CLAUDE.md`) :

| Étape | État |
| --- | --- |
| 1. Schéma SQL + RLS, testés | ✅ Terminé |
| 2. Logique de décision en SQL, testée | ✅ Terminé |
| 3. Écrans, testés sur téléphone | 🚧 En cours : connexion terminée, la suite commence au profil |

**Ce qui marche aujourd'hui sur le téléphone :** ouvrir l'app → écran de connexion (charte OMQ, clair et sombre) → email → code à 6 chiffres reçu par email → accueil provisoire « Connecté : email » + déconnexion. La session survit à la fermeture de l'app.

## 2. Ce qui a été fait

| PR | Contenu |
| --- | --- |
| #1 | Socle Expo, `.env` ignoré, `CLAUDE.md` |
| #2 | Règles du vote du MVP (roulette, égalité, clôture) |
| #3 | Schéma (6 tables) et RLS sur toutes les tables |
| #4 | Fonctions SQL : `create_group`, `join_group`, `regenerate_invite_code`, `get_session_result`, `close_session`, `leave_group`, `delete_account` |
| #5 | Client Supabase typé (`src/lib/supabase.ts`), projet Supabase de dev en ligne |
| #6 | Scripts npm (`dev`, `db:*`) |
| #7 | Charte OMQ (tokens, composants `Logo`, `PrimaryButton`, `TextField`), routes protégées |
| #8 | Correctif : l'app s'ouvrait sur l'écran du code (`redirectTo` explicite) |
| #9 | Palette sombre charbon, contour de champ accessible (≥ 3:1), logo nuit recoloré |
| #10 | Prettier comme formateur commun |
| #11 | **Connexion par code (OTP) de bout en bout**, testée sur téléphone |

Base : 7 migrations dans `supabase/migrations/`, 57 scénarios de test dans `supabase/scripts/` (`npm run db:test`).

Hors dépôt, sur le projet Supabase en ligne (fait à la main dans le tableau de bord) :
- code OTP à **6 chiffres** (8 par défaut sur les nouveaux projets) ;
- **SMTP Resend** (`smtp.resend.com:465`, expéditeur `onboarding@resend.dev`), limite 30 emails/heure ;
- modèles « Confirm sign up » et « Magic link or OTP » avec `{{ .Token }}`, dans la charte.

## 3. À faire, dans l'ordre

1. **Écran « Choisis ton nom »** : après la première connexion, créer la ligne `profiles` (`display_name`, 30 caractères max, non vide). Sans profil, la base refuse de créer ou rejoindre un groupe (clé étrangère vers `profiles`). Le layout devra rediriger vers cet écran tant que le profil n'existe pas.
2. **Groupes** : liste de mes groupes, créer un groupe (`create_group`), rejoindre avec un code (`join_group`), partager le code avec la feuille de partage native.
3. **Session de vote** : lancer une session, proposer des plats, cocher / décocher, scores (`get_session_result`).
4. **Temps réel** : votes visibles en direct (Supabase Realtime).
5. **Clôture** : gagnant, ou en cas d'égalité roulette animée ou choix manuel (`close_session`, indice `tie_needs_choice`).
6. **Suppression de compte** dans l'app (exigée par Apple) : `delete_account` existe, il manque l'écran.
7. **Avant d'inviter la famille** : nom de domaine vérifié chez Resend (sans domaine, Resend n'envoie qu'à l'adresse du compte Resend).

Plus tard : icône d'app et écran de démarrage (invisibles dans Expo Go, à faire au premier build), mise à jour Expo 58.0.21 sur une branche dédiée, tests SQL en pgTAP. Idées produit : `docs/backlog.md`.

## 4. À vérifier en début de session

| Vérification | Commande / endroit | Attendu |
| --- | --- | --- |
| Git propre et à jour | `git status`, `gh pr list` | Sur `main`, à jour avec `origin/main`, aucune PR oubliée |
| Types, lint, format | `npx tsc --noEmit`, `npm run lint`, `npm run format:check` | Aucune erreur |
| L'app démarre | `npm run dev`, QR code dans Expo Go | Écran de connexion (ou accueil si déjà connecté) |
| `.env` | `.env` (non commité) | `EXPO_PUBLIC_SUPABASE_URL` = projet en ligne, clé **publishable** (jamais `service_role`) |
| Base locale (seulement pour une migration) | `npm run db:start`, puis `npm run db:test` | Les 4 scripts tournent, chaque ligne « obtenu = attendu » |
| Config auth en ligne | Tableau de bord Supabase → Authentication | OTP 6 chiffres, SMTP Resend actif, modèles avec `{{ .Token }}` |

## 5. Pièges connus

| Piège | Ce qu'il faut savoir |
| --- | --- |
| Sous WSL, le téléphone ne voit pas le PC | Toujours `npm run dev` (tunnel). L'app vise la base **en ligne** : `127.0.0.1` sur le téléphone, c'est le téléphone |
| `Stack.Protected` sans `redirectTo` | Expo Router choisit lui-même l'écran de repli (il prenait `verify`). Toujours un `redirectTo` explicite |
| VS Code supprime les imports inutilisés à l'enregistrement | `organizeImports` : un import pas encore utilisé disparaît. `Ctrl+.` pour le remettre |
| Une migration déjà appliquée ailleurs | Ne jamais la modifier : en créer une nouvelle (`npx supabase migration new …`) |
| Après une migration | `npm run db:reset` + `npm run db:test`, puis `npm run db:types`, puis `npx supabase db push --linked --dry-run` avant `npm run db:push` |
| Local et en ligne divergent | `supabase/config.toml` (local) ≠ réglages du projet en ligne (ex. OTP 6 contre 8). Vérifier les deux |
| Modèles d'email | Non modifiables sur le SMTP intégré de Supabase : il faut un SMTP personnalisé (Resend) |
| Docker « permission denied » | Le groupe `docker` n'est pris en compte qu'à l'ouverture de session : relancer VS Code ou `wsl --shutdown`. Jamais `sudo docker` |
| Garde-fou de Claude Code | Il bloque les commandes destructives (`rm -rf`, suppression de branches distantes, modification de la config Supabase en ligne) : c'est Bryan qui les lance |

## 6. Mode de travail

- **Bryan** écrit la logique des écrans (`TODO(human)`), découpée en petites étapes ; Claude relit comme une PR (indice, puis indice plus fort, puis réponse).
- **SQL** : Bryan décide de la logique, Claude valide ou challenge, puis écrit.
- **Git** : Claude s'occupe des branches, commits, push, PR et du ménage ; il demande avant tout merge (« ok merge » ou approbation sur GitHub).
- **Périmètre strict** : toute idée hors MVP va dans `docs/backlog.md`.

## 7. Notes d'apprentissage

Acquis pendant ces sessions : relations SQL et `ON DELETE`, contraintes, RLS et `security definer`, transactions, migrations ; en React Native : state (`setState` différé, *UI = f(state)*), clauses de garde, fonctions pures, `try / catch / finally`, portée des variables, déstructuration avec renommage, design tokens et contraste WCAG.

Points à consolider : syntaxe JavaScript (une variable entre guillemets devient du texte, `return` sans valeur), adapter un exemple de doc au lieu de le copier, penser aux contraintes de chaque colonne.
