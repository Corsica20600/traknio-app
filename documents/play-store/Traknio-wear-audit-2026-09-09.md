**Audit Traknio Wear OS — 9 septembre 2026 — candidat 0.5.8 (29)**

**Candidat 29 : build, tests, audit AAB et parcours Galaxy Watch Ultra PASS. Vérification Play Console en cours ; aucune soumission à ce stade.** Le build local complet du candidat 29, ses 18 tests JUnit release et le lint (0 erreur, 24 avertissements, 2 indications) ont réussi. Les avertissements WearRecents et StaticFieldLeak de l'ajout sont résolus. Restent principalement les suggestions de mise à jour des dépendances, des conseils KTX et l'icône launcher non circulaire existante (splash conservé conformément à la demande).

AAB livré : `documents/play-store/Traknio-wear-0.5.8-29.aab`.
APK pour test manuel : `documents/play-store/Traknio-wear-0.5.8-29.apk`.
SHA-256 AAB : `cbc4921181f3da865ad347dbfa4f20f705264e61d45617d370028fcd8dcc7d57`.
Le manifest fusionné 29, les rapports JUnit/lint et l'inspection de l'artefact sont enregistrés dans `wear-audit-2026-09-09/`. Signature vérifiée et zipalign APK 16 KB réussi. Le 9 septembre, le propriétaire confirme le parcours physique réussi sur Galaxy Watch Ultra, avec versionCode=29/minSdk=30/targetSdk=35 vérifiés par ADB. Ces résultats physiques sont rapportés par le propriétaire ; Codex a revérifié les rapports locaux et le véritable AAB. Aucun appareil ADB connecté pendant la passe finale. La soumission reste conditionnée aux contrôles Play Console.

Le téléphone reste configuré en **27 / 0.5.8**. Les modifications préexistantes du dépôt ont été conservées : comparaison de chaque section du diff initial avec le diff final, aucune section préexistante modifiée par cet audit. Le backend, Health Connect téléphone, les fichiers de transport Data Layer, les intervalles de polling, les mutations de séance et les données existantes n'ont pas été modifiés.

**Rejet et correction**

Play Console confirme le motif « Activité en cours manquante », appliqué au bundle **28 (0.5.8), target 35**, production Wear. Le service `ExerciseTrackingService` ne créait qu'une notification `setOngoing(true)`, sans AndroidX `OngoingActivity`, sans `PendingIntent` de retour, sans statut. Il dépendait également de l'autorisation des capteurs. Cela explique l'absence d'intégration aux surfaces système. Aucune tuile n'est implémentée : l'exigence conditionnelle concernant les tuiles ne s'applique pas.

Ajout de `androidx.wear:wear-ongoing:1.1.0`, version stable recommandée. Son AAR officiel a été inspecté : minCompileSdk 34, AGP minimum 8.1.1, pas de `.so`, compatible avec compileSdk 35 / AGP 8.13.2 / core 1.13.1 du projet. Aucune montée globale de Compose ou d'AGP.

Une notification unique **1742**, canal existant `traknio_exercise` d'importance LOW, est partagée avec le service santé. Icône haltère vectorielle blanche sur fond transparent, catégorie workout, statut textuel, description accessible, intent explicite immutable/update-current vers `MainActivity`, flag single-top uniquement (les flags new-task/clear-top ont été retirés après lecture de WearRecents). L'activité launcher est `singleTop`. `OngoingActivity.apply()` précède la construction de la notification ; `update()` met à jour les surfaces système et la notification existante. Pas de son répété ni de notification miroir téléphone.

| État reçu / action | Comportement implémenté |
| --- | --- |
| Chargement sans séance réelle | Aucun démarrage d'indicateur |
| IN_PROGRESS | Indicateur avec exercice et numéro de série |
| Repos / pause du repos | Indicateur maintenu, texte de repos ou de pause |
| Expiration du repos dans le ViewModel | Le statut revient à la série ; aucun polling supplémentaire |
| READY_TO_COMPLETE | « Séance à terminer », reste ongoing jusqu'à la fin explicite |
| Home / retour au cadran | La séance n'est pas terminée ; la notification reste présente |
| Appui indicateur / notification | Retour à l'activité de séance existante ; restauration habituelle si le processus a disparu |
| Fin optimiste locale, fin confirmée ou annulation reçue | Annulation de la notification et arrêt du service avant les appels réseau de finalisation |
| Réponse session_not_found | Suppression de l'indicateur, sans le recréer depuis le dernier état UI lors d'une reprise |
| Message tardif ou d'une autre séance | Filtrage par identifiant/révision ; pas de résurrection par événement optimiste après fin |
| Capteurs refusés | L'Ongoing Activity reste indépendante ; aucun FGS santé lancé sans ses permissions |
| Notifications refusées | Aucun contournement du choix système ; l'affichage de l'indicateur ne peut pas être garanti |

