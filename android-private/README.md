# Traknio Android Private

Ce dossier documente le setup Android prive (non publie) pour synchroniser Health Connect et Samsung Health vers Traknio.

Version actuelle :
- Ouverture directe de l'URL configuree dans `TRAKNIO_SYNC_BASE_URL`.
- WebView Traknio complete.
- Ecran natif de synchronisation Health Connect / Samsung Health.

## 1) Ce qui est deja pret cote backend Traknio

- Endpoint sync: `POST /api/health/samsung/sync`
- Endpoint status: `GET /api/health/samsung/status`
- Auth: header `x-sync-token`
- Donnees stockees dans `ProgressMetric` (type `PERFORMANCE`, source `samsung_health` dans `notes`)

## 2) Variables a configurer (web/backend)

Dans `.env` (ou variables Vercel):

```env
SAMSUNG_SYNC_TOKEN=change_me_long_random_token
```

## 3) Payload attendu par l'endpoint sync

```json
{
  "records": [
    {
      "metric": "steps",
      "value": 7421,
      "measuredAt": "2026-05-17T08:20:00.000Z",
      "sourceDevice": "Galaxy Watch"
    },
    {
      "metric": "heart_rate",
      "value": 61,
      "measuredAt": "2026-05-17T08:21:00.000Z"
    }
  ]
}
```

`metric` supportes:
- `steps`
- `heart_rate`
- `sleep_minutes`
- `calories`
- `distance_m`

## 4) Test rapide manuel du backend (avant APK)

PowerShell:

```powershell
$token = "TON_TOKEN"
$body = @{
  records = @(
    @{ metric = "steps"; value = 8000; measuredAt = (Get-Date).ToUniversalTime().ToString("o"); sourceDevice = "Galaxy Watch" }
  )
} | ConvertTo-Json -Depth 5

Invoke-RestMethod `
  -Method POST `
  -Uri "http://localhost:3000/api/health/samsung/sync" `
  -Headers @{ "x-sync-token" = $token; "content-type" = "application/json" } `
  -Body $body
```

## 5) APK privee: procedure d'installation

Le projet Android est dans:

- `android-private/traknio-android/`

### 5.1 Ouvrir le projet

1. Ouvrir Android Studio.
2. `Open` -> `android-private/traknio-android`.
3. Laisser Android Studio synchroniser Gradle.

### 5.2 Configurer les secrets (local)

`gradle.properties` reste versionne et ne doit pas contenir de secret.
Pour ta machine, ajoute les valeurs dans `android-private/traknio-android/local.properties`, qui est ignore par Git:

```properties
TRAKNIO_SYNC_BASE_URL=https://www.traknio.com
```

En local emulator Android: utiliser `http://10.0.2.2:3000` pour parler au serveur local.

Alternative: definir ces valeurs dans les variables d'environnement avant le build.

### 5.3 Build APK

- Debug: `Build > Build APK(s)`
- Ou terminal Android Studio:

```bash
./gradlew assembleDebug
```

Sortie attendue:

- `app/build/outputs/apk/debug/app-debug.apk`

1. Creer un projet Android Kotlin (Android Studio).
2. Integrer Samsung Health Data SDK (AAR Samsung officiel).
3. Lire les donnees Samsung Health apres consentement utilisateur.
4. Poster les mesures vers `POST /api/health/samsung/sync` avec `x-sync-token`.
5. Build APK debug ou release locale.
6. Installer sur ton tel:
   - `adb install -r app-release.apk`
   - ou en ouvrant l'APK depuis le telephone.

## 6) Mise a jour APK privee (sans Play Store)

1. Incrementer `versionCode` et `versionName`.
2. Rebuild APK.
3. Reinstaller avec `adb install -r app-release.apk`.
4. Verifier:
   - `GET /api/health/samsung/status`
   - puis la page `Progres` dans Traknio.

## 7) Notes importantes

- Samsung Health SDK fonctionne sur appareil reel (pas emulateur pour ce scenario).
- Une vraie distribution large peut necessiter le process partenaire Samsung.
- Pour un usage prive perso, tu peux rester en installation manuelle.

## 8) Samsung Health SDK

Dans le projet Android:

- `SamsungHealthProvider` lit le SDK Samsung lorsqu'il est disponible.
- Si le SDK ou Samsung Health est indisponible, aucune donnée synthétique n'est créée ni synchronisée.

Fichiers concernes:

- `app/src/main/java/com/traknio/app/SamsungHealthProvider.kt`
- `app/src/main/java/com/traknio/app/MainActivity.kt`

Flux attendu:

1. Demander consentement Samsung Health.
2. Lire les mesures (steps, FC, sommeil...).
3. Construire `List<SamsungMetricRecord>`.
4. Appeler `SamsungSyncApi.push(...)`.

## 9) Samsung Health Data SDK (AAR officielle)

Si le SDK Samsung Health n'est pas resolu depuis Maven, place l'AAR officielle ici:

- `android-private/traknio-android/app/libs/`

Exemple de fichier:

- `android-private/traknio-android/app/libs/samsung-health-data-sdk.aar`

Le projet est deja configure pour charger automatiquement tous les `.aar` de `app/libs` via:

- `implementation(fileTree(mapOf("dir" to "libs", "include" to listOf("*.aar"))))`

Ensuite rebuild:

```bash
cd android-private/traknio-android
./gradlew clean :app:assembleDebug
```

Notes:
- Appareil Samsung reel requis.
- Si l'AAR n'est pas présente, l'app reste fonctionnelle sans synchroniser de données Samsung Health synthétiques.
