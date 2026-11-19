// Chargé avant les tests d'intégration (node --import). Deux ajustements pour faire tourner
// le vrai code de src/lib sous Node, sans le modifier :
// 1. les imports relatifs sans extension (`./members`, convention de Metro) sont résolus en `.ts` ;
// 2. src/lib/supabase.ts, qui dépend de React Native (AsyncStorage, AppState), est remplacé
//    par un client branché sur la base locale.
import { registerHooks } from "node:module";

const TEST_CLIENT_URL = new URL("./supabase-test-client.ts", import.meta.url).href;

registerHooks({
  resolve(specifier, context, nextResolve) {
    const isRelative = specifier.startsWith("./") || specifier.startsWith("../");
    const hasExtension = /\.[cm]?[jt]sx?$/.test(specifier);
    // Seulement nos fichiers TypeScript : les paquets de node_modules gardent leur résolution.
    const fromOurCode = context.parentURL?.endsWith(".ts") === true;
    const resolved =
      isRelative && !hasExtension && fromOurCode
        ? nextResolve(`${specifier}.ts`, context)
        : nextResolve(specifier, context);

    if (resolved.url.endsWith("/src/lib/supabase.ts")) {
      return { url: TEST_CLIENT_URL, shortCircuit: true };
    }
    return resolved;
  },
});
