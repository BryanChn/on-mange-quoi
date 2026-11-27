# Audit de sécurité — 2026-11-27

Fin de la V1, avant les stores. Six couches vérifiées, de la plus exposée à la moins exposée, sur le projet Supabase en ligne (lecture seule) et sur le dépôt.

## Résumé

| Couche | Résultat |
| --- | --- |
| Base : RLS | ✅ Toutes les tables de `public` ont la RLS ; `push_tickets` n'a aucune politique, c'est voulu (serveur seulement) |
| Base : droits de table | ⚠️ **Corrigé** : `TRUNCATE`, `TRIGGER`, `REFERENCES` sur 9 tables pour tout compte, et `SELECT` / `DELETE` pour `anon` |
| Base : fonctions | ✅ Toutes les `security definer` fixent `search_path` ; les actions vérifient l'appelant ; les invités anonymes ne peuvent pas rejoindre un foyer |
| Base : rejoindre avec un code | ⚠️ **Corrigé** : aucune limite d'essais sur `join_group` |
| Stockage | ✅ Buckets privés, 1 Mo, JPEG seulement ; dossiers par foyer ou par compte |
| Edge Functions | ✅ Secret partagé (`x-internal-secret`) comparé en temps constant, contrôlé en première ligne des 4 fonctions ; appel sans secret : 401 (vérifié en ligne) |
| Secrets et dépôt | ✅ Aucun secret dans tout l'historique Git ; `.env` et keystores ignorés ; l'app n'embarque que l'URL et la clé publique |
| Dépendances | 🟡 3 modérées, une seule cause (`minimatch` dans `@expo/fingerprint`, outil de build) : risque accepté |
| Site des invités | 🟡 Seul HSTS est envoyé : en-têtes à ajouter au prochain build (ils changent l'empreinte) |

## Corrigé (migration `security_audit`)

1. **Droits de table.** Les premières tables gardaient les droits par défaut de Supabase. La RLS ne s'applique pas à `TRUNCATE` ; l'API ne sait pas en faire (il faudrait le mot de passe de la base), donc le risque réel était faible, mais un droit dangereux ne doit pas reposer sur une seule barrière (défense en profondeur). Retirés : `TRUNCATE`, `TRIGGER`, `REFERENCES` pour `anon` et `authenticated` ; tout droit de table et de séquence pour `anon` (un invité se connecte avant de lire, il passe par `authenticated`). Les tables futures naissent sans ces droits (`alter default privileges`).
2. **Rejoindre avec un code.** 8 caractères parmi 31 (≈ 850 milliards de combinaisons), mais aucune limite : un script pouvait tester des codes en boucle. Désormais, 10 codes faux en 15 minutes bloquent `join_group` pour ce compte (`private.join_attempts`). Un code faux renvoie `null` au lieu d'une erreur : une erreur annulerait la transaction, et avec elle l'essai noté. L'app traduisait déjà l'erreur en `null`, rien ne change pour les APK installés. Message : « Trop d'essais : réessaie dans un quart d'heure ».

Tests d'intégration : le verrou après 10 codes faux ; sans connexion, `groups` répond « permission refusée » (42501) et l'aperçu d'invitation marche toujours.

## Avertissements de Supabase (`supabase db advisors`), triés

| Avertissement | Nombre | Verdict |
| --- | --- | --- |
| Fonction `security definer` appelable par un compte | 25 | Voulu : nos actions (`create_group`, `close_session`…) vérifient l'appelant ; les fonctions d'aide des politiques ne renseignent que sur soi |
| Connexion anonyme activée | 19 | Voulu (invités) ; `is_foyer_member` et `join_group` excluent les anonymes |
| Fonction `security definer` appelable sans connexion | 2 | `soiree_preview` (page d'invitation, jeton de 128 bits) ; `rls_auto_enable` (déclencheur de Supabase, pas appelable) |
| Mots de passe divulgués | 1 | Sans objet : connexion par code reçu par e-mail |

## Risques acceptés, à revoir

- `proposal_has_votes(id)` répond pour n'importe quelle proposition, sans vérifier le groupe. Un identifiant est un UUID aléatoire et la réponse un oui ou non : faible.
- Les fonctions d'aide des politiques (`is_foyer_member`, `can_read_recipe`…) sont exposées en RPC parce qu'elles vivent dans `public`. La recommandation de Supabase : les ranger dans un schéma non exposé. Gros déplacement (toutes les politiques), sans fuite aujourd'hui.
- `minimatch` (ReDoS) via `@expo/fingerprint` : outil de build, motifs du projet seulement ; la « correction » de `npm audit` (`expo@52`) serait un retour en arrière.

## Au prochain build (backlog, avant les stores)

- **En-têtes du site des invités** dans `app.json` (plugin `expo-router`, clé `headers`) : `Content-Security-Policy: frame-ancestors 'none'`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: no-referrer` (le jeton est dans l'adresse), `Permissions-Policy: camera=(), microphone=(), geolocation=()`. Testé le 27/11 : l'empreinte change, donc un nouvel APK. Une CSP complète (`connect-src` vers Supabase, `img-src` des liens signés) à tester sur un aperçu avant la production.
- **CAPTCHA** sur la connexion anonyme et l'envoi du code par e-mail (déjà au backlog).
