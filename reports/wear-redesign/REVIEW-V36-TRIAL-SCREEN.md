# Essai et écran allumé — téléphone 31 / montre 36

## Changements locaux

- Essai déclenché explicitement par le compte : sept jours maximum, non renouvelable, sans prélèvement automatique. Les abonnements et accès internes restent distincts.
- Une génération IA réussie sur toute la période d'essai ; quota réservé sous verrou transactionnel, échecs libérés, réservations anciennes expirées. Quota payant conservé.
- Aperçu IA conservé côté serveur et récupérable après rechargement. Enregistrement transactionnel et idempotent du résultat appartenant au compte, sans faire confiance au programme envoyé par le client d'essai.
- Après expiration : pas de nouvelle séance ni génération ; possibilité de terminer une séance commencée pendant l'essai. Historique, export et suppression de compte restent accessibles.
- Vérification du propriétaire sur les anciennes routes/actions de validation et de fin de séance ; recherche du poids précédent limitée au compte.
- Option écran allumé désactivée par défaut, indépendante sur téléphone et montre. Préférence locale, sans lecture/écriture Neon supplémentaire. Sur téléphone, maintien uniquement pendant la séance visible, nettoyage à la sortie/arrière-plan ; sur montre, uniquement pour une séance active et une préférence activée. Aucune nouvelle permission Android.

## Vérifications réalisées

- Lint, TypeScript et build Next.js : réussis.
- Tests serveur : 81 réussis, aucun échec. Certains nouveaux contrôles sont des tests structurels et des tests avec base simulée, pas des tests de concurrence sur une vraie base.
- Prisma : schéma validé et client généré.
- Modules Android app et wear : APK/AAB release et lint réussis ; tests unitaires release Wear réussis.
- Aucun appel IA payant nécessaire à ces vérifications.

## Avant mise en production

La migration `20260913160000_account_trial` a été testée sur une branche isolée puis appliquée en production le 13 septembre 2026, après autorisation du propriétaire. Les 24 migrations sont à jour. Une ancienne migration de métriques montre a été marquée comme appliquée après vérification que ses deux colonnes existaient déjà avec les types et la nullabilité attendus. Aucune donnée métier supprimée ni aucun essai activé automatiquement.

La branche de vérification a été conservée, avec suspension de son compute demandée après les tests. Le push et le déploiement serveur suivent cette vérification. Aucun changement des listes de testeurs, publication Play Store ou installation sur appareil n'est inclus.

Restent à vérifier sur appareils : activation/désactivation écran, arrière-plan, fin de séance, reprise après déconnexion, expiration d'essai pendant une séance, restauration d'aperçu IA et doubles validations. Les réservations concurrentes doivent aussi être testées en intégration avant publication Android.

## Play Store

Il n'est pas nécessaire de supprimer les comptes testeurs pour sortir personnellement de la bêta : quitter le programme depuis la fiche Play Store. Vérifier la synchronisation des données avant une éventuelle désinstallation/réinstallation de la version publique.

Référence : https://support.google.com/googleplay/answer/7003180?hl=fr
