# On mange quoi ?

> De « on mange quoi ? » à « c'est réglé » en moins de 2 minutes.

App mobile de décision collective des repas pour le foyer : chacun propose, tout le monde vote, l'app tranche.

**Stack :** React Native + TypeScript (Expo), Supabase (Postgres, Auth, Realtime).

🚧 Projet en cours de construction : MVP « Décider ».

## Lancer le projet

Prérequis : Node.js 20+, l'app **Expo Go** sur ton téléphone.

```bash
npm install
cp .env.example .env   # puis remplir l'URL et la clé publique du projet Supabase de dev
npm run dev            # Expo avec tunnel (indispensable sous WSL), scanner le QR code avec Expo Go
```

L'app vise le projet Supabase **en ligne** (le téléphone ne peut pas joindre une base sur le PC) : Docker n'est pas nécessaire pour coder les écrans.

## Base de données locale

Sert à écrire et tester les migrations. Prérequis : Docker Desktop (sous Windows : activer l'intégration WSL de la distribution).

| Commande | Effet |
| --- | --- |
| `npm run db:start` | Démarre Supabase en local (en arrière-plan) et applique les migrations |
| `npm run db:reset` | Repart d'une base vide et rejoue toutes les migrations |
| `npm run db:test` | Lance les scénarios de `supabase/scripts/` (chaque ligne : obtenu / attendu) |
| `npm run db:types` | Régénère `src/lib/database.types.ts` après une migration |
| `npm run db:push` | Applique les nouvelles migrations au projet en ligne (faire `npx supabase db push --linked --dry-run` avant) |
| `npm run db:stop` | Arrête les conteneurs (les données sont conservées) |

Studio (interface de la base) : http://127.0.0.1:54323. Schéma et règles : [`docs/schema.md`](docs/schema.md).

## Vérifications

```bash
npx tsc --noEmit   # types
npm run lint       # ESLint
npm run db:test    # scénarios de la base (Supabase local démarré)
```

## Roadmap

| Version | Objectif | Feu vert pour passer à la suite |
| --- | --- | --- |
| **MVP · Décider** | Proposer des plats, voter, l'app tranche | Le foyer décide via l'app 4 soirs sur 7, trois semaines de suite |
| V1 · Cuisiner | Recettes, commande groupée, invités | Une soirée à 8+ sans commande passée par WhatsApp |
| V2 · S'inspirer | Import de recettes depuis les réseaux sociaux | Le groupe cuisine régulièrement des recettes importées |
| V3 · Le stock | Stock du foyer, scan code-barres | — |
| V4 · Dépenses | Analyse des dépenses et des habitudes | — |
