import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';
import { AppState, Platform } from 'react-native';

import type { Database } from './database.types';

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

// Échouer tout de suite avec un message clair plutôt qu'une erreur réseau obscure plus tard.
if (!supabaseUrl || !supabaseKey) {
  throw new Error(
    'Variables EXPO_PUBLIC_SUPABASE_URL et EXPO_PUBLIC_SUPABASE_ANON_KEY manquantes : copier .env.example en .env.',
  );
}

export const supabase = createClient<Database>(supabaseUrl, supabaseKey, {
  auth: {
    // La session survit à la fermeture de l'app (sinon reconnexion à chaque lancement).
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    // Pas d'URL de retour à lire sur mobile : la connexion se fait par code OTP.
    detectSessionInUrl: false,
  },
});

// Sur mobile, le rafraîchissement du jeton ne doit tourner que quand l'app est au premier plan.
if (Platform.OS !== 'web') {
  AppState.addEventListener('change', (state) => {
    if (state === 'active') {
      supabase.auth.startAutoRefresh();
    } else {
      supabase.auth.stopAutoRefresh();
    }
  });
}
