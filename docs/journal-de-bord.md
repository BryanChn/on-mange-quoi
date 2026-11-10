# Journal de bord

État du projet au **2026-11-10**, pour reprendre dans une nouvelle session sans rien perdre.
À lire avec `CLAUDE.md` (règles du projet), `docs/schema.md` (base de données) et `docs/backlog.md` (idées hors MVP).

## Reprendre ici

Session du 2026-11-10 (terminée) : **PR #21 à #26 mergées**, aucune PR ouverte. Le journal du 2026-11-05 disait #21 à #23 mergées alors qu'elles étaient encore ouvertes : toujours vérifier `gh pr list` en début de session.

Tests sur téléphone : clôture, « Retour au groupe » et nom du groupe en titre du vote validés ; carte « Dernier vote » visible sur le groupe. **Bloqués jusqu'au domaine Resend** (impossible de créer un 2e compte, voir point 7) : tout « Mon compte » (annuler, mode avion, suppression avec un **compte de test** : succession et votes effacés) et choix du nom avec un nouveau compte. Logique de suppression testée en local (12 cas sur 12), donc mergée. **Encore à faire avec ton propre compte** : « Voir le résultat » depuis la carte « Dernier vote » ; **vote après clôture** : sur le web, F12 → Network request blocking → motif `*realtime*`, F5 (le temps réel est coupé), clôturer le vote sur le téléphone, puis cocher un plat sur le web → le résultat doit s'afficher, sans erreur réseau. Un bug trouvé = une branche `fix/`.

Prochaine étape : finir les deux tests ci-dessus, puis **décider du nom de domaine** (environ 10 €/an, seul vrai bloquant avant la famille), puis trancher l'ordre : design d'abord, ou domaine + APK d'abord (proposition au point 7).

