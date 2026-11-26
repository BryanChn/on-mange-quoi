import { useEffect, useState } from "react";

import { getPhotoUrl } from "./photo-storage";

// Lien temporaire vers une photo du stockage (avatar, recette). Effet justifié : on se branche
// sur un système extérieur (le stockage) ; le résultat est mis en cache dans photo-storage.ts.
export function usePhotoUrl(photoPath: string | null | undefined, bucket?: string): string | null {
  const [loaded, setLoaded] = useState<{ path: string; url: string | null } | null>(null);

  useEffect(() => {
    if (!photoPath) return;
    let isStale = false;
    getPhotoUrl(photoPath, bucket).then((url) => {
      if (!isStale) setLoaded({ path: photoPath, url });
    });
    return () => {
      isStale = true;
    };
  }, [photoPath, bucket]);

  // Une réponse pour une ancienne photo ne vaut rien pour la nouvelle.
  return photoPath && loaded?.path === photoPath ? loaded.url : null;
}
