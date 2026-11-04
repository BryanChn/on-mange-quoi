# Journal de bord

État du projet au **2026-11-04** (fin de session), pour reprendre dans une nouvelle session sans rien perdre.
À lire avec `CLAUDE.md` (règles du projet), `docs/schema.md` (base de données) et `docs/backlog.md` (idées hors MVP).

## Reprendre ici

Session du 2026-11-04 : **temps réel terminé et testé à deux appareils (téléphone + Expo Web), PR ouverte depuis `feat/realtime`.** Prochaine étape après le merge : la **Clôture** (section 3).

Fait sur `feat/realtime` :
- migration `20261103131953_enable_realtime_votes.sql` testée en local (57 scénarios OK) et **appliquée en ligne** ;
- écran du vote abonné à la session (`subscribeToSession`, cleanup du `useEffect`), écrit par Bryan ;
- correctif : les retraits de plats n'arrivaient pas aux autres appareils (un `DELETE` ne passe pas un filtre, voir section 5) ;
- correctif : réponses de rechargement périmées ignorées (compteur `useRef`, « la dernière demande gagne »), écrit par Bryan ;
- correctif : `web.output` passé de `server` à `single`, le rendu serveur faisait planter Metro (voir section 5).

Fiche de révision (points bloquants, exercices) : page Claude « Fiche de révision — On mange quoi ? », https://claude.ai/artifact/2tbQiqNqqRLpXF1NrTCCoG

La branche distante `feat/vote-session` est à supprimer sur GitHub (bouton « Delete branch » de la PR #17).

## 1. Où on en est

Ordre de construction (`CLAUDE.md`) :

| Étape | État |
| --- | --- |
| 1. Schéma SQL + RLS, testés | ✅ Terminé |
| 2. Logique de décision en SQL, testée | ✅ Terminé |
| 3. Écrans, testés sur téléphone | 🚧 En cours : connexion et choix du nom terminés (7 tests sur 7). Groupes (liste, création, adhésion, partage) terminés. Session de vote (lancer, proposer, voter) terminée. Temps réel terminé (PR depuis `feat/realtime`) |

**Ce qui marche aujourd'hui sur le téléphone (Android, Expo Go) :** ouvrir l'app → écran de connexion (charte OMQ, clair et sombre) → email → code à 6 chiffres reçu par email, avec renvoi possible après 60 s et retour pour changer d'email → à la première connexion, choix du nom → accueil provisoire « Salut … ! » + déconnexion. La session survit à la fermeture de l'app. Profil impossible à charger : écran d'erreur avec « Réessayer ».

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
| #12 | Journal de bord |
| #13 | Écran du code : renvoi avec compte à rebours, « Changer d'email », composant `TextButton` |
| #14 | Clavier : le champ reste visible sur Android (`behavior="padding"`, décalage de l'en-tête) |
| #15 | Écran « Choisis ton nom », chargement du profil et aiguillage du layout ; 5 tests sur 7 passés sur téléphone au merge, les 2 derniers validés le 2026-11-02 |
| #16 | Accueil avec la liste des groupes, créer, rejoindre avec un code, partager, `ErrorScreen` |
| #17 | Session de vote : lancer, proposer, cocher / décocher, retirer son plat ; « Voter » ou « Lancer un vote » sur le groupe. Review : `wantVote`, erreurs du champ séparées des erreurs d'action |
| #18 | Temps réel : votes, ajouts et retraits de plats visibles en direct ; réponses périmées ignorées ; web rendu dans le navigateur (`output: single`) |

Base : 8 migrations appliquées en ligne dans `supabase/migrations/` (la 8e, temps réel, depuis `feat/realtime`), 57 scénarios de test dans `supabase/scripts/` (`npm run db:test`).

Hors dépôt, sur le projet Supabase en ligne (fait à la main dans le tableau de bord) :
- code OTP à **6 chiffres** (8 par défaut sur les nouveaux projets) ;
- **SMTP Resend** (`smtp.resend.com:465`, expéditeur `onboarding@resend.dev`), limite 30 emails/heure ;
- modèles « Confirm sign up » et « Magic link or OTP » avec `{{ .Token }}`, dans la charte ;
- compte fictif gardé pour les tests : « Testeur » (`00000000-0000-0000-0000-0000000000f1`), owner du groupe `TESTJOIN`. Pour le retirer : supprimer le groupe, puis l'utilisateur dans `auth.users`.

## 3. À faire, dans l'ordre

**Décision de Bryan (2026-11-02) : d'abord toutes les fonctionnalités du MVP, ensuite le design.** Tant qu'elles ne sont pas finies, les écrans restent fonctionnels et simples.

1. ~~**Session de vote**~~ : mergée (PR #17). Les scores viennent de la requête sur `proposals` ; `close_session` reste seul à calculer le gagnant.
2. ~~**Temps réel**~~ : terminé (PR depuis `feat/realtime`).
3. **Clôture** : gagnant, ou en cas d'égalité roulette animée ou choix manuel (`close_session`, indice `tie_needs_choice`). Ajouter `vote_sessions` à la publication temps réel (tout le monde voit la clôture). Cas limite à décider : clôturer une session **sans aucune proposition** (ni gagnant ni ex æquo), aujourd'hui non traité explicitement par `close_session`. Ajout de plat dans une session clôturée : message « Vérifie ton réseau » trompeur, à corriger.
4. **Suppression de compte** dans l'app (exigée par Apple) : `delete_account` existe, il manque l'écran.
5. **Design de toute l'app**, une fois le MVP complet (penser au `fontSize: 30` en dur dans l'écran du vote) : liste des groupes (jugée très moche par Bryan), créer et rejoindre un groupe, lancer un vote, écran du vote, résultat. Interface plus moderne ; décider à ce moment-là de la navigation (onglets ou menu latéral, voir `docs/backlog.md`).
6. **Écran de connexion** : journaliser la vraie erreur en dev (`console.warn`) et adapter le message (`429` → « Attends une minute », sinon « Envoi impossible pour le moment ») ; « Réessaie dans un instant » est faux pour un `500`. Exercice pour Bryan.
7. **Avant d'inviter la famille** : nom de domaine vérifié chez Resend (sans domaine, Resend n'envoie qu'à l'adresse du compte Resend) et déconnexion inexpliquée à surveiller (section 5).

