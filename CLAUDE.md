# On mange quoi ?

App mobile qui transforme « on mange quoi ? » en décision collective rapide.
Promesse : de « on mange quoi ? » à « c'est réglé » en moins de 2 minutes.
Cahier des charges complet : page Notion « On mange quoi ? — Cahier des charges ».

## Mode de travail

- Les règles globales (`~/.claude/CLAUDE.md`) s'appliquent : posture mentor, le développeur écrit la logique principale (`TODO(human)`), Claude relit comme une PR.
- Toujours passer par une branche + PR, jamais de commit sur `main`.
- **Périmètre strict** : toute fonctionnalité hors de la version en cours est refusée et signalée, sauf validation explicite.

## Stack

| Brique | Choix |
| --- | --- |
| App | React Native + TypeScript (strict), Expo, Expo Router (routes dans `src/app/`) |
| Backend | Supabase : Postgres, Auth, Realtime |
| Auth | Membres : OTP par email. Invités (V1) : auth anonyme |
| Sécurité | Row Level Security sur **toutes** les tables : un membre ne voit que ses groupes |

- Code applicatif dans `src/`, seuls les écrans et layouts dans `src/app/`.
- Variables d'environnement : `.env` (ignoré par Git), modèle dans `.env.example`. Seules l'URL et la clé publique Supabase côté app ; jamais la clé `service_role`.
- `example/` contient le code de démo Expo : référence locale, ignorée par Git, à ne pas importer.

## Ambition et contraintes à anticiper

L'app commence dans le foyer, mais elle vise une publication sur les stores et un usage hors de la famille. On anticipe dans la conception, sans construire avant la version prévue :

- **Invités sans app (V1)** : un lien partagé ouvre l'app si elle est installée (deep link), sinon une page web (Expo Web). Le schéma prévoit dès le MVP qu'un participant peut être un invité anonyme.
- **Publication sur les stores** : politique de confidentialité, suppression de compte dans l'app (exigée par Apple), données minimales (RGPD).
- **Catalogue des fast-foods (V1)** : pas d'API publique. Catalogue JSON maintenu à la main pour quelques enseignes, avec autocomplétion et texte libre en secours. Pas de scraping, pas de logos de marques.

## Concepts

