# On mange quoi ?

> De « on mange quoi ? » à « c'est réglé » en moins de 2 minutes.

App mobile de décision collective des repas pour le foyer : chacun propose, tout le monde vote, l'app tranche.

**Stack :** React Native + TypeScript (Expo), Supabase (Postgres, Auth, Realtime).

🚧 Projet en cours de construction : MVP « Décider ».

## Lancer le projet

Prérequis : Node.js 20+, l'app **Expo Go** sur ton téléphone.

```bash
npm install
cp .env.example .env   # puis remplir les valeurs Supabase
npm start              # scanner le QR code avec Expo Go
```

Sous WSL, le téléphone ne voit pas le réseau de WSL : lancer `npx expo start --tunnel`.

## Base de données locale

Prérequis : Docker Desktop (sous Windows : activer l'intégration WSL de la distribution).

```bash
npx supabase start      # démarre Supabase en local et applique les migrations
npx supabase db reset   # repart d'une base vide et rejoue toutes les migrations
npx supabase stop       # arrête les conteneurs (les données sont conservées)
```

Studio (interface de la base) : http://127.0.0.1:54323. Schéma et règles : [`docs/schema.md`](docs/schema.md).

## Vérifications

```bash
npx tsc --noEmit   # types
npm run lint       # ESLint
# Scénarios RLS (Supabase local démarré) :
docker exec -i supabase_db_on-mange-quoi psql -U postgres -tA < supabase/scripts/test-rls.sql
```

## Roadmap

| Version | Objectif | Feu vert pour passer à la suite |
| --- | --- | --- |
| **MVP · Décider** | Proposer des plats, voter, l'app tranche | Le foyer décide via l'app 4 soirs sur 7, trois semaines de suite |
| V1 · Cuisiner | Recettes, commande groupée, invités | Une soirée à 8+ sans commande passée par WhatsApp |
| V2 · S'inspirer | Import de recettes depuis les réseaux sociaux | Le groupe cuisine régulièrement des recettes importées |
| V3 · Le stock | Stock du foyer, scan code-barres | — |
| V4 · Dépenses | Analyse des dépenses et des habitudes | — |
