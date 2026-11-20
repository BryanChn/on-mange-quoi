# Journal de bord

État du projet au **2026-11-20**, pour reprendre dans une nouvelle session sans rien perdre.
À lire avec `CLAUDE.md` (règles du projet), `docs/schema.md` (base de données) et `docs/backlog.md` (idées hors MVP).

## Reprendre ici

### Prochaine conversation : par où commencer

État au 2026-11-20 (fin de journée), à lire avant tout le reste.

- 🟢 **Feu vert** (départ 2026-11-19) : le 19 compte (vote clôturé à 19 h 51 ; ceux du matin et de midi étaient des tests de la roulette). Semaine partielle du 19 au 22 : il faut 4 soirs, donc un vote **clôturé** chaque soir jusqu'à dimanche. ⚠️ **Le rappel unique est en ligne depuis le 2026-11-20 vers 11 h 40** : il peut faire monter la mesure, en tenir compte en lisant les semaines.
- **Livré le 2026-11-20, tout publié par mise à jour EAS (runtime `fc288ef…`, aucun APK)** :
  - #54 : quand tout le monde a voté, « à toi de clôturer ! » / « Camille peut clôturer ».
  - #55 : **vote optimiste** (`useOptimistic`) : la case se coche au toucher, file d'envoi `createSerialQueue` pour garder l'ordre des touchers. Tests : contre-épreuve sans file (état faux), touchers rapides sur la vraie base (CI).
  - #56 et #57 : **design « carte signature »** (maquette validée : https://claude.ai/artifact/PnYH5QfGK8mWswvxy9zo9X). Clair : chat crème sur tomate (icône « inverse ») ; sombre : chat corail sur `chipBg` (icône « nuit »), palette sombre inchangée. Tokens `signature*` dans les deux palettes (le type commun impose le sombre). Le chat : deux SVG fixes avec `expo-image` (pas de `react-native-svg`, qui demanderait un APK). Écran du vote : avatars des votants, le bouton principal suit l'étape (« Proposer » tant qu'on attend, « Clôturer » quand tout le monde a voté). Groupe : code d'invitation dans une ligne, quitter et supprimer en liens discrets.
  - #58 : suivi des mises à jour : bandeau « Téléchargement… » / « Redémarrer » sur l'accueil, version qui tourne dans Mon compte, vérification au retour au premier plan.
  - #59 : « C'est décidé » et « Bon appétit ! » partout, notification comprise (`notify-vote` **redéployée** le 20/11, répond toujours `401` sans secret).
  - #60 : **mises à jour sans intervention** : au retour dans l'app après ≥ 10 min d'absence, si une mise à jour est déjà téléchargée, rechargement immédiat ; sinon vérification et bandeau « Redémarrer ». Jamais de rechargement en arrière-plan (expérimental chez Expo) ni en plein geste. Puis « L'app vient d'être mise à jour », une fois (identifiant annoncé dans AsyncStorage). `useEffectEvent` pour lire « mise à jour téléchargée ? » depuis l'écouteur `AppState`. Modèle : CodePush `ON_NEXT_RESUME`, Google Play « flexible ». **Vérifié sur téléphone** : la mise à jour des avatars s'est appliquée seule (Mon compte : « Mise à jour du 20/11 à 13:46 »).
  - #62 : **animations légères** (`src/lib/motion.ts`) : coche 150 ms, compteur en fondu, plat ajouté ou retiré en fondu (rien au chargement : `LayoutAnimationConfig skipEntering`), avatar qui se remplit. `transform`, opacité et couleurs seulement ; « réduire les animations » garde fondus et couleurs.
  - #64 : **rappel unique** (validé et ajouté au MVP le 2026-11-20, CLAUDE.md point 7) : migration `vote_reminders` (`reminder_sent_at`, `send_vote_reminders(reference_time)`, tâche `pg_cron` `vote-reminders` toutes les 10 min), `notify-vote` événement `reminder` (relit qui n'a ni proposé ni voté, jamais l'organisateur). Fenêtre 1 à 3 h après le lancement, 10 h à 21 h (Paris), une seule fois (marque + appel dans la même transaction). Mis en ligne dans l'ordre : fonction d'abord, migration ensuite (sinon un rappel marqué mais refusé par l'ancienne fonction serait perdu). Vérifié en base : tâche active, `service_role` seul autorisé.
  - #65 et #66 : **avatars prédéfinis** (ajoutés au MVP le 2026-11-20, CLAUDE.md point 8 ; maquette : https://claude.ai/artifact/SPMHDVTEdmRc8syXJU7EFy) : chat, spaghetti, pizza, burger, avocat, ramen ou l'initiale. Migration `profile_avatar` : `profiles.avatar` en liste fermée (`check`), `grant update (avatar)`, RLS sur son propre profil. SVG dans `assets/images/avatars`, identiques en clair et en sombre. Membre attendu : dessin estompé en pointillé. Mis en ligne dans l'ordre : migration d'abord, mise à jour EAS ensuite (sinon l'app lirait une colonne absente). #66 : alignement de la dernière ligne du sélecteur (`flex-start` au lieu de `space-between`).
  - #61, #63 : journal ; réglage des notifications au backlog.