Le service n'est plus redémarré automatiquement à partir d'un ancien snapshot capteur (`START_NOT_STICKY`). Son démarrage est réservé à une activité visible ou un service déjà en cours, avec gestion des refus système. Son type `health` est passé à Android à partir de l'API 34. La fermeture terminale utilise `STOP_FOREGROUND_REMOVE`; la perte du service sans fin de séance détache sa notification. Les coroutines sont annulées et une fin reçue sans ViewModel déclenche aussi l'arrêt de la collecte santé.

**Exception limitée au récepteur Wear :** `WatchWearListenerService` transmet les événements déjà reçus au gestionnaire d'affichage, y compris les réponses relayées. C'est nécessaire pour retirer la notification lorsque le ViewModel n'existe plus. Aucun format, chemin, transport, envoi ou rythme Data Layer n'est changé. Les métadonnées locales de notification sont stockées séparément, sans jeton ni mesure de santé. Une fin distante hors connexion ne peut être connue avant réception de son état ; aucune promesse de suppression distante instantanée hors réseau.

**Matrice de conformité**

| Contrôle | Résultat de l'audit et action |
| --- | --- |
| WO-V1 / V14 : polices | Plusieurs textes de 7–11 sp trouvés. Textes portés à au moins 12 sp, toujours en sp. Défilement ajouté aux contenus fixes pour éviter les débordements à grande police. Validation visuelle 192/227 dp encore requise. |
| WO-V2 : cibles tactiles | Boutons 34/38 dp et retour à zone superposée trouvés. Boutons portés à 48 dp ; retours explicites dans le flux ; boutons de l'éditeur contenus dans la petite montre. |
| WO-V3 : retour | Swipe-to-dismiss raccordé au retour Android ; retour hiérarchique série/détail/liste et éditeur. Quitter la séance active met la tâche en arrière-plan. |
| WO-V4 : ongoing | Implémentation réelle ajoutée ; cadran, récents, retour à la séance et suppression finale PASS sur Galaxy Watch Ultra, selon le test du propriétaire. |
| WO-V5 : reprise | Destination et édition utilisent rememberSaveable ; task singleTop. Données réconciliées par le mécanisme existant. Reprise après destruction du processus à tester. |
| WO-V6 : launcher | Un MAIN/LAUNCHER Traknio, nom et icône existants conservés. |
| WO-V8 : scrollbar | PositionIndicator ajouté aux listes et contenus défilants. |
| WO-V13 : noir | Fond radial bleu remplacé par noir ; couleurs des contrôles conservées. Fond de fenêtre également noir. |
| WO-V15 : splash | Correction 28 conservée : installSplashScreen avant super.onCreate, thème noir, drawable centré de 48×48 dp, même icône que le launcher. Chargement initial identique sans texte, timer ni seconde Activity. Fond noir et icône centrée PASS sur Galaxy Watch Ultra selon le propriétaire ; dimensions 48 dp confirmées dans les ressources, conservées sans modification. Aucun double splash signalé. |
| WO-V16 : rond | Largeurs de cellules adaptatives, marges verticales sûres, contenus pouvant défiler. Pas de certification visuelle sans rendu du candidat. |
| WO-P1 : SDK | Source Wear : compileSdk **35**, targetSdk **35**, minSdk **30**. Bundle 28 confirme min 30/target 35. Le bundle 29 confirme ces valeurs. |
| WO-P2 : stabilité | Build, tests unitaires Android 29, installation et parcours physique Galaxy Watch Ultra PASS. |
| WO-P5 / P6 : compagnon/auth | Non-standalone cohérent : association et séance via téléphone, aucun formulaire utilisateur/mot de passe sur la montre. Association, séance et validation de séries PASS sur Galaxy Watch Ultra selon le propriétaire ; téléphone inchangé par cet audit. |
| Batterie / écran / ambient | Suppression du maintien permanent de l'écran allumé et de WAKE_LOCK inutilisée. L'écran suit les délais système. Aucune collecte de pas/GPS, aucun nouveau ticker/polling. Ambient système et reprise après écran éteint à tester. |
| Santé | Seuls HEART_RATE_BPM et CALORIES_TOTAL demandés à Health Services selon ses capacités : fréquence cardiaque et calories de la séance. Aucun Steps/StepsCadence/READ_STEPS. Calculs de métriques et logique métier préexistants conservés. |
| FGS / notifications | Service health existant non exporté, permissions contrôlées, canal LOW, ongoing + touch intent, arrêt terminal. À tester avec refus/révocation des permissions et Android 14/15. Le système reste maître de la suppression/désactivation des notifications. |
| WO-G7 : packaging | Même applicationId com.traknio.app. Certificat de signature identique sur les AAB locaux téléphone 27 et Wear 28 ; signature du 29 vérifiée également. |
| WO-G1/G2/G3/G5/G8 | Déclarations, accès reviewer et captures Play : checklist manuelle ci-dessous. Les captures doivent être renouvelées après les ajustements visuels. |
| Tuiles / cadrans / complications | Aucun composant de ce type. V9/V10/V12, P3/P7/P8/P10 et G4/G6/G9–G12 non applicables. |
| Critères retirés | V7/V11, P4/P9 ne constituent plus des exigences actives. |

