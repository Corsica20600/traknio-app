# Essai limité et activation Google Play

Mise en service effectuée le **16 septembre 2026**. Les changements sont côté Next.js : aucune nouvelle version Android/Wear OS et aucune migration.

## État de la mise en service

| Élément | Résultat |
| --- | --- |
| Site public | https://www.traknio.com — HTTP 200 |
| Déploiement Vercel | `dpl_BrdbFoLxaxoYQvMy61sM9w6YacY9` — READY, promu en production |
| Version déployée | https://traknio-ckir3f773-longinerwan-1236s-projects.vercel.app |
| Source | Copie isolée des fichiers suivis et des nouveaux correctifs ; fichiers locaux sans rapport exclus. Déploiement initial par CLI. Les correctifs et ce guide sont regroupés dans le commit Git `fix: enforce trial scope and sync Google Play subscriptions`. |
| Google Play RTDN | Activé et enregistré pour `com.traknio.app` |
| Test Google Play → Pub/Sub → Traknio | POST reçu le 16/09/2026 à **12:37:45,82, heure de Paris**, réponse **204**, confirmée dans les journaux Vercel |
| Sans authentification / jeton invalide | Deux refus **401** confirmés à 12:37:53, heure de Paris |
| Contrôles du code | Suite de 111 tests réussie, lint, TypeScript, compilation locale et validation Prisma ; compilation Vercel réussie |

Le test de notification valide le transport et l’authentification. Il ne simule pas un achat et ne valide pas, à lui seul, un renouvellement facturé : le parcours sur téléphone décrit plus bas reste à effectuer avec un compte de test Google Play.

## Configuration appliquée

| Paramètre | Valeur |
| --- | --- |
| Projet Google Cloud | `traknio` |
| Sujet | `projects/traknio/topics/traknio-play-rtdn` |
| Abonnement Pub/Sub | `projects/traknio/subscriptions/traknio-play-rtdn-push` — actif |
| Expéditeur autorisé sur le sujet | `google-play-developer-notifications@system.gserviceaccount.com`, rôle **Diffuseur Pub/Sub** (`roles/pubsub.publisher`), limité à ce sujet |
| Destination HTTPS | `https://www.traknio.com/api/billing/google-play/notifications` |
| Authentification | OIDC activée |
| Compte de service existant | `traknio-play-billing@traknio.iam.gserviceaccount.com` |
| Audience OIDC | `https://www.traknio.com/api/billing/google-play/notifications` |
| Format des messages | Enveloppe Pub/Sub conservée ; désencapsulation désactivée |
| Contenu activé dans Play Console | Achats annulés et abonnements uniquement |
| Délai de confirmation | 30 secondes |
| Nouvelles tentatives | Intervalle exponentiel, minimum 10 secondes, maximum 600 secondes |
| Conservation des messages non confirmés | 7 jours |
| Messages confirmés conservés | Non |
| Expiration de l’abonnement Pub/Sub | Aucune |
| File de lettres mortes | Non configurée |

