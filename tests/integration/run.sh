#!/usr/bin/env bash
# Lance les tests d'intégration (Supabase local démarré : npm run db:start).
# Volontairement hors des "scripts" de package.json : Expo les compte dans l'empreinte
# runtime, et en ajouter un empêcherait les mises à jour EAS d'atteindre les APK installés.
set -euo pipefail
cd "$(dirname "$0")/../.."
# Un fichier après l'autre : la base locale est partagée, et les tests de purge effacent tous
# les repas « dans 32 jours », y compris ceux qu'un autre fichier utiliserait en même temps.
exec node --import ./tests/integration/register.ts --test --test-concurrency=1 "tests/integration/**/*.test.ts"