L'audit des règles Wear ne remplace pas l'examen Google ni les tests de fonctionnement. Les contrôles généraux de compte, facturation, backend et du téléphone restent hors modification, conformément au périmètre demandé.

**Manifest et permissions**

Manifest source candidat : watch required=true, standalone=false, MainActivity exportée comme launcher/singleTop ; ExerciseTrackingService exporté=false/type=health ; récepteur Wear existant conservé. Pas de feature XR.

Permissions source finales prévues :

- INTERNET : échanges existants de séance.
- VIBRATE : retours haptiques.
- POST_NOTIFICATIONS : affichage de l'Ongoing Activity, demandé pendant la séance sur API 33+.
- FOREGROUND_SERVICE et FOREGROUND_SERVICE_HEALTH : suivi santé actif.
- ACTIVITY_RECOGNITION : calories Health Services ; aucun relevé de pas.
- BODY_SENSORS : fréquence cardiaque pour l'application ciblant API 35.

Suppression de WAKE_LOCK sans utilisation dans le module et de READ_HEART_RATE ajouté prématurément. Suppression du maxSdkVersion=35 de BODY_SENSORS : la migration granulaire dépend du **targetSdk**, pas seulement de la version du système. Un futur passage à target 36 devra migrer ensemble manifest et demande runtime. La permission signature `com.traknio.app.DYNAMIC_RECEIVER_NOT_EXPORTED_PERMISSION` était ajoutée par AndroidX au manifest fusionné 28 ; sa présence dans le 29 est confirmée.

Le manifest fusionné et le manifest binaire du candidat **29** ont été inspectés. Les huit permissions fusionnées sont les sept permissions source listées ci-dessus et la permission signature AndroidX. Watch required=true, standalone=false, MainActivity singleTop et service health non exporté sont confirmés.

**Natif, 64 bits et 16 KB**

Le Wear n'est **pas uniquement Java/Kotlin** : Compose amène `androidx.graphics:graphics-path:1.0.1`, contenant `libandroidx.graphics.path.so`.

Inspection directe de `Traknio-wear-0.5.8-28.aab` : quatre bibliothèques, une par ABI `armeabi-v7a`, `arm64-v8a`, `x86`, `x86_64`. Parité 32/64 bits vérifiée, tous les segments LOAD alignés à **16384 octets**, GNU_RELRO présent, BundleConfig **PAGE_ALIGNMENT_16K**. `bundletool validate` réussit. `jarsigner -verify` réussit avec les avertissements habituels de certificat autosigné et d'absence d'horodatage. Empreinte SHA-256 du certificat commun téléphone/Wear : `1E:F7:44:14:85:CD:C5:0C:3D:6A:05:82:CC:A0:6F:6D:15:B2:96:6B:C7:0B:56:DB:7E:DF:D5:01:5D:DA:66:E3`.

SHA-256 de l'AAB 28 : `b0e123ed3d01447f8f634bc8b5957d6cb0458597a0adc051bddcc12e8c3e35c5`.

La conformité structurelle de l'ancien natif est établie, sans changement de dépendance native nécessaire. Aucun test d'exécution 16 KB n'a été réalisé. **Ces résultats sont également confirmés sur le nouvel AAB 29** (mêmes bibliothèques natives et empreintes). Le script `scripts/audit-wear-bundle.py` contrôle l'artefact réel et rejette un code de version inattendu.

