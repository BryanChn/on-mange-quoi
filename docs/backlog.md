# Backlog · idées à penser plus tard

Idées validées sur le principe mais hors de la version en cours.
Avant de passer à une nouvelle version (voir la roadmap dans `CLAUDE.md`), relire cette liste.

| Idée | Version | Notes techniques |
| --- | --- | --- |
| Prévenir les votants quand un plat qu'ils avaient coché disparaît, et les inviter à revoter | V1 (notifications) | Au MVP, le retrait n'est possible que sans vote : le cas ne se pose pas encore. |
| Détecter les fautes de frappe entre propositions (« piza », « piiza » → « Pizza ? ») | Après MVP | Extension Postgres `pg_trgm` (similarité de texte) pour suggérer, sans bloquer. |
| Ignorer les accents dans les doublons (« Pâtes » = « Pates ») | Après MVP | Extension `unaccent`, à combiner avec l'index unique sur le nom. |
| Annulation d'une session par l'organisateur ou l'owner | À définir | Ajouter la valeur `cancelled` à l'enum `session_status` et adapter le check de `vote_sessions`. |
| Parcours de suppression de compte : avertir (groupes possédés, votes organisés) et choisir à qui transférer | MVP, avant publication | Exigé par Apple. Règles détaillées dans `docs/schema.md`. |