- **Ouvert** : seulement #44 (attend le feu vert). Dernière mise à jour publiée : `6a08ca13` (alignement des avatars).
- **À faire avec Docker Desktop lancé** : `npm run db:types` pour régénérer `src/lib/database.types.ts`, complété **à la main** pour #64 et #65 (Docker arrêté) ; le diff doit être nul. En profiter pour `npm run db:test`. Constat : les scénarios SQL de `supabase/scripts/` ne tournent pas dans la CI (ils affichent « attendu : X », sans échec automatique) ; les nouvelles fonctions SQL sont donc testées en intégration (`tests/integration/`), qui tourne en CI.
- **Études du jour** : design et prise en main (https://claude.ai/artifact/QtnjnomscochHuCVNtPWYM) : haptique oui mais sur 4 moments (cocher, roulette, résultat, refus), `expo-haptics` = APK, à regrouper avec #44 ; « simple à comprendre ? » ne se sait qu'en testant avec 3 à 5 proches, dans un **groupe de test** (jamais « Maison », qui compte dans le feu vert).
- **Retour d'usage du 2026-11-20** : « elle ajoute des plats, aucune notification ». Pas un bug : seuls le lancement et la clôture notifient (vérifié en base : `notify-vote` a envoyé `sent 1` à 8 h 16, reçu confirmé par `push-receipts`). Décision : **pas de notification pour les plats**. Rappel unique : validé puis livré (#64).
- **Autres retours d'usage du 2026-11-20** : pouvoir couper les notifications, pour tous les groupes ou groupe par groupe (au backlog, « avant les stores » ; à avancer si le besoin revient) ; photo de profil perso (avec le prochain APK, `expo-image-picker`) ; faire un **test en temps réel avec plusieurs utilisateurs** (en plus du test avec 3 à 5 proches, déroulé détaillé dans la conversation du 20/11 : test des 5 secondes, 6 tâches, ne pas aider, noter, corriger ce qui bloque au moins 2 personnes).
- **Pièges trouvés le 2026-11-20** :
  - **Décocher après la clôture ne renvoie pas d'erreur** : la politique RLS de suppression filtre `status = 'open'`, le `DELETE` touche 0 ligne et le trigger `lock_session_of_vote` (par ligne) ne se déclenche pas. Le vote reste figé (correct) ; cocher, lui, renvoie `session_closed`. Test d'intégration à jour.
  - **Mise à jour EAS « qui ne passe pas »** : canal, runtime, manifeste et les 58 fichiers vérifiés côté serveur (les fichiers exigent les en-têtes `assetRequestHeaders` du manifeste : un `curl` sans eux reçoit 403, ce n'est pas une panne). Le téléphone a fini par l'appliquer. Depuis #58, Mon compte dit quelle version tourne : regarder là d'abord.
  - Un mail « CI failed » peut viser une branche déjà corrigée : vérifier la branche et l'heure (`gh run list`) avant de s'inquiéter.
- **Contrôle fait** : `push_tickets` vidée par `push-receipts` (ticket du 20/11 8 h 16 traité à 9 h). Reste : la déconnexion supprime-t-elle le jeton de `push_tokens` ?
- **Prochaine étape** :
  1. Ce soir et chaque soir jusqu'à dimanche : un vote **clôturé** (feu vert) ; observer le premier rappel réel (un membre qui ne fait rien pendant 1 h, avant 21 h).
  2. Test avec 3 à 5 proches, puis test en temps réel à plusieurs (groupe « Test », jamais « Maison »).
  3. Captures du README (ancien design visible par les recruteurs), politique de confidentialité (avant les stores).
  4. Après le feu vert : **un seul APK** pour la photo de profil, l'haptique (4 moments) et #44.
  - Décision tranchée : couleurs d'avatar → remplacées par le choix de l'utilisateur (#65).

État au 2026-11-19 (historique).

- ✅ **Test à deux réussi le 2026-11-18** (APK `71c4ac98` sur les deux téléphones) : le lancement d'un vote notifie l'autre membre, toucher la notification ouvre le vote, la clôture envoie « C'est réglé : … » aux deux. Le correctif de #34 est confirmé à deux (l'écran du groupe passe à « Voter » puis à « Dernier vote » sans recharger). Points 3 et 4 de la liste ci-dessous : faits.
- 🟢 **Feu vert démarré : date de départ = 2026-11-19** (lendemain du test). Requête à lancer chaque semaine :
  `select f.* from public.groups g, private.feu_vert(g.id, '2026-11-19') f where g.name = 'Maison' order by f.semaine;`
  Première semaine partielle (jeudi 19 au dimanche 22, 4 soirs possibles) : elle compte si elle atteint 4 soirs, sans casser la série si elle échoue. But : 3 semaines réussies de suite.
- **Encore à contrôler une fois** (non vérifié pendant le test) : `push_tickets` vidée par `push-receipts` dans l'heure, logs des fonctions sans erreur, et déconnexion → le jeton disparaît de `push_tokens`.
- **Fait le 2026-11-19** : README réécrit pour un lecteur extérieur (#42 : architecture, choix techniques, tests, démarche produit ; emplacement des captures prévu en commentaire) ; formatage de 3 fichiers oubliés le 17/11 (#43) ; **CI GitHub Actions** (`.github/workflows/ci.yml` : `tsc`, lint, `format:check`, `npm test` à chaque PR et push sur `main`, vérifiée dans un clone propre).
- ⏸️ **PR #44 en brouillon, à merger seulement après le feu vert** : `npm audit fix` (sans `--force`, qui rétrograderait Expo en 52) + `npx expo install --fix`. 15 → 3 failles (toutes dans l'outillage, aucune dans l'APK ; les 3 restantes, `@expo/fingerprint`, sont acceptées). L'empreinte passe de `fc288ef…` à `5615415…` : **nouvel APK obligatoire**, et après le merge une mise à jour EAS publiée depuis `main` n'atteindrait plus les APK installés. Au merge : rebuild, installation sur les deux téléphones, test des parcours et des notifications.
- **Captures du README** (`docs/captures/`, 2026-11-19) : barre d'état retirée, pseudo de ma compagne effacé (dépôt public). Elles viennent d'un **vote de test clôturé le 19/11 à 7 h 40** : sans incidence si un vrai vote est clôturé le soir même (`feu_vert` compte des jours distincts), sinon retirer ce jour du décompte.
- **Tests d'intégration de `votes.ts`** (`bash tests/integration/run.sh`, Supabase local démarré) : 17 cas sur le vrai code de l'app, la vraie RLS et les vraies fonctions SQL. `tests/integration/register.ts` remplace `src/lib/supabase.ts` (React Native) par un client local et résout les imports sans extension ; les comptes de test sont créés puis supprimés à chaque exécution. Contre-épreuve faite : en cassant `closeSession`, le bon test échoue. Dans la CI depuis le 2026-11-19 : job `integration` (`supabase start` sans les services inutiles, puis `bash tests/integration/run.sh`).
- **Mode de travail depuis le 2026-11-19** : je ne code plus moi-même, je relis et je valide les PR.
- ⚠️ **Piège de l'empreinte (2026-11-19)** : Expo compte les `scripts` de `package.json` dans l'empreinte runtime. Le script `test:db` ajouté par #47 l'avait fait passer de `fc288ef…` à `20fd6ce…` : une mise à jour publiée depuis `main` n'aurait plus atteint les téléphones (rien n'a été publié entre-temps). Corrigé : commande déplacée dans `tests/integration/run.sh`, et la CI compare l'empreinte à `.runtime-fingerprint` (`scripts/check-fingerprint.sh`). Changer l'empreinte devient une décision explicite : mettre à jour ce fichier dans la PR (ex. #44), puis rebuild et réinstaller.
- **Égalité toujours tirée au sort** (retour d'usage du 2026-11-19 : « Choisir moi-même » était vécu comme un passage en force). Migration `20261119120000_tie_always_draw` : `close_session` tire au sort dès qu'il y a égalité et refuse `organisateur` ; même signature, donc les APK installés ne cassent pas. App : plus d'écran « Comment départager ? », la confirmation annonce la roulette. **En ligne et testé le 2026-11-19** (#50) : `db:push` (vérifié en base : nouvelle `close_session`), puis mise à jour EAS `c8a56c8d` sur `preview` (runtime `fc288ef…`). Testé sur téléphone : la roulette se lance d'elle-même à la clôture d'une égalité. Rappel : la mise à jour est téléchargée au lancement et appliquée au lancement suivant (fermer complètement l'app, puis rouvrir).
- **Tests d'intégration des groupes et du compte** (2026-11-19) : `groups.test.ts` (14 cas : rejoindre, code invalide, non-membre, aperçu du départ, quitter en membre / owner / seul, suppression owner seulement avec cascade) et `account.test.ts` (4 cas : aperçu, transfert de couronne, groupe solo supprimé, déconnexion, plats sans vote retirés, plats votés gardés sans auteur, vote organisé clôturable par l'owner, gagnant d'un vote clos conservé). 34 cas au total, contre-épreuve faite. Ces parcours n'avaient jamais été testés avec de vrais comptes.
- **Étude : comment les apps de vote de groupe terminent un vote** (2026-11-19), page https://claude.ai/artifact/LkjdG2ASZgWi3EkFYtxXud. Quatre familles : clôture manuelle (Doodle, Discord, Polly), échéance fixée au départ (WhatsApp, Telegram, Discord : le standard), fin quand tout le monde a voté (JustPick, seulement avec un vote par personne et une liste figée), accord unanime façon swipe (Where2Eat, Unforkd). Aucune app ne ferme seule un vote à choix multiples et propositions ouvertes : la piste « J'ai fini » est bien écartée. Notre roulette en cas d'égalité est aussi celle de Dinner Winner et Sorted. Peu d'avis utilisateurs exploitables (apps récentes).
  Recommandation : (1) MVP : afficher la participation et mettre « Clôturer » en avant, sans notification ni remise à zéro. **Vérifié dans le code le 2026-11-20 : c'était déjà fait** (« 2 sur 3 ont voté · Léa n'a pas encore voté » sur le vote et l'accueil, « Clôturer » en bouton principal dès le premier plat ; l'étude avait été rédigée sans relire l'écran). Seul manque traité dans #54 : quand tout le monde a voté, dire qui peut clôturer ; (2) V1 : heure limite optionnelle au lancement, clôture par `pg_cron` (version privée de `close_session`, qui exige aujourd'hui un utilisateur connecté) ; (3) écartés : clôture auto quand tous ont voté, « J'ai fini », swipe.
- **Prochaine étape** : utiliser l'app chaque soir et noter les retours d'usage ; pendant ce temps, les petites tâches (point 7) et la politique de confidentialité (point 5). On ne passe pas à la V1 avant le feu vert.

Historique du 2026-11-18 (après-midi) :

- **#39 mergée, build `71c4ac98` réussi** (commit `814f57c`, empreinte `fc288ef…` = celle du PC : le `.fingerprintignore` marche aussi sur EAS). APK : https://expo.dev/artifacts/eas/mmDEOA-J3nmH5yvQOi4dbfdKh7Lw77ZvrafhqugnRSY.apk. **Installé sur mon téléphone**, pas encore sur celui de ma compagne : le test des notifications à deux (point 3 ci-dessous) attend ça.
- **Mesure du feu vert en ligne** (#40 mergée, `db:push` fait le 2026-11-18, vérifiée en lecture) : `private.feu_vert(groupe, date_de_départ)`, une ligne par semaine (`soirs`, `reussie`), semaines vides à 0. Testée en local (7 cas, tous les autres tests verts). Le groupe du foyer s'appelle **« Maison »** (pas « Famille »). Dans l'éditeur SQL du tableau de bord :
  `select f.* from public.groups g, private.feu_vert(g.id, '<date de départ>') f where g.name = 'Maison' order by f.semaine;`
  La série de 3 semaines se lit à l'œil. Les 14 votes clôturés actuels sont surtout des tests : **date de départ = le lendemain du test des notifications à deux**.
- ~~Prochaine étape : installer l'APK sur le téléphone de ma compagne, faire le test à deux, puis fixer la date de départ.~~ Fait (voir plus haut).
- Idées du 2026-11-18 mises au backlog : clôture quand tout le monde a voté (V1), récompenses d'usage (après le feu vert : les afficher fausserait la mesure).
- Pour relancer un build plus tard, la marche à suivre :
  - `npx --yes eas-cli build:list --limit 3 --non-interactive` : aucun build `in queue` ou `in progress`, sinon ne pas en relancer un.
  - `npx --yes eas-cli build -p android --profile preview --non-interactive --no-wait` : la commande rend la main et donne le lien du build.
  - Suivre avec `npx --yes eas-cli build:view <id>` (`Status` : `in queue` → `in progress` → `finished` ou `errored`). Sur le plan gratuit, l'attente en file peut dépasser 4 h.
  - Si `errored` : `build:view <id> --json` donne `error.message` et `logFiles` ; le log se télécharge avec `curl --compressed` (NDJSON, une phase par ligne).
  - `finished` : `Application Archive URL` = lien de l'APK à installer sur les deux téléphones.
- **Serveur des notifications : en ligne et vérifié**, rien à refaire (détail plus bas, « Mise en ligne du 2026-11-17 »). Projet Supabase `usgynyrhkbipekqrlkgv`, fonctions `https://usgynyrhkbipekqrlkgv.supabase.co/functions/v1/notify-vote` et `/push-receipts`. Le secret n'est écrit nulle part : pour le changer, en régénérer un et mettre à jour **les deux côtés** (`supabase secrets set EDGE_FUNCTIONS_SECRET=…` et `vault.update_secret` sur `edge_functions_secret`).
- **Firebase** : projet `on-mange-quoi-5dd2a` (compte `omq.app@gmail.com`, plan Spark). **EAS** : clé FCM V1 dans Credentials (ne pas toucher au keystore), variable `GOOGLE_SERVICES_JSON` (File, Secret, preview).
- **Doc de review des notifications** (flux, code commenté, critique, questions) : https://claude.ai/artifact/9CpD3KvFxSG7ZStGkQx4fU
- **Façon de travailler retenue le 2026-11-17** : ce qu'une review relève se corrige avant le merge, avec un regard de maintenance à long terme ; les vraies nouvelles fonctionnalités vont au backlog (périmètre strict du MVP).


Session du 2026-11-17 (suite le 2026-11-18) : **#35 à #38 mergées**. **Le serveur des notifications est en ligne et vérifié** ; le nouvel APK a **échoué** au build (empreinte différente entre le PC et EAS), corrigé par `.fingerprintignore` sur `fix/empreinte-build-eas`. Toujours vérifier `gh pr list` **et `eas build:list`** en début de session.

**À faire en premier, dans l'ordre :**
1. **Merger la PR de `fix/empreinte-build-eas`** (`.fingerprintignore` + ce journal), puis **relancer le build** depuis `main` : `npx --yes eas-cli build:list` (aucun build en cours), puis `npx --yes eas-cli build -p android --profile preview`. EAS envoie le projet depuis Git : un fichier non commité ne part pas au build.
2. **Installer le nouvel APK sur les deux téléphones** (par-dessus, comptes gardés). Obligatoire : `expo-notifications` et Firebase sont natifs, l'APK `0337cc07` ne peut pas les recevoir par EAS Update. Vérifier la petite icône (chat) dans la barre d'état.
3. **Test à deux** : accepter la permission au lancement ; A lance un vote → B est notifié (app ouverte, en arrière-plan, fermée, téléphone verrouillé) ; toucher la notification ouvre le vote ; clôture → les deux reçoivent « C'est réglé : … ». Contrôler `push_tokens` (deux lignes), `push_tickets` (vidée par `push-receipts` dans l'heure) et les logs des fonctions (tableau de bord → Edge Functions → Logs). Déconnexion → le jeton disparaît de la table.
4. **Tester le correctif de #34 à deux** (reporté : un seul téléphone le 2026-11-17) : A reste sur l'écran du groupe, B lance un vote → A passe à « Voter » ; B clôture → A voit « Dernier vote ».
5. Politique de confidentialité : mentionner les notifications (avant les stores).
6. 🟢 **Démarrer le feu vert** une fois les notifications installées. Règles tranchées le 2026-11-13 : un soir compte si un vote est **clôturé** ce jour-là dans le groupe du foyer ; jour en `Europe/Paris` ; semaine du lundi au dimanche ; votes de test exclus ; on commence le jour même, et la première semaine (partielle) compte si elle atteint 4 soirs, sans casser la série si elle échoue. Requête écrite et en ligne : `private.feu_vert` (voir plus haut). Le feu vert est **ma mesure**, pas un écran de l'app (l'écran « Cette semaine » reste hors MVP).
7. Petites tâches : retours d'usage notés au fil des soirs ; ~~`npm audit` avec la montée d'Expo~~ (PR #44, après le feu vert) ; captures d'écran pour le README ; revoir le design en mode clair ; tests reportés (« Mon compte » et suppression avec un compte de test, choix du nom avec un nouveau compte, vote après clôture avec le temps réel coupé).

Mise en ligne du 2026-11-17 (après le merge de #38) :
- `db:push` : `notify_vote_sessions` et `push_receipts` appliquées en ligne.
- Fonctions `notify-vote` et `push-receipts` déployées ; sans secret, elles répondent `401` (notre code, pas la passerelle : `verify_jwt = false` bien pris en compte).
- `EDGE_FUNCTIONS_SECRET` (fonctions) et Vault (`edge_functions_url`, `edge_functions_secret`, par `supabase db query --linked`) : secret généré dans une variable du terminal, jamais affiché ni écrit dans le dépôt. `supabase secrets list` montre une empreinte SHA-256, pas la valeur. Tâche `pg_cron` `push-receipts` planifiée (`*/30 * * * *`).
- **Chaîne vérifiée en ligne** : la base a appelé `push-receipts` via `call_edge_function` avec le secret de Vault → `200`. Les deux secrets correspondent.
- Tant que l'ancien APK est installé, aucun jeton n'est enregistré : la fonction tourne mais n'envoie rien, le vote marche comme avant.

**Build `aab14636` échoué** (commit `659ba50`, plus de 4 h en file d'attente sur le plan gratuit, échec à 21 h 20) à l'étape « Configure expo-updates » : `Runtime version mismatch` (PC `fc288ef…`, EAS `73da2f7…`). Cause : `app.config.ts` déclare `googleServicesFile` ; sur EAS, la variable File `GOOGLE_SERVICES_JSON` existe (`../eas-environment-secrets/…`) et le fichier entre dans l'empreinte, alors qu'il est absent du PC (variable Secret, jamais envoyée en local). Le garde-fou de la politique `fingerprint` a arrêté le build au lieu de livrer un APK incompatible avec les mises à jour. Correctif : `.fingerprintignore` avec `**/eas-environment-secrets/**`. Vérifié en simulant le dossier d'EAS à côté du projet : sans ignore → `bc0e029…` (le problème est reproduit) ; avec → `fc288ef…`, comme le PC. Le motif `**/` couvre aussi le chemin en `../`. Le second écart du diff (dossier `android` généré au build) a un `hash` nul et ne compte pas.

Fait le 2026-11-17 :
- **Firebase** : projet `on-mange-quoi-5dd2a` (plan Spark, sans Analytics), app Android `com.bryanchn.onmangequoi`. **EAS** : clé FCM V1 dans Credentials, `GOOGLE_SERVICES_JSON` (File, Secret, preview). Fichiers supprimés du PC, ignorés par Git.
- **#37** testée (13 cas), regex du jeton élargie à `ExpoPushToken[…]` (second préfixe accepté par `expo-server-sdk`), types régénérés, mergée et poussée en ligne.
- **App** (PR #38) : `expo-notifications`, `app.config.ts` qui lit `GOOGLE_SERVICES_JSON` ; permission demandée une fois le profil chargé (pas si `canAskAgain` est faux) ; jeton ré-enregistré à chaque lancement ; `signOut()` unique qui supprime le jeton **avant** la déconnexion et déconnecte même si la suppression échoue ; toucher une notification ouvre `/session/[id]` (identifiant validé avant de naviguer).
- **Serveur** (PR #38) : trigger `notify_vote_session` (`INSERT`, et `UPDATE` open → closed) → `pg_net` → Edge Function `notify-vote` (secret partagé en en-tête, comparé en temps constant ; relit la session avec la clé `service_role` ; lancement aux autres membres, résultat à tous ; jetons `DeviceNotRegistered` supprimés). URL et secret dans Vault : sans eux, le trigger ne fait rien.
- **Après la review** (même PR) : reçus d'Expo suivis (`push_tickets` + `push-receipts` toutes les 30 min par `pg_cron`) ; erreurs renvoyées en `internal_error`, détail dans les logs ; code commun des fonctions dans `_shared` (`call_edge_function` et une seule paire de secrets Vault pour toutes les fonctions internes) ; icône de notification dédiée (96 px, le chat occupait 47 % de l'ancienne image) ; une notification touchée hors connexion est effacée au lieu d'ouvrir le vote à la reconnexion. Backlog : réglage des notifications par groupe, permission expliquée avant la fenêtre d'Android, limite d'envoi.
- Tests : 31 tests `node --test` (messages, tickets, reçus, lien de notification), `test-notify-vote.sql` (9 cas), et la chaîne complète en local avec `supabase functions serve` et de faux jetons : lancement `sent 1` (organisateur exclu), clôture `sent 2`, faux jetons supprimés, lancement déjà clôturé ignoré (`stale_event`) ; `push-receipts` purge un ticket de 25 h, interroge celui de 20 min, laisse le récent.

À consolider (2026-11-17) : l'empreinte runtime ne voit que ce qui existe là où elle est calculée (une variable Secret n'existe que sur EAS) ; pourquoi un cas témoin rend un test concluant ; pourquoi un trigger + `pg_net` plutôt qu'un appel depuis l'app (le serveur décide, la requête ne part qu'après `commit`) ; pourquoi l'Edge Function relit tout en base au lieu de croire le corps reçu ; comparaison en temps constant (attaque temporelle) ; tickets et reçus d'Expo, `pg_cron` ; config dynamique `app.config.ts` ; la priorité des opérateurs `||` et `->>` en SQL (piège rencontré dans les tests).

Session du 2026-11-13 (terminée, à distance depuis le téléphone) : **PR #34 mergée** (bug du libellé), **première mise à jour EAS Update publiée** (commit `d3f8a5a`, empreinte `6a8d16cd…`). **Notifications push entrées dans le MVP** (lancement + résultat d'un vote). #35, #36 et #37 ouvertes à la fin, mergées le 2026-11-17.

Fait le 2026-11-13 :
- **Bug « Lancer un vote » alors qu'un vote est ouvert** (PR #34) : l'écran du groupe ne se chargeait qu'au focus. Abonnement Realtime `subscribeToGroupSessions` (`INSERT` et `UPDATE` de `vote_sessions` filtrés sur `group_id`) ; `loadGroup` passe à « la dernière demande gagne » (`latestRequestRef`), l'ancien `isStale` par appel ne protégeant qu'au départ de l'écran. Libellé gardé : « Voter », comme sur l'accueil. Non reproduit sur deux téléphones avant le correctif (cause trouvée en lisant le code) : le test du point 2 le confirmera.
- Build en double (`060adca5`, même commit que `0337cc07`) lancé puis annulé, faute d'avoir listé les builds.
- `npm run update` échouait (`eas: Permission denied`, pas d'`eas-cli` dans le projet) : le script passe par `npx --yes eas-cli@latest`.
- **Notifications push dans le MVP** (PR #36) : au lancement d'un vote (les autres membres) et au résultat (tout le groupe). Raison : ma compagne travaille tard et ne savait pas qu'un vote était ouvert.
- **Table `push_tokens`** (PR #37, brouillon, non testée) : clé = jeton (plusieurs téléphones par membre), RLS lecture et suppression de ses jetons seulement, `register_push_token` en `security definer` (téléphone partagé), cascade à la suppression du compte.

À consolider (2026-11-13) : « la dernière demande gagne » avec `useRef` (pourquoi un `isStale` par appel ne suffit plus dès que le temps réel relance des chargements) : à refaire seul. Empreinte runtime : savoir prédire si un changement atteindra les APK installés. Supprimer le jeton **avant** `signOut()` : après, `auth.uid()` est nul et la RLS refuse en silence (la conséquence était trouvée, pas la cause). `security definer` pour franchir une règle de façon contrôlée.

Session du 2026-11-12 (terminée) : **PR #27 à #31 mergées**, aucune PR ouverte à la fin hormis celle de ce journal. Toujours vérifier `gh pr list` en début de session.

**Fin de session (vers 18 h 30) : l'app tourne à deux.** APK avec EAS Update installé sur mon Xiaomi et sur le téléphone de ma compagne ; elle a reçu son code (SMTP Gmail), créé son compte, rejoint notre groupe, et les votes passent en direct.

Sa liste « À faire en premier » est reprise et mise à jour dans la session du 2026-11-13 ci-dessus.

Fait le 2026-11-12 :
- **APK Android** (PR #28) : EAS Build, profil `preview`, identifiant `com.bryanchn.onmangequoi`, variables Supabase dans l'environnement EAS `preview` (le `.env` n'est pas envoyé au build), keystore gardé par EAS. Vérifié sur téléphone sans le PC.
- **Quitter / supprimer un groupe** (PR #29) : entré dans le MVP. Testé sur téléphone, sauf la transmission de la couronne (pas de 2e compte), couverte par les tests SQL (14 sur 14). `deleteGroup` traite « 0 ligne supprimée » comme un échec (RLS qui filtre sans erreur).
- **Refonte design** (PR #30, maquette https://claude.ai/artifact/YKPtzb7kcq25hqW4Uv16h8) : tokens (boutons en tomate foncée pour le contraste), composants `Card`, `Chip`, `Avatar`, `ListCard` / `ListRow`, accueil avec la carte « Ce soir » et le temps réel, vote, résultat, groupe, profil avec « Changer mon nom ». Écrite par Claude à ma demande, revue sur téléphone en **mode sombre** (deux passes de retours), revue du code avec un doc récap : https://claude.ai/artifact/FT2iBmXVv1GhuwSRnGiFaZ. **Pas encore vue en mode clair.**
- Après la revue du code : un seul module `src/lib/members.ts` (il y avait deux types `Member` et quatre copies de la mise en forme), `getUserId` dans `supabase.ts`, rechargements du temps réel regroupés (300 ms), types Node réservés aux tests (`tsconfig.test.json`).
- **Premiers tests automatisés de l'app** : `npm test` (16 cas, `node --test`).
- **EAS Update** (PR #31) : canal `preview`, politique runtime `fingerprint` (une mise à jour incompatible n'atteint pas les anciens APK au lieu de les faire planter), `npm run update`. APK `eef848d8` installé sur les deux téléphones. Première mise à jour de bout en bout **pas encore testée**.
- **Envoi des codes : SMTP Gmail** à la place de Resend (compte dédié `omq.app@gmail.com`, validation en deux étapes, mot de passe d'application dans Supabase uniquement). Testé : code reçu sur mon adresse (SPF et DKIM signés par gmail.com, boîte principale) et sur celle de ma compagne.
- **Icône et écran de démarrage** (PR #33, ouverte) : chat OMQ, icône adaptative dans la zone garantie d'Android, monochrome, écran de démarrage clair et sombre. Images du modèle Expo supprimées. Demande un nouvel APK.

Reportés le 2026-11-12 : barre d'onglets, « Cette semaine », squelettes de chargement, bandeau hors ligne, photo de profil (backlog), annuler un vote ouvert et vide (question posée, non tranchée), bouton rouge pâle en mode sombre (jugé correct pour l'instant). Retour design prévu plus tard. Test toujours reporté : vote après clôture avec le temps réel coupé (voir 2026-11-10).

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
| 3. Écrans, testés sur téléphone | ✅ Fonctionnalités et design du MVP terminés (connexion, groupes, quitter / supprimer, vote, temps réel, clôture, profil). Restent : mode clair à revoir, tests à deux comptes, puis le feu vert |

**Ce qui marche aujourd'hui sur le téléphone (APK Android, sans le PC) :** connexion par code à 6 chiffres (seule mon adresse le reçoit tant que le SMTP Gmail n'est pas en place), choix du nom, accueil avec la carte « Ce soir » (vote en cours, plat décidé, rien de prévu) mise à jour en direct, groupes (créer, rejoindre, inviter, quitter, supprimer), vote (proposer, cocher, retirer, clôturer, égalité et roulette), résultat, profil (changer de nom, déconnexion, suppression du compte).

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
| #27 | Journal du 2026-11-10 |
| #28 | APK Android avec EAS Build (profil `preview`, variables dans l'environnement EAS) |
| #29 | Quitter un groupe (couronne au plus ancien) ; l'owner peut le supprimer pour tous |
| #30 | Refonte design : tokens, composants partagés, accueil « Ce soir », vote, résultat, groupe, profil ; `members.ts` ; premiers tests de l'app (`npm test`) |
| #31 | EAS Update : canal `preview`, runtime `fingerprint`, `npm run update` |
| #32 | Journal du 2026-11-12 |
| #33 | Icône OMQ (adaptative, monochrome) et écran de démarrage clair et sombre |
| #34 | Écran du groupe : votes lancés ou clôturés suivis en direct (Realtime), « la dernière demande gagne » |

Base : 10 migrations dans `supabase/migrations/`, toutes appliquées en ligne, 70 scénarios de test dans `supabase/scripts/` (`npm run db:test`) et la course rejouable (`npm run db:test:race`).

Hors dépôt, sur le projet Supabase en ligne (fait à la main dans le tableau de bord) :
- code OTP à **6 chiffres** (8 par défaut sur les nouveaux projets) ;
- **SMTP Gmail** depuis le 2026-11-12 (`smtp.gmail.com:465`, compte `omq.app@gmail.com`, mot de passe d'application ; validation en deux étapes sur le compte). Avant : Resend, qui n'envoyait qu'à mon adresse faute de domaine. Avant les stores : vrai domaine et service d'envoi transactionnel ;
- modèles « Confirm sign up » et « Magic link or OTP » avec `{{ .Token }}`, dans la charte ;
- **EAS** (projet `@bryanchns-team/on-mange-quoi`) : variables `EXPO_PUBLIC_SUPABASE_URL` (en clair) et `EXPO_PUBLIC_SUPABASE_ANON_KEY` (sensible) dans l'environnement `preview` ; keystore Android ; canal et branche EAS Update `preview` ;
- compte fictif gardé pour les tests : « Testeur » (`00000000-0000-0000-0000-0000000000f1`), owner du groupe `TESTJOIN`. Pour le retirer : supprimer le groupe, puis l'utilisateur dans `auth.users`.

## 3. À faire, dans l'ordre

**Décision de Bryan (2026-11-02) : d'abord toutes les fonctionnalités du MVP, ensuite le design.** Tant qu'elles ne sont pas finies, les écrans restent fonctionnels et simples.

1. ~~**Session de vote**~~ : mergée (PR #17). Les scores viennent de la requête sur `proposals` ; `close_session` reste seul à calculer le gagnant.
2. ~~**Temps réel**~~ : terminé (PR depuis `feat/realtime`).
3. ~~**Clôture**~~ : mergée (PR #19), testée sur téléphone (vote après clôture et « Dernier vote » encore à confirmer). Test d'intégration de `votes.ts` sur la base locale : 20 cas sur 20 (script hors dépôt, à transformer en vrais tests automatisés).
   - ~~**Droits par colonne**~~ : mergé (PR #20). Règle pour toute nouvelle table ou colonne dans `docs/schema.md`.
   - **`npm audit`** : 11 failles (3 hautes : `node-forge`, `zod`), toutes dans l'outillage d'Expo (CLI, Metro, ESLint), pas dans l'app embarquée. `npm audit fix` monte Expo à 58.0.23 : à faire avec la mise à jour d'Expo, sur une branche `chore/` dédiée.
4. ~~**Suppression de compte**~~ : écran « Mon compte » (PR #21), testé en local (12 cas sur 12), à tester sur téléphone. Successeur automatique ; le choix du successeur est dans `docs/backlog.md`.
4 bis. ~~**Quitter / supprimer un groupe**~~ : mergé (PR #29). Décision de Bryan (2026-11-12) : indispensable, sans lui on reste coincé dans un groupe de test. Quitter : `leave_group` (couronne au membre le plus ancien, groupe supprimé si on est seul). Supprimer pour tous : owner seulement, politique RLS existante, cascade vérifiée en local, votes de sessions fermées compris (cas 12 à 14 de `test-leave-and-delete.sql`, 14 sur 14). Notification des membres : backlog.
5. ~~**Design de toute l'app**~~ : mergé (PR #30). Reste à revoir en **mode clair** ; retour design prévu plus tard. Navigation : pas d'onglets pour l'instant (l'avatar ouvre le profil), à reprendre en V1 avec l'onglet « Cuisine ».
6. ~~**Écran de connexion**~~ : PR #24 (`429` → attendre, sinon « Envoi impossible pour le moment », `console.warn` en dev).
7. ~~**Avant d'inviter la famille** : envoi des codes à d'autres adresses~~ : **SMTP Gmail** en place le 2026-11-12 (compte dédié `omq.app@gmail.com`, mot de passe d'application), testé avec deux adresses. Le **nom de domaine** reste nécessaire avant les stores (expéditeur crédible, volume). Puis **tests reportés** : « Mon compte » et suppression avec un compte de test, choix du nom avec un nouveau compte. Et déconnexion inexpliquée à surveiller (section 5).
8. **Installer l'app sur les téléphones de la famille** : fait sur deux téléphones le 2026-11-12 (APK `eef848d8`, avec EAS Update). Reste : APK avec l'icône (PR #33).
9. **Mesurer le feu vert** : 4 soirs sur 7, trois semaines de suite. Requête : nombre de jours distincts avec une session clôturée (`closed_at`), par semaine, pour le groupe du foyer.

Plus tard : icône d'app et écran de démarrage (invisibles dans Expo Go, à faire au premier build), mise à jour Expo 58.0.21 sur une branche dédiée, tests SQL en pgTAP, tests des écrans (vote, groupes et compte sont couverts par `bash tests/integration/run.sh` ; l'accueil et le profil restent à faire), garde `isStale` dans `saveDisplayName` (cas très improbable), Supabase CLI v3 (version majeure, branche `chore/` dédiée). V1 (page web des invités) : si le rendu serveur revient (`output: server`), ne donner `AsyncStorage` au client Supabase que si `typeof window !== "undefined"`. Idées produit : `docs/backlog.md`.

## 4. À vérifier en début de session

| Vérification | Commande / endroit | Attendu |
| --- | --- | --- |
| Git propre et à jour | `git status`, `gh pr list` | Sur `main`, à jour avec `origin/main`, aucune PR oubliée |
| Types, lint, format, tests | `npx tsc --noEmit`, `npm run lint`, `npm run format:check`, `npm test` | Aucune erreur |
| L'app démarre | `npm run dev`, QR code dans Expo Go | Écran de connexion (ou accueil si déjà connecté) |
| `.env` | `.env` (non commité) | `EXPO_PUBLIC_SUPABASE_URL` = projet en ligne, clé **publishable** (jamais `service_role`) |
| Base locale (seulement pour une migration) | `npm run db:start`, puis `npm run db:test` | Les 4 scripts tournent, chaque ligne « obtenu = attendu » |
| Config auth en ligne | Tableau de bord Supabase → Authentication | OTP 6 chiffres, SMTP Gmail actif, modèles avec `{{ .Token }}` |

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
| « App not installed » sur Xiaomi | L'analyse de sécurité de Xiaomi bloque les APK hors store et **cache** le lien « Installer quand même » (petit, en bas). Ouvrir l'APK depuis l'app Fichiers. Ailleurs, Play Protect : « Plus de détails » → « Installer quand même ». Fichier APK sain vérifié (103,7 Mo) : le problème vient du téléphone |
| Expéditeur des emails | Dans Supabase → SMTP, « Sender email » doit être **la même adresse** que le compte Gmail (sinon refus ou spam). Le mot de passe d'application s'affiche en 4 blocs : le saisir **sans les espaces** |
| File d'attente gratuite d'EAS | Environ 40 min d'attente, et **un seul build à la fois** (« waiting for concurrency ») : annuler un build devenu inutile (`npx eas-cli@latest build:cancel <id>`) libère la place. Après l'upload, le PC peut s'éteindre |
| EAS Update : JavaScript ou natif ? | `npm run update -- --message "…"` publie le JavaScript (écrans, textes, styles) sur les APK installés. Un module natif, une permission, l'icône, le nom de l'app ou une mise à jour du SDK demandent un **nouvel APK**. Politique runtime `fingerprint` : si le natif a changé, la mise à jour n'atteint pas les anciens APK (rien ne casse, mais il faut rebuilder) |
| Une mise à jour n'apparaît pas | Fermer complètement l'app et la rouvrir **deux fois** : le 1er lancement télécharge, le 2e applique. Puis vérifier canal (`preview`), plateforme et version runtime sur expo.dev |
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

Le 2026-11-12 : **build** natif contre **mise à jour** JavaScript (OTA, EAS Update), version runtime et politique `fingerprint`, canal ; variables `EXPO_PUBLIC_*` embarquées dans l'APK (lisibles par tous : seule la clé publique y va) ; identifiant d'application définitif sur les stores ; keystore (signature de l'APK). **RLS qui filtre en silence** : un `delete` refusé renvoie 0 ligne et `error: null`, donc vérifier le nombre de lignes (`.select()`) ; cascade exécutée avec les droits du propriétaire de la table (cas 13). Un état se pose **avant** l'action qu'il décrit (`leaving` avant l'`await`). Message d'erreur : ce qui a raté, puis quoi faire, sans inventer de cause (« Vous ne pouvez pas » mentait). Fonction pure et heure en paramètre (testable), union discriminée (`Tonight`), problème N+1 et jointures PostgREST, `Children.toArray`, debounce, contraste AA 4,5:1 (la tomate vive échouait à 3,98:1), tokens par rôle. Revue de code : repérer la duplication (deux types `Member`, quatre copies).

À consolider (2026-11-12) : `handleLeave` écrit avec les étapes dans le mauvais ordre (« leaving » posé après l'`await`), puis terminé par Claude : à refaire seul. La refonte et ses corrections ont été écrites par Claude à ma demande : relire `src/lib/tonight.ts` et ses tests pour pouvoir l'expliquer en entretien.

Mode de travail ajusté le 2026-11-03 : Bryan préfère des recommandations directes et argumentées à une série de questions ; au plus une question de vérification quand un concept est vraiment nouveau.