| Concept | Définition |
| --- | --- |
| Groupe | Le foyer (ex. « Famille » : 3 personnes). Permanent. |
| Membre | Personne avec compte, rattachée à un ou plusieurs groupes |
| Session de vote | Une décision à prendre dans un groupe, lancée par un membre (l'organisateur) |
| Proposition | Un plat soumis au vote (ex. « Bolognaise », « Pizza ») |
| Vote | Un membre approuve une proposition. Plusieurs approbations par personne possibles |
| Repas à plusieurs (V1) | Affiché « repas » dans l'app, « soirée » dans le code. Groupe éphémère pour organiser un repas à plusieurs (ex. « Kebab samedi »). Rejoint par un lien, effacé 24 h après la commande |
| Invité (V1) | Participant d'un repas sans compte : un pseudo, une connexion anonyme. N'a accès qu'à son repas |
| Ligne de commande (V1) | Ce qu'une personne commande dans un repas : article (texte libre), quantité, remarque |

## Roadmap

Le feu vert mesure l'usage réel, **sans bloquer la suite** (décidé le 2026-11-23 : le projet sert d'abord à apprendre et à construire une app qui m'intéresse, pas à valider un marché). On passe à la version suivante quand la précédente est livrée et propre.

| Version | Contenu | Feu vert |
| --- | --- | --- |
| **MVP · Décider** (livré) | Voir ci-dessous | Le foyer décide via l'app 4 soirs sur 7, trois semaines de suite |
| **V1 · Cuisiner** (en cours) | Recettes, commande groupée, invités sans compte, liste de courses | Une soirée à 8+ sans commande passée par WhatsApp |
| V2 · S'inspirer | Import de recettes (réseaux sociaux, IA), suggestions, préférences | Le groupe cuisine régulièrement des recettes importées |
| V3 · Le stock | Stock du foyer, seuils, scan code-barres | À définir |
| V4 · Dépenses | Analyse des dépenses, habitudes de consommation | À définir (recoupe les stats de V3, prix non disponibles avant) |

## MVP · Décider : périmètre exact

1. Un membre crée un groupe et y invite les autres membres. Il peut **quitter** un groupe : l'owner qui part transmet la couronne au membre le plus ancien ; seul, il emporte le groupe. **Seul l'owner peut supprimer** le groupe pour tous (ajouté le 2026-11-12).
2. Un membre lance une session de vote et propose plusieurs plats (ex. 3 à 5).
3. **Vote par approbation** : chaque membre coche autant de plats qu'il veut.
4. Le plat avec le plus de votes gagne.
5. En cas d'égalité : tirage au sort automatique parmi les ex æquo, à la clôture. Personne ne choisit à la main (2026-11-19 : le choix de l'organisateur était vécu comme un passage en force).
6. Votes visibles en temps réel par tout le groupe.
7. **Notifications push** aux membres du groupe : au **lancement** d'un vote (les autres membres ; l'appui ouvre le vote) et au **résultat** (« C'est décidé : Pizza. Bon appétit ! » ; l'appui ouvre le résultat) (ajouté le 2026-11-13 : un membre absent, qui travaille tard, doit pouvoir proposer, voter et savoir ce qu'on mange, sinon la décision n'est plus collective). **Rappel unique** (ajouté le 2026-11-20) : 1 h après le lancement, une seule relance aux membres qui n'ont ni proposé ni voté (hors organisateur), entre 10 h et 21 h (Paris), au plus tard 3 h après le lancement, rien si le vote est clos. Jamais répété. Pas de notification pour les plats proposés (décidé le 2026-11-20).
8. **Avatar** (ajouté le 2026-11-20) : chacun choisit un avatar prédéfini (le chat, spaghetti, pizza, burger, avocat, ramen) ou garde son initiale, dans Mon compte ; le même sur tous les écrans, identique en clair et en sombre. La photo perso suivra avec un prochain APK (`expo-image-picker`, natif).

Hors MVP, volontairement : présence, heure limite, notifications autres que le lancement, le rappel unique et le résultat d'un vote (dont « ce groupe a été supprimé », rappels répétés ou planifiés à heure fixe), commande groupée, invités, liste de courses, recettes, stock.

### Règles du vote (tranchées le 2026-10-26)

| Règle | Décision | Conséquence technique |
| --- | --- | --- |
| Qui propose | Tout membre du groupe, tant que la session est ouverte | RLS `proposals` : être membre du groupe |
| Qui lance | Tout membre du groupe ; **une seule session ouverte à la fois par groupe** (2026-10-27) | Index unique partiel sur `vote_sessions (group_id) where status = 'open'` |
| Clôture | L'organisateur, manuellement (bouton) ; l'**owner** du groupe peut aussi clôturer une session oubliée (2026-10-27) | Fonction `close_session` (calcul du gagnant et tirage côté serveur), pas d'`update` direct |
| Modifier ses votes | Oui, jusqu'à la clôture (cocher / décocher) | Un vote = une ligne, supprimable tant que la session est ouverte |
| Imposer un plat | Non, jamais : même en cas d'égalité, c'est le tirage (2026-11-19) | `close_session` refuse `method = 'organisateur'` ; la valeur reste dans l'enum pour l'historique |
| Aucun vote | Traité comme une égalité entre toutes les propositions | Pas de cas spécial : même règle d'égalité |

En cas d'égalité, `close_session` tire au sort parmi les ex æquo, sans rien demander à l'organisateur.
Le tirage s'affiche comme une **roulette animée** sur tous les téléphones. Le résultat est tiré **une seule fois** et enregistré en base ; l'animation se contente de s'arrêter sur ce résultat, pour que tout le monde voie le même plat. La façon dont le gagnant a été désigné est enregistrée (`vote`, `tirage`, `organisateur`).

