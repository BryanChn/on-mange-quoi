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

## Vérifications

```bash
npx tsc --noEmit   # types
npm run lint       # ESLint
```

## Roadmap

| Version | Objectif | Feu vert pour passer à la suite |
| --- | --- | --- |
| **MVP · Décider** | Proposer des plats, voter, l'app tranche | Le foyer décide via l'app 4 soirs sur 7, trois semaines de suite |
| V1 · Cuisiner | Recettes, commande groupée, invités | Une soirée à 8+ sans commande passée par WhatsApp |
| V2 · S'inspirer | Import de recettes depuis les réseaux sociaux | Le groupe cuisine régulièrement des recettes importées |
| V3 · Le stock | Stock du foyer, scan code-barres | — |
| V4 · Dépenses | Analyse des dépenses et des habitudes | — |
