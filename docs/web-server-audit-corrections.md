# Corrections web et serveur — 16 septembre 2026

Périmètre : validation des séries, sémantique des données du coach et de récupération, démonstrations d'exercices, descriptions anatomiques et actualisation Spotify. Aucun fichier Android/Wear OS, schéma Prisma, migration ou dépendance modifié.

## Comportement

- La dernière charge renseignée reste la référence par séance pour le coach, y compris zéro. Le nom interne `lastSetWeightKg` remplace `maxWeightKg`. Le prompt précise qu'une dernière série allégée n'est pas une preuve de perte de force. Les métriques JSON de progression gardent leurs noms publics.
- La moyenne cardiaque importée est affichée comme « FC moyenne », exclue du score estimatif de récupération et des preuves autorisées pour les recommandations du coach. Les anciens bilans ne sont ni réécrits ni régénérés : un message précise la limite de leur interprétation cardiaque.
- La démonstration utilise une image pour le secours WebP, puis une position fixe si ce secours échoue. La sélection des onglets reflète le contenu affiché, y compris avec les animations réduites. Les descriptions anatomiques reprennent les muscles de la fiche.
- Spotify ne lance pas de lecture lorsque la page est masquée, annule la lecture en cours, actualise au retour et évite les lectures simultanées. Les temporisations sont nettoyées au démontage.
- L'enregistrement téléphone verrouille la séance avant la recherche de série. Une série déjà terminée est renvoyée sans réécriture, modification des cibles ou redémarrage du repos. Les cibles du programme sont enregistrées dans la même transaction que la série. La validation Watch prend le même verrou côté serveur, sans modifier le protocole natif.

La protection téléphone repose sur l'identité existante séance/exercice/index de série, pas sur une nouvelle table de reçus. Cette route confirme une série ; elle ne modifie plus une série déjà terminée. Une répétition après la fin de séance peut relire la série existante mais ne peut pas en ajouter une.

## Coût des accès Neon

Comparaison du chemin applicatif, hors authentification et vérification des droits, inchangées. Les chiffres comptent les opérations Prisma/SQL explicites, pas les instructions internes que Prisma peut émettre ni une économie de facture mesurée.

| Chemin | Avant | Après |
| --- | --- | --- |
| Nouvelle série téléphone, programme trouvé, charge positive fournie | 5 lectures + 3 écritures | 3 lectures, dont le verrou, + 3 écritures |
| Nouvelle série téléphone, charge absente, poids trouvé dans la séance | 5 lectures + 3 écritures | 4 lectures, dont le verrou, + 3 écritures |
| Nouvelle série téléphone, poids absent de la séance | 5 lectures + 3 écritures | 5 lectures, dont le verrou, + 3 écritures |
| Répétition d'une série terminée | Lectures et réécritures | 3 lectures, dont le verrou ; aucune écriture |
| Nouvelle validation Watch | Chemin existant | Une lecture avec verrou supplémentaire, dans la transaction existante |
| Coach, récupération, animations, anatomie | Chemins existants | Aucune requête Neon supplémentaire |
| Spotify masqué | Lecture périodique toutes les 20 secondes | Aucune nouvelle lecture pendant le masquage |

Le verrou est pris sur une seule séance. Aucun travail périodique, journal en base ou appel IA supplémentaire ajouté. Le prompt du prochain bilan comporte quelques phrases supplémentaires ; aucun ancien bilan n'est régénéré automatiquement.

## Vérification et limites

- 117 tests unitaires réussis, dont les relectures sans écriture, le refus d'ajout après fin, les lectures d'historique conditionnelles et la conservation de la dernière charge.
- Vérification dans Chrome sur les vrais composants : échec WebM → image WebP → image fixe, préférence de réduction des animations, descriptions anatomiques et Spotify masqué/visible/démonté. Aucune requête Neon ou API externe nécessaire à cette vérification isolée.
- Les tests de service simulent la base. Ils ne mesurent pas la contention d'un PostgreSQL réel ni les coupures Bluetooth sur appareils.
- Une action Watch retardée ne contient toujours pas l'identité de la série visée. Le verrou ne peut pas reconstituer cette intention ; la résolution complète requiert le futur protocole natif.
- La déduplication santé entre synchronisations reste séparée : Android transmet actuellement une date de synchronisation, pas l'identité de chaque échantillon source. Ne pas éliminer arbitrairement deux valeurs égales et ne pas ajouter une lecture par mesure.
- Le durcissement des statuts d'approbation des médias reste un chantier éditorial distinct : vérifier les médias en usage et leurs remplacements avant de les masquer. Aucun statut de validation changé dans cette intervention.

Le test d'achat/renouvellement Google Play sur téléphone et montre décrit dans `freemium-google-play-activation.md` reste à effectuer.
