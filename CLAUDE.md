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

## Roadmap

On ne passe à la version suivante qu'une fois son feu vert atteint ; sinon on améliore la version en cours.

| Version | Contenu | Feu vert |
| --- | --- | --- |
| **MVP · Décider** (en cours) | Voir ci-dessous | Le foyer décide via l'app 4 soirs sur 7, trois semaines de suite |
| V1 · Cuisiner | Recettes, commande groupée, invités sans compte, liste de courses | Une soirée à 8+ sans commande passée par WhatsApp |
| V2 · S'inspirer | Import de recettes (réseaux sociaux, IA), suggestions, préférences | Le groupe cuisine régulièrement des recettes importées |
| V3 · Le stock | Stock du foyer, seuils, scan code-barres | À définir |
| V4 · Dépenses | Analyse des dépenses, habitudes de consommation | À définir (recoupe les stats de V3, prix non disponibles avant) |

## MVP · Décider : périmètre exact

1. Un membre crée un groupe et y invite les autres membres.
2. Un membre lance une session de vote et propose plusieurs plats (ex. 3 à 5).
3. **Vote par approbation** : chaque membre coche autant de plats qu'il veut.
4. Le plat avec le plus de votes gagne.
5. En cas d'égalité : l'organisateur choisit entre tirage au sort (parmi les ex æquo) ou décision manuelle (« ok, on fait ça »).
6. Votes visibles en temps réel par tout le groupe.

Hors MVP, volontairement : présence, heure limite et notifications, commande groupée, invités, liste de courses, recettes, stock.

### Règles du vote (tranchées le 2026-10-26)

| Règle | Décision | Conséquence technique |
| --- | --- | --- |
| Qui propose | Tout membre du groupe, tant que la session est ouverte | RLS `proposals` : être membre du groupe |
| Qui lance | Tout membre du groupe ; **une seule session ouverte à la fois par groupe** (2026-10-27) | Index unique partiel sur `vote_sessions (group_id) where status = 'open'` |
| Clôture | L'organisateur, manuellement (bouton) ; l'**owner** du groupe peut aussi clôturer une session oubliée (2026-10-27) | Fonction `close_session` (calcul du gagnant et tirage côté serveur), pas d'`update` direct |
| Modifier ses votes | Oui, jusqu'à la clôture (cocher / décocher) | Un vote = une ligne, supprimable tant que la session est ouverte |
| Imposer un plat | Non, l'organisateur ne tranche **qu'en cas d'égalité** | Décision manuelle refusée s'il y a un gagnant unique |
| Aucun vote | Traité comme une égalité entre toutes les propositions | Pas de cas spécial : même règle d'égalité |

En cas d'égalité, l'organisateur choisit : tirage au sort parmi les ex æquo, ou choix manuel parmi les ex æquo.
Le tirage s'affiche comme une **roulette animée** sur tous les téléphones. Le résultat est tiré **une seule fois** et enregistré en base ; l'animation se contente de s'arrêter sur ce résultat, pour que tout le monde voie le même plat. La façon dont le gagnant a été désigné est enregistrée (`vote`, `tirage`, `organisateur`).

## Commandes

```bash
npm start            # serveur de dev Expo (scanner le QR code avec Expo Go)
npx tsc --noEmit     # vérification des types
npm run lint         # ESLint
```

## Ordre de construction

1. Schéma SQL + politiques RLS (migrations versionnées), testés avant tout écran.
2. Logique de décision (comptage, égalité, tirage) en fonctions SQL côté serveur (`get_session_result`, `close_session`), testées par scénarios : le tirage doit être unique et infalsifiable, donc jamais calculé sur le téléphone.
3. Écrans un par un, chaque parcours testé sur un vrai téléphone via Expo Go.