Plus tard : icône d'app et écran de démarrage (invisibles dans Expo Go, à faire au premier build), mise à jour Expo 58.0.21 sur une branche dédiée, tests SQL en pgTAP, tests automatisés côté app (aucun aujourd'hui), garde `isStale` dans `createProfile` (cas très improbable), Supabase CLI v3 (version majeure, branche `chore/` dédiée). V1 (page web des invités) : si le rendu serveur revient (`output: server`), ne donner `AsyncStorage` au client Supabase que si `typeof window !== "undefined"`. Idées produit : `docs/backlog.md`.

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
| `KeyboardAvoidingView` sous un en-tête | Il ne compte pas l'en-tête : passer `keyboardVerticalOffset={useHeaderHeight()}`. Sur Android, sans `behavior`, rien ne remonte |
| `profile: null` ne veut pas dire « erreur » | Sans profil = demander le nom ; chargement raté = écran « Réessayer ». Les confondre redemanderait son nom à un membre déjà inscrit |
| VS Code supprime les imports inutilisés à l'enregistrement | `organizeImports` : un import pas encore utilisé disparaît. `Ctrl+.` pour le remettre |
| Une migration déjà appliquée ailleurs | Ne jamais la modifier : en créer une nouvelle (`npx supabase migration new …`) |
| Après une migration | `npm run db:reset` + `npm run db:test`, puis `npm run db:types`, puis `npx supabase db push --linked --dry-run` avant `npm run db:push` |
| Local et en ligne divergent | `supabase/config.toml` (local) ≠ réglages du projet en ligne (ex. OTP 6 contre 8). Vérifier les deux |
| Modèles d'email | Non modifiables sur le SMTP intégré de Supabase : il faut un SMTP personnalisé (Resend) |
| Docker « permission denied » | Le groupe `docker` n'est pris en compte qu'à l'ouverture de session : relancer VS Code ou `wsl --shutdown`. Jamais `sudo docker` |
| Déconnexion inexpliquée (2026-11-02) | Vue une fois en enregistrant un fichier, non reproduite au 2e essai, cause non confirmée. Piste : rechargement pendant la rotation du refresh token. Si ça revient : erreur dans le terminal et Logs → Auth de Supabase (`refresh_token_already_used`). À vérifier avant d'inviter la famille |
| Filtre Realtime et `DELETE` | Un `DELETE` ne transporte que l'id : un filtre (`session_id=eq.…`) l'écarte en silence. Écouter les `DELETE` sans filtre |
| `window is not defined` au démarrage web | Avec `web.output: server`, les pages sont rendues dans Node, sans `window` ; l'erreur tue Metro et le tunnel répond « gateway timeout » même au téléphone. On est en `single` |
| `500` sur `/auth/v1/otp` | Resend a refusé l'adresse (sans domaine vérifié, seule l'adresse du compte Resend reçoit). Cause exacte : Supabase → Logs → Auth. Pour tester à deux appareils : le même compte des deux côtés |
| « No API key found in request » | URL de Supabase ouverte dans un onglet (GET sans en-tête `apikey`) : ce n'est pas la vraie réponse. Lire la requête dans F12 → Network → Response |
| Garde-fou de Claude Code | Il bloque les commandes destructives (`rm -rf`, suppression de branches distantes, modification de la config Supabase en ligne) : c'est Bryan qui les lance |

