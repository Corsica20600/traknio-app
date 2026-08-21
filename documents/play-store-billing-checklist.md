# Traknio - Play Store et abonnement

## Produit Google Play

- App Android: Traknio
- Package actuel: `com.traknio.app`
- Produit abonnement: `traknio_premium`
- Base plan mensuel: `monthly`
- Prix cible: `4,99 EUR / mois`
- Piste de test recommandee: test interne, puis test ferme.

## Variables Vercel a ajouter

Production, puis Preview si besoin:

```env
GOOGLE_PLAY_PACKAGE_NAME=com.traknio.app
GOOGLE_PLAY_SUBSCRIPTION_PRODUCT_ID=traknio_premium
GOOGLE_PLAY_SERVICE_ACCOUNT_JSON={"type":"service_account",...}
```

Alternative au JSON complet:

```env
GOOGLE_PLAY_SERVICE_ACCOUNT_EMAIL=...
GOOGLE_PLAY_SERVICE_ACCOUNT_PRIVATE_KEY=...
```

Le service account doit avoir acces a l'API Google Play Android Developer pour verifier les achats.

## Flux technique

1. L'utilisateur est connecte avec Google dans Traknio.
2. Depuis l'app Android, le bouton `Activer avec Google Play` ouvre l'activite native Billing.
3. Android interroge Google Play pour `traknio_premium`.
4. Android lance le flux d'achat Google Play.
5. Android envoie `purchaseToken` au serveur Traknio avec les cookies de session.
6. Le serveur verifie le token avec `purchases.subscriptionsv2.get`.
7. Neon stocke uniquement le hash du purchase token et met `subscriptionStatus` a jour.
8. Android acknowledge l'achat apres validation serveur.

## Tests Play Console

- Ajouter ton compte Google en license tester.
- Publier un AAB sur une piste de test.
- Activer l'abonnement et son base plan.
- Attendre la propagation Google Play.
- Installer depuis le lien de test ou sideload avec package identique.
- Tester achat, restauration, annulation, renouvellement de test.

## Nettoyage avant publication

- Valider définitivement `applicationId = "com.traknio.app"` avant la première publication Play Store.
- Une fois publie sur Play Store, l'identifiant package ne doit plus changer.
- Supprimer Stripe de l'UX Android publique si Google Play exige l'achat exclusivement via Play Billing.
