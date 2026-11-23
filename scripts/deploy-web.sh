#!/usr/bin/env bash
# Met en ligne la version web de l'app sur EAS Hosting (page des invités des soirées).
#   bash scripts/deploy-web.sh          → aperçu, adresse unique : https://<nom>--<id>.expo.app
#   bash scripts/deploy-web.sh --prod   → production : https://<nom>.expo.app
# Hors des "scripts" de package.json : Expo les compte dans l'empreinte runtime (voir run.sh).
# L'export lit .env (URL et clé publique Supabase, rien de secret) : il vise le projet en ligne.
set -euo pipefail
cd "$(dirname "$0")/.."

rm -rf dist
npx expo export -p web
npx --yes eas-cli deploy --non-interactive "$@"