Fait le 2026-11-10 :
- enquête sur un `500` à la connexion : passerelle (`unexpected_failure`) → service d'auth → **Resend `403`** : en mode test, seule l'adresse **exacte** du compte Resend passe. `bryan.chaine@gmail.com` (point) et `bryanchaine+test1@gmail.com` (alias) sont refusées, même si Gmail les livre dans la même boîte ;
- écran de connexion : `429` → « Attends une minute », sinon « Envoi impossible pour le moment », vraie erreur en `console.warn` si `__DEV__` (PR #24) ;
- nom du groupe en titre de l'écran du vote, lu avec la session ; d'abord avec `navigation.setOptions` dans un `useEffect`, remplacé par `<Stack.Screen options>` (plus d'effet) (PR #25) ;
- flèche de retour absente sur le web après un F5 (pile de navigation vide) : `unstable_settings.initialRouteName = "index"` place l'accueil dessous ; servira aussi aux liens partagés de la V1 (PR #26).

Fait le 2026-11-05 :
- **course corrigée** entre un vote et la clôture (reproduite avant correctif : Curry 2, Pizza 1, gagnant « Pizza imposée par l'organisateur ») : verrou `for share` posé par des triggers, `npm run db:test:race` la rejoue ;
- `vote_sessions` en temps réel ; écran du vote : clôturer, départager l'égalité (tirage ou choix), résultat, **roulette** sur tous les téléphones ;
- droits `insert` / `update` limités aux colonnes écrites par l'app (assignation de masse) ;
- « Mon compte » : déconnexion, suppression du compte avec ses conséquences annoncées ;
- « Retour au groupe » sur le résultat (`router.dismissTo`), écrit par Bryan ;
- `.vscode/settings.json` impose Prettier pour `.ts` et `.tsx` (un réglage utilisateur `[typescriptreact]` reformatait les écrans).

Fiche de révision (points bloquants, exercices) : page Claude « Fiche de révision — On mange quoi ? », https://claude.ai/artifact/2tbQiqNqqRLpXF1NrTCCoG

## 1. Où on en est

Ordre de construction (`CLAUDE.md`) :

| Étape | État |
| --- | --- |
| 1. Schéma SQL + RLS, testés | ✅ Terminé |
| 2. Logique de décision en SQL, testée | ✅ Terminé |
| 3. Écrans, testés sur téléphone | 🚧 En cours : toutes les fonctionnalités du MVP sont codées (connexion, groupes, vote, temps réel, clôture, Mon compte). Restent les tests listés dans « Reprendre ici » |

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
| #19 | Clôture : verrou contre la course vote / clôture, départage de l'égalité, roulette, résultat, dernier vote sur le groupe |
| #20 | Droits par colonne : `insert` / `update` seulement sur les colonnes écrites par l'app (assignation de masse) |
| #21 | « Mon compte » : déconnexion, suppression du compte avec ses conséquences annoncées ; variante `danger` du bouton principal |
| #22 | Bouton « Retour au groupe » sur le résultat (`router.dismissTo`) |
| #23 | Prettier imposé pour `.ts` et `.tsx` dans `.vscode/settings.json` |
| #24 | Messages d'erreur de la connexion selon le statut, vraie erreur journalisée en dev |
| #25 | Nom du groupe dans l'en-tête de l'écran du vote, sans `useEffect` (`<Stack.Screen options>`) |
| #26 | Flèche de retour après une arrivée directe sur un écran (`initialRouteName`) |

Base : 10 migrations dans `supabase/migrations/`, toutes appliquées en ligne, 70 scénarios de test dans `supabase/scripts/` (`npm run db:test`) et la course rejouable (`npm run db:test:race`).

Hors dépôt, sur le projet Supabase en ligne (fait à la main dans le tableau de bord) :
- code OTP à **6 chiffres** (8 par défaut sur les nouveaux projets) ;
- **SMTP Resend** (`smtp.resend.com:465`, expéditeur `onboarding@resend.dev`), limite 30 emails/heure ;
- modèles « Confirm sign up » et « Magic link or OTP » avec `{{ .Token }}`, dans la charte ;
- compte fictif gardé pour les tests : « Testeur » (`00000000-0000-0000-0000-0000000000f1`), owner du groupe `TESTJOIN`. Pour le retirer : supprimer le groupe, puis l'utilisateur dans `auth.users`.

## 3. À faire, dans l'ordre

**Décision de Bryan (2026-11-02) : d'abord toutes les fonctionnalités du MVP, ensuite le design.** Tant qu'elles ne sont pas finies, les écrans restent fonctionnels et simples.

1. ~~**Session de vote**~~ : mergée (PR #17). Les scores viennent de la requête sur `proposals` ; `close_session` reste seul à calculer le gagnant.
2. ~~**Temps réel**~~ : terminé (PR depuis `feat/realtime`).
3. ~~**Clôture**~~ : mergée (PR #19), testée sur téléphone (vote après clôture et « Dernier vote » encore à confirmer). Test d'intégration de `votes.ts` sur la base locale : 20 cas sur 20 (script hors dépôt, à transformer en vrais tests automatisés).
   - ~~**Droits par colonne**~~ : mergé (PR #20). Règle pour toute nouvelle table ou colonne dans `docs/schema.md`.
   - **`npm audit`** : 11 failles (3 hautes : `node-forge`, `zod`), toutes dans l'outillage d'Expo (CLI, Metro, ESLint), pas dans l'app embarquée. `npm audit fix` monte Expo à 58.0.23 : à faire avec la mise à jour d'Expo, sur une branche `chore/` dédiée.
4. ~~**Suppression de compte**~~ : écran « Mon compte » (PR #21), testé en local (12 cas sur 12), à tester sur téléphone. Successeur automatique ; le choix du successeur est dans `docs/backlog.md`.
5. **Design de toute l'app**, une fois le MVP complet (penser au `fontSize: 30` en dur dans l'écran du vote) : liste des groupes (jugée très moche par Bryan), créer et rejoindre un groupe, lancer un vote, écran du vote, résultat. Interface plus moderne ; décider à ce moment-là de la navigation (onglets ou menu latéral, voir `docs/backlog.md`).
6. ~~**Écran de connexion**~~ : PR #24 (`429` → attendre, sinon « Envoi impossible pour le moment », `console.warn` en dev).
7. **Avant d'inviter la famille** : **nom de domaine** (environ 10 €/an, aucun pour l'instant) vérifié chez Resend : sans lui, seule `bryanchaine@gmail.com` reçoit un code, donc personne d'autre ne peut se connecter. Puis **tests reportés** : « Mon compte » et suppression avec un compte de test, choix du nom avec un nouveau compte. Et déconnexion inexpliquée à surveiller (section 5).
   - Proposition du 2026-11-10 (non tranchée) : faire le domaine et l'APK **avant** le design, pour démarrer les trois semaines du feu vert plus tôt et redessiner selon les retours de la famille.
8. **Installer l'app sur les téléphones de la famille** : avec Expo Go et `npm run dev`, l'app ne marche que si le PC tourne, donc le feu vert est impossible à mesurer. Pas d'iPhone dans la famille (2026-11-05) : build EAS en distribution interne, **APK Android** seulement, sans compte Apple Developer. Puis EAS Update pour les correctifs. Icône et écran de démarrage à ce moment-là.
9. **Mesurer le feu vert** : 4 soirs sur 7, trois semaines de suite. Requête : nombre de jours distincts avec une session clôturée (`closed_at`), par semaine, pour le groupe du foyer.

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
| Pas de flèche de retour sur le web | Un rechargement (F5) ou une URL collée repart d'une pile vide. Corrigé par `unstable_settings.initialRouteName = "index"` (PR #26) : après F5 sur un vote, le retour mène à l'accueil, pas au groupe (accepté) |
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
| Tester un cas de course côté app | Couper le temps réel : F12 → Network request blocking → `*realtime*`, puis F5. L'écran ne se met plus à jour en direct |
| `window is not defined` au démarrage web | Avec `web.output: server`, les pages sont rendues dans Node, sans `window` ; l'erreur tue Metro et le tunnel répond « gateway timeout » même au téléphone. On est en `single` |
| `500` sur `/auth/v1/otp` | Resend a refusé l'adresse : en mode test, comparaison **caractère par caractère** avec l'adresse du compte (`bryanchaine@gmail.com`) ; un point ou un `+alias` est refusé. Cause exacte : logs de Resend (ou Supabase → Logs → source **Auth**, pas API Gateway). Les logs Resend contiennent les codes OTP en clair : 2FA sur le compte Resend |
| « No API key found in request » | URL de Supabase ouverte dans un onglet (GET sans en-tête `apikey`) : ce n'est pas la vraie réponse. Lire la requête dans F12 → Network → Response |
| Course entre un vote et la clôture | Une écriture validée par la RLS avant la clôture, mais pas encore commitée, échappait au comptage. Corrigé par un verrou `for share` (triggers) que `close_session` (`for update`) attend. Ne pas retirer ces triggers ; `npm run db:test:race` pour vérifier |
| Trigger et cascades | Les triggers de verrou ne contrôlent que le rôle `authenticated` : la suppression d'un compte ou d'un groupe efface aussi des votes de sessions fermées, et doit passer |
| Formatage parasite des `.tsx` | Un réglage utilisateur propre à un langage (`[typescriptreact]`) passe devant `editor.defaultFormatter` du projet. Corrigé dans `.vscode/settings.json` (PR #23) ; après un changement de réglages : `Developer: Reload Window` |
| « Ça compile » ≠ « ça marche » | `<view>` (balise SVG) passe TypeScript mais plante sur Android ; un import automatique depuis `…/build/….js` est typé `any`. Toujours tester à l'écran et relire les imports ajoutés |
| Garde-fou de Claude Code | Il bloque les commandes destructives (`rm -rf`, suppression de branches distantes, modification de la config Supabase en ligne) : c'est Bryan qui les lance |

## 6. Mode de travail

- **Bryan** écrit la logique des écrans (`TODO(human)`), découpée en petites étapes ; Claude relit comme une PR (indice, puis indice plus fort, puis réponse).
- **SQL** : Bryan décide de la logique, Claude valide ou challenge, puis écrit.
- **Git** : Claude s'occupe des branches, commits, push, PR et du ménage ; il demande avant tout merge (« ok merge » ou approbation sur GitHub).
- **Périmètre strict** : toute idée hors MVP va dans `docs/backlog.md`.

## 7. Notes d'apprentissage

Acquis pendant ces sessions (2026-11-04 : cleanup de `useEffect` et ses deux déclenchements, trois sens de « session », lire une pile d'appels et l'environnement d'exécution, déboguer en comparant ce qui marche et ce qui casse, 502/504 = un intermédiaire qui attend) : relations SQL et `ON DELETE`, contraintes, RLS et `security definer`, transactions, migrations ; en React Native : state (`setState` différé, *UI = f(state)*), clauses de garde, fonctions pures, `try / catch / finally`, portée des variables, déstructuration avec renommage, design tokens et contraste WCAG ; échéance plutôt que compteur pour un délai, `Math.ceil` / `floor` / `max`, cleanup d'un timer, pureté du rendu (pas de `Date.now()`), hooks appelés dans le même ordre ; JWT et `auth.uid()` (le serveur sait qui appelle), IDOR, `.then` / `.finally`, valeur de départ d'un state, feuille de partage native (Intent Android), lire une erreur TypeScript, ne changer qu'une chose à la fois quand on teste. Le 2026-11-03 (review de la PR #17) : `.eq` = `WHERE`, `.single()` / `.maybeSingle()` = forme de la réponse, codes SQLSTATE (`23505`), RLS qui filtre en silence (`count`) contre erreur réseau (`error`), idempotence, `useFocusEffect` dans une pile d'écrans, `useCallback` pour une référence stable, route dynamique `[id]`, mise à jour optimiste vs pessimiste, **l'écran guide, la base protège**, distinguer bug et règle de la spec, vérifier l'état avant de réessayer après une erreur réseau, polling contre WebSocket.

Points à consolider : syntaxe JavaScript (une variable entre guillemets devient du texte, `return` sans valeur), adapter un exemple de doc au lieu de le copier, penser aux contraintes de chaque colonne, écrire un calcul à partir des paramètres plutôt qu'un résultat en dur, `useEffect` (timer, cleanup, tableau de dépendances : Claude l'a écrit, à refaire seul), ne changer l'état de l'écran qu'après confirmation du serveur, conditions de course (`isStale` : savoir dérouler les valeurs ligne par ligne, pas encore acquis au 2026-11-02). Au 2026-11-03 : `true` / `false` et non 1 / 0 en TypeScript, état actuel contre état voulu, un écran resté monté sous un autre n'est pas recréé (donc `useEffect` ne se relance pas), une requête qui n'arrive pas au serveur ne passe jamais par la RLS. Au 2026-11-04 : passer une fonction (`f`) ou l'appeler (`f()`), valeur contre callback (lire la signature `() => void`), `useRef` : la boîte (`ref`) contre son contenu (`ref.current`), syntaxe JavaScript à rendre fluide (exercices de la fiche de révision). `isStale` / « la dernière demande gagne » : écrit par Bryan avec un squelette à trous, à refaire seul.

Le 2026-11-05 (à revoir) : **condition de course** (*race condition*) et verrous de ligne (`for share` / `for update`), reproduire un bug avant de le corriger, trigger `before insert or delete`, `current_user` dans une fonction `security definer` ou non, assignation de masse (*mass assignment*), fonction pure testable (`buildSpin`), « latest ref » (`useRef` pour garder la dernière version d’un callback sans relancer un effet), jointures PostgREST (`!nom_de_fk`, `referencedTable`). Bouton retour écrit par Bryan : pile de navigation (`push` empile, `dismissTo` dépile), routes basées sur les fichiers, passer une fonction fléchée à `onPress`, imports automatiques et `any`, casse en JSX (`View` / `view`), lire une pile d'appels jusqu'au premier fichier à soi, priorité des réglages VS Code. À consolider : adapter un exemple au lieu de le copier (le `pathname` recopié), enregistrer le fichier avant de demander une relecture.

Le 2026-11-10 : une erreur traverse plusieurs couches (app → passerelle → service d'auth → Resend), chacune a ses logs ; remonter jusqu'à celle qui a vraiment échoué. Erreur avalée (*swallowed error*) et message qui ment. `__DEV__`. *Plus addressing* de Gmail. Dette de test : un test reporté se note, avec la condition qui le débloque. `useEffect` : seulement pour se brancher sur un système extérieur à React (abonnement, timer) ; sinon une valeur calculée, un gestionnaire d'événement ou un composant déclaratif (*You Might Not Need an Effect*). Pile de navigation et arrivée directe sur un écran (`initialRouteName`). Formuler une hypothèse et la confirmer par un test rapide avant de corriger.

Mode de travail ajusté le 2026-11-03 : Bryan préfère des recommandations directes et argumentées à une série de questions ; au plus une question de vérification quand un concept est vraiment nouveau.