La source officielle Wear confirme le **15 septembre 2026 pour le 64 bits**. La page générale 16 KB consultée annonce actuellement une échéance différente, le **1er février 2027**. Il ne faut pas confondre ces deux dates ; la compatibilité 16 KB a néanmoins été contrôlée maintenant.

**Play Console — constats en lecture seule**

Inventaire complet : 22 bundles importés, codes **7 à 28 inclus**. **29 libre au moment du contrôle**, choisi pour le candidat, versionName **0.5.8**. Aucun import effectué pendant l'audit.

Wear actif, distribution séparée : production Wear 28 rejetée, tests fermés Alpha Wear 24 encore disponible, tests internes Wear 10 encore accessible. Android XR actif, mais configuré pour **utiliser les artefacts et le canal mobile**, sans canal XR dédié. Ce n'est pas une configuration XR spécifique au Wear. Aucun réglage modifié.

Checklist avant nouvelle soumission :

- [ ] Générer et vérifier le candidat 29, puis refaire l'inventaire des codes si une autre soumission a eu lieu.
- [ ] Remplacer le 28 dans la release Wear et vérifier les anciens artefacts encore actifs de **tous** les canaux Wear, notamment 24/10 ; ne pas conserver un artefact non conforme dans une release envoyée à examen.
- [ ] Garder le canal et le bundle téléphone 27 inchangés ; ne pas associer le Wear à XR.
- [ ] Vérifier les déclarations FGS health, santé/capteurs et sécurité des données : fréquence cardiaque/calories et usages réels, aucune déclaration Steps/StepsCadence.
- [ ] Vérifier politique de confidentialité, suppression de compte/données, URLs opérationnelles et concordance avec les usages réels. Aucun changement de backend prévu par cet audit.
- [ ] Fournir un compte reviewer fonctionnel avec accès complet, les instructions d'association téléphone/montre et une séance accessible.
- [ ] Remplacer les captures Wear par des captures du candidat validé : carré 1:1, interface seule, pas de cadre/masquage/transparence ; conserver une description française exacte des fonctions.
- [ ] Expliquer au reviewer le parcours séance → cadran → indicateur/récents → reprise → fin, avec vidéo de démonstration si utile.
- [ ] Contrôler les rapports de pré-lancement et tous les messages de conformité avant de soumettre manuellement.

**Tests et livraison**

| Commande / contrôle | Résultat |
| --- | --- |
| npm run typecheck | OK |
| npm run lint | OK, sortie sans erreur |
| npm run test | 53/53 OK |
| npm run build | OK, 68 pages générées |
| npx prisma validate | OK, schéma inchangé |
| git diff --check | OK |
| Inspection AAB 28 / ABI / permissions / manifest / signature | Effectuée, preuves JSON |
| Tests JUnit Wear existants et nouveaux | 18/18 OK |
| Build Wear release 29 | OK depuis PowerShell utilisateur ; échec loopback initial limité au contexte Codex |
| Manifest merged et AAB 29 | Inspectés, contrôles structurels OK, signature vérifiée |
| App téléphone | Configuration 27/0.5.8 et artefact existant contrôlés en lecture seule ; aucun build/modification |
| Galaxy Watch Ultra | PASS rapporté par le propriétaire sur le véritable candidat 29, version vérifiée par ADB |

11 nouveaux cas JUnit couvrent états actifs/terminaux, repos/pause, séries, fin optimiste, rollback, événements périmés, autre séance et absence de résurrection. Les tests de permissions couvrent aussi target 35 sur API 36. Ils ont tous été exécutés avec succès dans les rapports release du 9 septembre à 13:50 UTC.

Commande locale exacte, depuis `C:\dev\traknio\traknio-app\android-private\traknio-android` :

```sh
./gradlew :wear:bundleRelease --no-daemon --stacktrace
```

Puis, dans le même dossier :

```sh
./gradlew :wear:testReleaseUnitTest :wear:lintRelease :wear:assembleRelease --no-daemon --stacktrace
```

Aucun changement de JVM, pare-feu, options réseau, daemon ou compilation alternative n'a été effectué pour contourner l'erreur.

Après réussite, depuis la racine du dépôt, utiliser Google bundletool-all.jar avec :

