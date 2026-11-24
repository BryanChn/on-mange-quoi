#!/usr/bin/env bash
# Tests de bout en bout (Supabase local démarré, Realtime compris : npm run db:start).
#   bash e2e/run.sh            → tous les tests
#   bash e2e/run.sh --headed   → en voyant le navigateur (options passées à Playwright)
# 1. exporte l'app web pointée sur la base locale, 2. lance Playwright, qui la sert.
# Hors des "scripts" de package.json : Expo les compte dans l'empreinte runtime.
set -euo pipefail
cd "$(dirname "$0")/.."

status=$(npx supabase status -o json 2>/dev/null) || {
  echo "Supabase local injoignable : lancer npm run db:start." >&2
  exit 1
}
read_key() { node -e 'console.log(JSON.parse(process.argv[1])[process.argv[2]])' "$status" "$1"; }
url=$(read_key API_URL)
anon_key=$(read_key ANON_KEY)

case "$url" in
  http://127.0.0.1:* | http://localhost:*) ;;
  *) echo "Refus : $url n'est pas la base locale." >&2; exit 1 ;;
esac

# Les variables du shell priment sur .env : l'export vise la base locale, pas le projet en ligne.
rm -rf e2e/dist-web
EXPO_PUBLIC_SUPABASE_URL="$url" EXPO_PUBLIC_SUPABASE_ANON_KEY="$anon_key" \
  npx expo export -p web --output-dir e2e/dist-web

if ! grep -rqF "$url" e2e/dist-web; then
  echo "L'export ne vise pas $url : arrêt avant de toucher une autre base." >&2
  exit 1
fi

cd e2e
exec npx playwright test "$@"
