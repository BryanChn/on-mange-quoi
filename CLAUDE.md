# On mange quoi ?

App mobile qui transforme « on mange quoi ? » en décision collective rapide.
Promesse : de « on mange quoi ? » à « c'est réglé » en moins de 2 minutes.
Cahier des charges complet : page Notion « On mange quoi ? — Cahier des charges ».

## Mode de travail

- Les règles globales (`~/.claude/CLAUDE.md`) s'appliquent (posture mentor), sauf sur un point : dans ce projet, Claude écrit tout le code et le développeur relit et valide les PR (pas de `TODO(human)`).
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
8. **Avatar** (ajouté le 2026-11-20) : chacun choisit un avatar prédéfini (le chat, spaghetti, pizza, burger, avocat, ramen) ou garde son initiale, dans Mon compte ; le même sur tous les écrans, identique en clair et en sombre. On peut aussi choisir une photo perso (`expo-image-picker`).

9. **Midi ou soir** (ajouté le 2026-11-25) : au lancement d'un vote de foyer, une pastille « Ce midi » / « Ce soir », présélectionnée selon l'heure (avant 15 h : midi). L'accueil, le résultat et la notification de lancement en parlent (« Ce midi, c'est Pizza ! ») ; un repas de midi décidé n'est plus « c'est réglé » après 15 h, l'accueil propose le vote du soir. Deux moments seulement : les repas à plusieurs ont leur date et leurs sujets.

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

