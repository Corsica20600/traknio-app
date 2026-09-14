# Simplification de la création de programme

## Implémentation

- Une entrée Créer un programme : IA, structure de séances ou programme vide.
- Éditeur en trois étapes : base, séances, récapitulatif.
- Catalogue chargé à l'ouverture du sélecteur, 24 exercices par page, recherche temporisée de 300 ms et cache client borné (30 pages, 2 minutes).
- Sélection multiple, remplacement, ordre local, duplication de séance, champs numériques, repos 30/60/90/120 secondes, poids facultatif et boutons ±1 kg.
- Brouillon local lié au compte et au programme, récupérable même avec des champs incomplets. Enregistrement serveur explicite.
- Sauvegarde transactionnelle, contrôle du propriétaire, de l'accès premium/essai et de la révision. Protection des programmes avec séance en cours.
- Identifiants conservés pour les éléments non remplacés. Les relations de l'historique restent inchangées ; une suppression utilise les règles SetNull existantes.
- Insertion groupée des nouveaux exercices. Les éléments inchangés ne sont pas réécrits. Un renommage seul ne modifie pas les journées ni les exercices.
- IA : profil prérempli, cases à cocher, 1 à 7 séances réellement transmises au modèle et enregistrées, niveau conservé, plages numériques de répétitions restaurées. Quotas existants conservés.
- Anciennes routes maintenues pour compatibilité ; seul leur ancien écran d'édition a été remplacé. Le tutoriel contextuel et la suppression restent accessibles.

## Vérifications

- 89 tests automatisés réussis, dont 8 nouveaux tests du brouillon et de la persistance avec client de base simulé.
- ESLint, TypeScript, compilation de production et validation Prisma réussis. Compilation et tests relancés après les derniers ajustements du code.
- Navigateur en largeur 390 px : création vide et récupération locale, ouverture des réglages, poids 27 → 28 kg, repos 60 → 90 secondes, duplication conservant les réglages, ajout simultané de deux exercices et passage au récapitulatif.
- Pas de débordement horizontal (390/390 px) ni de panneau d'erreur Next.js lors du contrôle. Aucune erreur JavaScript remontée par l'outil navigateur.
- Un bouton flottant pouvait couvrir des cases à cocher : remise dans le flux normal et sélection retestée.
- Catalogue simulé côté navigateur, données entièrement fictives. Aucune sauvegarde ou suppression de programme réel déclenchée. Aucun appel de génération IA payant effectué.
- L'écran temporaire de test local a été retiré du code avant compilation.

## Limites de validation et suite

La sauvegarde a été testée avec une transaction simulée, pas de bout en bout sur PostgreSQL. Avant publication, effectuer un essai sur une branche de test : créer un programme de plusieurs séances, le recharger, modifier l'ordre et les poids, puis vérifier l'accès depuis téléphone et montre. Tester également une génération IA réelle et le rendu sur Samsung physique.

Pas de modification de schéma, de dépendance ajoutée pour ce parcours, de changement Android/Wear natif, de commit, de push ni de déploiement dans cette intervention. Les changements préexistants de package.json, package-lock.json et Android Studio ne font pas partie de cette refonte.

Les revues Next.js/React ont guidé le chargement à la demande et les contrôles d'interface ; la revue Neon/Postgres a conservé l'ORM et le schéma existants et ciblé les requêtes évitables. Aucun gain chiffré de facturation n'est revendiqué sans mesure en conditions réelles.