Accès directs : [configuration Play Console](https://play.google.com/console/u/0/developers/7453420792704855353/app/4975304444164698059/monetization-setup), [sujet Pub/Sub](https://console.cloud.google.com/cloudpubsub/topic/detail/traknio-play-rtdn?project=traknio), [abonnement push](https://console.cloud.google.com/cloudpubsub/subscription/detail/traknio-play-rtdn-push?project=traknio&tab=details), [déploiement Vercel](https://vercel.com/longinerwan-1236s-projects/traknio/BrdbFoLxaxoYQvMy61sM9w6YacY9).

## Périmètre de l’essai

L’essai web ou Google Play autorise un seul programme modifiable, une génération IA au total et ses séances sur téléphone/montre. Pour un compte existant, le programme le plus ancien (création puis ID) est retenu, même archivé. Les autres programmes sont conservés. La suppression d’un programme requiert un abonnement pour empêcher de réinitialiser cette limite. Le sélecteur d’exercices de l’éditeur reste utilisable ; le catalogue autonome, le coach, l’assistant et le suivi avancé requièrent un accès complet. L’historique et l’export restent accessibles par leurs routes existantes.

## Reproduire la configuration

La configuration ci-dessous est déjà appliquée. Le serveur contrôle désormais la date de fin, y compris pour ACTIVE. Les notifications ne rejouent pas rétroactivement les renouvellements manqués : un compte dont la date stockée est périmée doit réactualiser son abonnement. Le contrôle agrégé effectué sur la base configurée localement n’a trouvé aucun compte ACTIVE expiré hors accès offerts ; aucune donnée de compte n’a été modifiée pendant ce contrôle.

1. Dans Google Cloud, créer un sujet Pub/Sub et autoriser `google-play-developer-notifications@system.gserviceaccount.com` à publier sur ce sujet.
2. Créer un abonnement push **authentifié**, avec enveloppe Pub/Sub, vers `https://www.traknio.com/api/billing/google-play/notifications` (adapter à l’origine configurée dans `NEXT_PUBLIC_SITE_URL`). Utiliser cette URL exacte comme audience OIDC.
3. Choisir comme identité push le compte de service déjà configuré pour la vérification Google Play (`client_email` de `GOOGLE_PLAY_SERVICE_ACCOUNT_JSON`, ou `GOOGLE_PLAY_SERVICE_ACCOUNT_EMAIL`). Le serveur vérifie la signature Google, l’audience, l’expiration, l’identité et l’adresse vérifiée. Accorder au service agent Pub/Sub le droit nécessaire de créer les jetons OIDC de ce compte, selon la documentation Google.
4. Dans Play Console, renseigner ce sujet pour les notifications développeur en temps réel, puis envoyer une notification de test : réponse attendue 204. Les requêtes non authentifiées doivent répondre 401.
5. Avec un compte test Play, vérifier : achat en essai limité, renouvellement vers accès complet, annulation pendant l’essai toujours limitée, expiration, période de grâce et restauration. Vérifier également le démarrage et la fin d’une séance sur téléphone et montre.

La route relit toujours l’état auprès de Google, sérialise les mises à jour par compte et ignore les notifications d’un jeton remplacé. Seul le hash du jeton est conservé. Un achat initial inconnu reste attaché au compte par la route authentifiée `/api/billing/google-play/verify`. Une erreur temporaire de vérification renvoie 503 pour déclencher la nouvelle livraison Pub/Sub.

Les comptes existants peuvent relancer la vérification depuis Paramètres → Vérifier mon abonnement Google Play sur Android. Ce bouton ouvre l’écran natif existant, qui relit aussi les achats déjà détenus ; il peut également présenter l’offre Google Play. Le renouvellement automatique sera ensuite transmis par Pub/Sub.

## Test sur téléphone restant à effectuer

Utiliser un compte de test de licence Google Play, distinct d’un compte bénéficiant d’un accès offert Traknio. Vérifier que Google affiche un achat de test avant de le confirmer.

1. Ouvrir l’offre mensuelle éligible à l’essai, puis confirmer l’achat de test. Pendant l’essai, vérifier qu’un seul programme peut être enregistré et que la seconde création est refusée.
2. Modifier ce programme, démarrer ses séances sur téléphone puis sur montre, valider des séries et terminer la séance. Vérifier que les deux appareils retrouvent le même état.
3. Ouvrir le catalogue autonome, le coach/assistant et le suivi avancé : ces accès doivent rester verrouillés pendant l’essai.
4. Laisser Google Play faire passer l’achat de test à sa phase payante, sans rouvrir l’écran de paiement. Après réception de la notification, recharger Traknio : l’accès complet doit être disponible et la date d’échéance actualisée.
5. Tester séparément l’annulation pendant l’essai : l’accès reste limité jusqu’à l’échéance, sans devenir complet. Tester aussi l’expiration et la restauration via le bouton des paramètres.

Les abonnements de test peuvent utiliser des durées accélérées décidées par Google. Ne pas modifier les dates ou les droits en base pour simuler un succès de ce parcours.

## Vérification et dépannage

- **Google Play** : le bouton « Envoyer une notification test » vérifie la publication. Pour confirmer toute la chaîne, contrôler aussi le statut HTTP dans Vercel.
- **Vercel** : filtrer les journaux du projet sur `/api/billing/google-play/notifications`. Attendre **204** pour une notification valide ; **401** indique un défaut d’authentification, **400** un message ou package invalide, **503** une configuration absente ou une vérification temporairement impossible.
- **Pub/Sub** : surveiller les échecs de livraison et l’âge du plus ancien message non confirmé. Les nouvelles tentatives sont automatiques, mais les messages non confirmés ne sont conservés que 7 jours. Aucun dispositif d’alerte externe n’a été ajouté dans cette intervention.
- **401 sur un message Google** : comparer l’audience, le compte de service push et le compte configuré dans Vercel. Ne pas désactiver l’authentification pour contourner le problème.
- **503** : vérifier les droits Google Play du compte serveur, l’accès à l’API et la disponibilité de la base. Ne jamais copier les clés privées ni les jetons d’achat dans les journaux.

Commande de lecture des journaux, depuis le dépôt lié à Vercel :

```powershell
vercel logs --environment production --no-branch --since 30m --query '/api/billing/google-play/notifications' --limit 30
```

## Retour arrière

Le précédent déploiement public était `https://traknio-qj2daqefj-longinerwan-1236s-projects.vercel.app`. En cas de régression confirmée, il peut être remis en production avec Vercel. Il ne possède pas la nouvelle route de notifications : les messages resteraient en attente et seraient retentés par Pub/Sub tant que la route ne répond pas correctement, dans la limite de conservation. Ne pas supprimer le sujet ou l’abonnement pour effectuer un retour arrière.

## Sources

- [Notifications Google Play](https://developer.android.com/google/play/billing/rtdn-reference)
- [Configurer les notifications](https://developer.android.com/google/play/billing/getting-ready#configure-rtdn)
- [Authentification des notifications push Pub/Sub](https://cloud.google.com/pubsub/docs/authenticate-push-subscriptions)
- [État et phase d’une souscription Google Play](https://developers.google.com/android-publisher/api-ref/rest/v3/purchases.subscriptionsv2)