```sh
python scripts/audit-wear-bundle.py android-private/traknio-android/wear/build/outputs/bundle/release/wear-release.aab --bundletool CHEMIN_VERS_BUNDLETOOL.jar --version-code 29 --output documents/play-store/wear-audit-2026-09-09/artifact-29.json
```

Vérifier également la signature, le manifest fusionné, l'APK avec zipalign -c -P 16 4 et le fonctionnement sur appareil. Le chemin de livraison demandé est **`documents/play-store/Traknio-wear-0.5.8-29.aab`**, ce fichier a été copié depuis le build 29 validé structurellement, sans renommer le bundle 28. L'APK de test a également été copié.

**Parcours Galaxy Watch Ultra — PASS rapporté par le propriétaire le 9 septembre 2026**

Appareil : Galaxy Watch Ultra. Installation réelle confirmée par ADB : versionCode 29, minSdk 30, targetSdk 35.

| Vérification physique | Résultat |
| --- | --- |
| Splash noir et icône centrée | PASS |
| Lancement et association téléphone/montre | PASS |
| Démarrage d'une séance réelle et validation des séries | PASS |
| Retour au cadran, Ongoing Activity visible | PASS |
| Activité visible dans les récents | PASS |
| Appui sur l'indicateur, retour à la séance | PASS |
| Maintien de l'indicateur pendant le repos et reprise | PASS |
| Fin de séance, disparition de l'indicateur | PASS |
| Absence de notification résiduelle | PASS |

Le motif « Missing ongoing activity » est corrigé et son parcours validé sur appareil réel. Aucun changement UX supplémentaire n'est effectué pendant cette finalisation.

Couverture complémentaire non déclarée comme exécutée : nouvelle séance après fin, annulation distante, refus/révocation des permissions, destruction du processus, polices maximales et petite montre 192 dp, exécution sur système à pages 16 KB. Les contrôles structurels 16 KB réussis ne sont pas présentés comme un test d'exécution sur un tel système.

**Fichiers modifiés par cet audit**

Dans `android-private/traknio-android/wear/` : `build.gradle.kts`, `src/main/AndroidManifest.xml`, `MainActivity.kt`, `ExerciseTrackingService.kt`, `ExercisePermissions.kt`, `WatchViewModel.kt`, `WatchWearListenerService.kt`, `WearDimensions.kt`, `WearTypography.kt`, `res/values/colors.xml`, `ExercisePermissionsTest.kt`. Nouveaux : `WorkoutOngoingActivity.kt`, `WorkoutOngoingState.kt`, `WearScrollLayouts.kt`, `res/drawable/ic_workout_ongoing.xml`, `WorkoutOngoingStateTest.kt`. Les Kotlin sont sous leurs dossiers `src/main/java/com/traknio/watch/` ou `src/test/java/com/traknio/watch/` respectifs.

Ajout du script d'inspection, du présent rapport et des preuves sous `documents/play-store/wear-audit-2026-09-09/`. Suppressions ciblées expliquées : maintien permanent de l'écran, permissions devenues inutiles/inadaptées, fond radial et hitbox de retour superposée. Aucun fichier téléphone/backend modifié, aucune donnée existante effacée.

Le commit de finalisation est limité aux changements Wear de cet audit et aux preuves. Les modifications préexistantes de transport/métriques, téléphone et backend restent exclues. Le binaire testé provient de la copie de travail, qui contient ces modifications préexistantes : son empreinte SHA-256 identifie exactement le candidat validé ; le seul commit d'audit ne prétend pas reconstituer toutes ces modifications locales. Aucun nouveau build ni changement UX après validation physique.

Sources officielles consultées : [qualité Wear OS](https://developer.android.com/docs/quality-guidelines/wear-app-quality), [Ongoing Activity](https://developer.android.com/training/wearables/notifications/ongoing-activity), [target API Google Play](https://support.google.com/googleplay/android-developer/answer/11926878?hl=en), [64 bits Wear](https://android-developers.googleblog.com/2026/04/get-your-wear-os-apps-ready-for-64-bit-requirement.html), [pages 16 KB](https://developer.android.com/guide/practices/page-sizes), [permissions Health Services](https://developer.android.com/health-and-fitness/health-services/permissions), [changements Android 16 ciblé](https://developer.android.com/about/versions/16/behavior-changes-16), [ambient système](https://developer.android.com/training/wearables/always-on). API et compatibilité de wear-ongoing vérifiées également dans l'AAR, le POM et les sources AndroidX officiels.