## V1 · Cuisiner : repas à plusieurs (en cours, tranché le 2026-11-23)

Nom affiché « repas » depuis le 2026-11-24 (« soirée » était trop étroit : un midi, un goûter). Le code, la base et les routes gardent « soirée » (`kind = 'soiree'`, `/soiree/…`) : invisible pour l'utilisateur, et un renommage demanderait une migration sans bénéfice.

Étude : https://claude.ai/artifact/7GqZQEu78cCoVNV2refUQ7. Une soirée remplace les commandes notées sur papier ou envoyées par WhatsApp.

1. Tout compte réel crée une soirée, puis invite quand il veut (pas de partage imposé à la création, retour d'usage du 2026-11-23) : un lien (WhatsApp, SMS), qu'on ouvre dans un navigateur avec un pseudo, même sans l'app ; ou le code de la soirée, que quelqu'un qui a l'app tape dans « Rejoindre avec un code » (mêmes règles que le lien). Le lien ouvrira directement l'app avec le prochain APK (App Links).
2. « Où on mange ? » : vote existant avec des restaurants, ou resto fixé directement par le responsable (vote facultatif).
3. Puis la liste de commande : chacun ajoute ses lignes (texte libre, quantité, remarque) et voit celles des autres, en direct. Le responsable a le récapitulatif (regroupé pour le comptoir, et par personne).
4. Le responsable marque « Commande passée » : tout se fige, historique de 24 h, puis la soirée et les comptes invités sont effacés (soirée abandonnée : 7 jours).
5. Le responsable peut retirer une ligne ou une personne. 20 participants au plus. Une carte sur l'accueil tant que la soirée existe.

Plus tard, volontairement : paiement et partage de la note (chacun paie sa part), catalogue des enseignes, notifications aux invités, transformer un invité en compte.

### Liste de courses (tranché le 2026-11-24)

1. Une liste par groupe (foyer), partagée par ses membres et suivie en direct. Pas de liste pour une soirée.
2. Articles ajoutés à la main : texte libre et quantité facultative en texte (« 2 », « 500 g »). L'ajout depuis une recette viendra avec les recettes.
3. Cocher = « je l'ai pris » : l'article descend en bas, barré, avec qui l'a pris (heure et auteur posés par le serveur). On peut décocher. « Retirer les achetés » range les articles pris (ils quittent la liste).
4. Améliorations du 2026-11-24 : modifier un article (appui long), pas de doublon (un article déjà pris revient dans « À acheter »), la liste depuis l'accueil, et « Souvent acheté » : les articles rangés reviennent en suggestions, un toucher les rajoute avec leur dernière quantité.

## Commandes

```bash
npm run dev          # Expo avec tunnel (WSL), l'app vise le projet Supabase de dev en ligne
npm run db:start     # Supabase local (Docker), pour écrire et tester les migrations
npm run db:test      # scénarios SQL de supabase/scripts/
npm run db:push      # pousser les migrations en ligne (dry-run avant)
npx tsc --noEmit     # vérification des types
npm run lint         # ESLint
npm test             # tests des fonctions pures (node --test)
npm run update -- --message "…"  # publier le JavaScript sur les APK installés (canal preview)
```

## Ordre de construction

1. Schéma SQL + politiques RLS (migrations versionnées), testés avant tout écran.
2. Logique de décision (comptage, égalité, tirage) en fonctions SQL côté serveur (`get_session_result`, `close_session`), testées par scénarios : le tirage doit être unique et infalsifiable, donc jamais calculé sur le téléphone.
3. Écrans un par un, chaque parcours testé sur un vrai téléphone via Expo Go.

## Reprendre le travail

- En début de session, lire `docs/journal-de-bord.md` : état du projet, prochaines étapes, vérifications et pièges connus.
- En fin de session, le mettre à jour (fait, à faire, à vérifier) dans la PR de la session.
