#!/usr/bin/env bash
# Lance les tests d'intégration (Supabase local démarré : npm run db:start).
# Volontairement hors des "scripts" de package.json : Expo les compte dans l'empreinte
# runtime, et en ajouter un empêcherait les mises à jour EAS d'atteindre les APK installés.
set -euo pipefail
cd "$(dirname "$0")/../.."
exec node --import ./tests/integration/register.ts --test "tests/integration/**/*.test.ts"