1. Tout compte réel crée une soirée, puis invite quand il veut (pas de partage imposé à la création, retour d'usage du 2026-11-23) : un lien (WhatsApp, SMS), qu'on ouvre dans un navigateur avec un pseudo, même sans l'app ; ou le code de la soirée, que quelqu'un qui a l'app tape dans « Rejoindre avec un code » (mêmes règles que le lien). Si l'app est installée, le lien l'ouvre directement (App Links).
2. « Où on mange ? » : vote existant avec des restaurants, ou resto fixé directement par le responsable (vote facultatif).
3. Puis la liste de commande : chacun ajoute ses lignes (texte libre, quantité, remarque) et voit celles des autres, en direct. Le responsable a le récapitulatif (regroupé pour le comptoir, et par personne).
4. Le responsable marque « Commande passée » : tout se fige. La soirée et les comptes invités sont effacés 24 h après le jour du repas.
5. Le responsable peut retirer une ligne ou une personne. 20 participants au plus. Une carte sur l'accueil tant que la soirée existe.

Plus tard, volontairement : paiement et partage de la note (chacun paie sa part), catalogue des enseignes, notifications aux invités, transformer un invité en compte.

### Repas à plusieurs : trois façons (tranché le 2026-11-24)

Retour d'usage : un repas servait à choisir un dessert chez quelqu'un. Maquette : https://claude.ai/artifact/Y3YUASnGDVfdk6pqzDvk4p. Règle d'or : rapide et sans réfléchir pour chaque cas, une question par écran, un toucher fait avancer, une valeur par défaut seulement quand un choix est obligatoire (la date : aujourd'hui), ton de pote.

1. « C'est quoi le plan ? » : **On se commande un truc** (vote ou choix du resto, puis la commande groupée), **On va au resto** (le vote du resto s'ouvre, puis c'est décidé), **On mange chez quelqu'un**.
2. Chez quelqu'un : « On décide quoi ? » (apéro, entrée, plat, dessert ; rien de coché d'office, le bouton annonce « Lancer 2 votes » ou « C'est parti, sans vote » ; 2026-11-24, retour d'usage : décocher le plat pour un dessert était un piège), un vote par sujet, **ouverts en même temps** ; le menu est décidé quand le dernier vote se termine. **Qui apporte quoi** dès le début : chacun écrit ce qu'il apporte, visible en direct.
3. « Quand ? » (ce soir par défaut, demain, une date jusqu'à 6 mois) : le repas est effacé 24 h après son jour.

### Liste de courses (tranché le 2026-11-24)

1. Une liste par groupe (foyer), partagée par ses membres et suivie en direct. Pas de liste pour une soirée.
2. Articles ajoutés à la main : texte libre et quantité facultative en texte (« 2 », « 500 g »). L'ajout depuis une recette viendra avec les recettes.
3. Cocher = « je l'ai pris » : l'article descend en bas, barré, avec qui l'a pris (heure et auteur posés par le serveur). On peut décocher. « Retirer les achetés » range les articles pris (ils quittent la liste).
4. Améliorations du 2026-11-24 : modifier un article (appui long), pas de doublon (un article déjà pris revient dans « À acheter »), la liste depuis l'accueil (une seule ligne, même avec plusieurs foyers : une liste à faire s'ouvre directement, plusieurs passent par un écran de choix ; 2026-11-24, pour ne pas envahir l'accueil), et « Souvent acheté » : les articles rangés reviennent en suggestions, un toucher les rajoute avec leur dernière quantité.

5. **« Je pars faire les courses »** (2026-11-25), dans un foyer d'au moins 2 personnes : les autres sont prévenus (« Besoin de quelque chose ? Ajoute-le à la liste. »), puis pendant 1 h, ce qu'ils ajoutent prévient celui qui fait les courses, regroupé sur 30 s (« À prendre aussi : lait, œufs. »). « J'ai fini » arrête. Un départ annoncé au plus toutes les 30 min par personne, pas d'annonce la nuit. Interrupteur « Liste de courses » dans Mon compte.
6. **Rangée par rayon** (2026-11-27, entré en V1 : https://claude.ai/artifact/3PSCG8xwP2TxWtpr9VSQ9a) : treize rayons calés sur les enseignes (dont Charcuterie et traiteur, Bébé, Animaux, Autres en dernier) ; le rayon est deviné d'après le nom à l'ajout (le mot principal d'abord, testé sur une centaine d'articles courants) ; « Choisir le rayon » (appui long, ou juste après un ajout rangé dans Autres) et le foyer s'en souvient pour ce nom ; l'ordre des rayons est celui du magasin du foyer, partagé ; une étoile « indispensable » met l'article en tête ; tri « Par rayon » ou « Par ajout ».

### Recettes (tranché le 2026-11-25)

Étude : https://claude.ai/artifact/SbaydwqqNZ36yrqnLn2yH2. La V1 se termine avec les recettes, avant les stores.

1. Un **carnet par foyer**, partagé et modifiable par tous ses membres (ingrédients compris), suivi en direct. Pas de recette dans un repas à plusieurs.
2. **Recettes de base** écrites pour l'app (contenu préparé par moi avec mon assistant cuisine, textes originaux : pas d'import d'un site, pas de scraping) ; « Ajouter à mon carnet » en fait une copie modifiable.
3. Une recette : titre, parts, ingrédients, étapes, photo facultative (galerie, ou le plat pris en photo à la fin du mode cuisine). Un ingrédient = une ligne (« 500 g bœuf ») avec autocomplétion sur la table **Ciqual** (Anses) ; sans aliment choisi, la ligne reste en texte libre.
4. **Calories et macros par part**, estimées depuis Ciqual, toujours affichées « ≈ … estimation », jamais un conseil de santé.
5. La boucle : proposer une recette au vote, « Voir la recette » au résultat, « Ajouter aux courses » (parts = nombre de membres du foyer, on décoche ce qu'on a, pas de doublon), mode cuisine (une étape par écran, écran allumé).
6. **L'astuce du chef** (2026-11-27) : un encadré signé par le chat cuisinier (l'avatar « chat » coiffé d'une toque), avant les étapes ; une phrase de chef par recette de base, gardée par la copie, modifiable par le foyer. Les étapes au tutoiement, avec des repères concrets. Jamais une phrase prêtée à un vrai chef ; un chef n'est nommé que pour un fait vérifiable. 20 recettes de base (deux lots), pas davantage.
7. **Type de plat et filtres** (2026-11-27, entrés en V1 : https://claude.ai/artifact/Pg5e2H8YsqvDJYxgzz4dSS) : chaque recette a un type facultatif (Viande, Poisson, Végé, Dessert), badge en line icon sur sa vignette ; le carnet se filtre par type (un à la fois), « ≤ 30 min » et « Petit budget » ; « Écrire une recette » choisit le type, les régimes, le temps total et le budget (€ à €€€), facultatifs.

Plus tard, volontairement : partage communautaire des recettes (V2, avec modération) ; recettes qui connaissent le stock (V3) ; filtres par régime et difficulté (V2).

### Notifications d'un repas (tranché le 2026-11-25)

Retour d'usage : savoir qui rejoint et qui apporte quoi, sans être noyé de notifications.

1. Les votes d'un repas parlent de leur sujet (« où on mange ? », « quel dessert ? »). Repas chez quelqu'un : une seule notification quand tout le menu est décidé, avec tous les plats ; le rappel unique parle du menu.
2. **Réglages dans Mon compte** : « Votes », « Repas à plusieurs » et « Liste de courses » (ajouté avec « Je pars faire les courses »), activés par défaut (une notification à activer soi-même, personne ne l'active). Le serveur ne prévient pas qui a coupé. **Par repas** (2026-11-25) : un interrupteur « Me tenir au courant » sur l'écran du repas, activé par défaut, coupe tout ce repas (ses votes, qui rejoint, qui apporte quoi) ; un seul interrupteur, pas une liste de cases.
3. **Résumé du repas** (« Léa et Tom ont rejoint. Léa apporte : le pain. »), arrivées et apports seulement, pas la commande, jamais ses propres actions ni entre 22 h et 8 h. En deux vitesses (retour d'usage du 2026-11-25) : **l'organisateur** environ 1 min après un changement (il doit savoir qui vient et ce qui est couvert ; la minute regroupe une rafale) ; **les autres** qui ont l'app, au plus un résumé toutes les 30 min, 10 min après le premier changement et à partir de 2 nouveautés (une info en plus : la liste en direct évite déjà d'apporter deux fois la même chose).
4. **« C'est commandé »** (2026-11-25) : quand le responsable marque la commande passée, les participants qui ont l'app sont prévenus. **Le jour d'un repas chez quelqu'un** : un rappel à 10 h (« C'est aujourd'hui ! Tu apportes : le vin. »), seulement si le repas a été créé avant ce jour-là.
5. **Partager sur WhatsApp** aux moments clés (menu décidé, resto décidé, commande passée) : c'est le canal des invités.
6. Haptique : un ajout réussi (apport, ligne de commande, article) vibre comme cocher un plat.

Écarté : une notification par ajout ou par arrivée (du bruit à 20) ; les notifications aux invités sans l'app (Web Push : une page ouverte une fois, souvent refusée, et sur iPhone seulement si le site est sur l'écran d'accueil).

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
3. Écrans un par un, chaque parcours testé sur un vrai téléphone : Expo Go pendant le dev, l'APK preview pour le natif (notifications, photos, App Links).

## Reprendre le travail

- En début de session, lire `docs/journal-de-bord.md` : état du projet, prochaines étapes, vérifications et pièges connus.
- En fin de session, le mettre à jour (fait, à faire, à vérifier) dans la PR de la session.