## 6. Mode de travail

- **Bryan** écrit la logique des écrans (`TODO(human)`), découpée en petites étapes ; Claude relit comme une PR (indice, puis indice plus fort, puis réponse).
- **SQL** : Bryan décide de la logique, Claude valide ou challenge, puis écrit.
- **Git** : Claude s'occupe des branches, commits, push, PR et du ménage ; il demande avant tout merge (« ok merge » ou approbation sur GitHub).
- **Périmètre strict** : toute idée hors MVP va dans `docs/backlog.md`.

## 7. Notes d'apprentissage

Acquis pendant ces sessions (2026-11-04 : cleanup de `useEffect` et ses deux déclenchements, trois sens de « session », lire une pile d'appels et l'environnement d'exécution, déboguer en comparant ce qui marche et ce qui casse, 502/504 = un intermédiaire qui attend) : relations SQL et `ON DELETE`, contraintes, RLS et `security definer`, transactions, migrations ; en React Native : state (`setState` différé, *UI = f(state)*), clauses de garde, fonctions pures, `try / catch / finally`, portée des variables, déstructuration avec renommage, design tokens et contraste WCAG ; échéance plutôt que compteur pour un délai, `Math.ceil` / `floor` / `max`, cleanup d'un timer, pureté du rendu (pas de `Date.now()`), hooks appelés dans le même ordre ; JWT et `auth.uid()` (le serveur sait qui appelle), IDOR, `.then` / `.finally`, valeur de départ d'un state, feuille de partage native (Intent Android), lire une erreur TypeScript, ne changer qu'une chose à la fois quand on teste. Le 2026-11-03 (review de la PR #17) : `.eq` = `WHERE`, `.single()` / `.maybeSingle()` = forme de la réponse, codes SQLSTATE (`23505`), RLS qui filtre en silence (`count`) contre erreur réseau (`error`), idempotence, `useFocusEffect` dans une pile d'écrans, `useCallback` pour une référence stable, route dynamique `[id]`, mise à jour optimiste vs pessimiste, **l'écran guide, la base protège**, distinguer bug et règle de la spec, vérifier l'état avant de réessayer après une erreur réseau, polling contre WebSocket.

Points à consolider : syntaxe JavaScript (une variable entre guillemets devient du texte, `return` sans valeur), adapter un exemple de doc au lieu de le copier, penser aux contraintes de chaque colonne, écrire un calcul à partir des paramètres plutôt qu'un résultat en dur, `useEffect` (timer, cleanup, tableau de dépendances : Claude l'a écrit, à refaire seul), ne changer l'état de l'écran qu'après confirmation du serveur, conditions de course (`isStale` : savoir dérouler les valeurs ligne par ligne, pas encore acquis au 2026-11-02). Au 2026-11-03 : `true` / `false` et non 1 / 0 en TypeScript, état actuel contre état voulu, un écran resté monté sous un autre n'est pas recréé (donc `useEffect` ne se relance pas), une requête qui n'arrive pas au serveur ne passe jamais par la RLS. Au 2026-11-04 : passer une fonction (`f`) ou l'appeler (`f()`), valeur contre callback (lire la signature `() => void`), `useRef` : la boîte (`ref`) contre son contenu (`ref.current`), syntaxe JavaScript à rendre fluide (exercices de la fiche de révision). `isStale` / « la dernière demande gagne » : écrit par Bryan avec un squelette à trous, à refaire seul.

Mode de travail ajusté le 2026-11-03 : Bryan préfère des recommandations directes et argumentées à une série de questions ; au plus une question de vérification quand un concept est vraiment nouveau.
