#!/usr/bin/env bash
# Compare l'empreinte runtime Android du code à celle des APK installés (.runtime-fingerprint).
# Une empreinte différente = les mises à jour EAS (npm run update) n'atteindront plus les
# téléphones : il faut un nouveau build. Si c'est voulu (montée d'Expo, module natif),
# mettre à jour .runtime-fingerprint dans la même PR, puis rebuild et réinstaller.
set -euo pipefail
cd "$(dirname "$0")/.."

expected=$(tr -d '[:space:]' < .runtime-fingerprint)
actual=$(npx expo-updates fingerprint:generate --platform android 2>/dev/null \
  | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>console.log(JSON.parse(s).hash))')

if [ "$actual" != "$expected" ]; then
  echo "Empreinte runtime changée : $expected (APK installés) -> $actual"
  echo "Les mises à jour EAS n'atteindraient plus les téléphones."
  echo "Détail : npx expo-updates fingerprint:generate --platform android"
  exit 1
fi
echo "Empreinte runtime inchangée ($actual) : compatible avec les APK installés."
