plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
    id("kotlin-parcelize")
}

android {
    namespace = "com.traknio.app"
    compileSdk = 36

    fun readLocalProperty(name: String): String? {
        val localProperties = rootProject.file("local.properties")
        if (!localProperties.exists()) return null

        return localProperties.readLines()
            .asSequence()
            .map { it.trim() }
            .filter { it.isNotBlank() && !it.startsWith("#") }
            .firstOrNull { it.startsWith("$name=") }
            ?.substringAfter("=")
            ?.trim()
            ?.trim('"', '\'')
            ?.takeIf { it.isNotBlank() }
    }

    fun propertyValue(name: String): String? {
        return (project.findProperty(name) as String?)?.trim()?.takeIf { it.isNotBlank() }
            ?: System.getenv(name)?.trim()?.takeIf { it.isNotBlank() }
            ?: readLocalProperty(name)
    }

    fun buildConfigString(value: String) = "\"${value.replace("\\", "\\\\").replace("\"", "\\\"")}\""

    val releaseStoreFile = propertyValue("TRAKNIO_RELEASE_STORE_FILE")
    val releaseStorePassword = propertyValue("TRAKNIO_RELEASE_STORE_PASSWORD")
    val releaseKeyAlias = propertyValue("TRAKNIO_RELEASE_KEY_ALIAS")
    val releaseKeyPassword = propertyValue("TRAKNIO_RELEASE_KEY_PASSWORD")
    val hasReleaseSigning = listOf(
        releaseStoreFile,
        releaseStorePassword,
        releaseKeyAlias,
        releaseKeyPassword,
    ).all { !it.isNullOrBlank() }

    signingConfigs {
        create("release") {
            if (!releaseStoreFile.isNullOrBlank()) {
                storeFile = rootProject.file(releaseStoreFile)
            }
            storePassword = releaseStorePassword
            keyAlias = releaseKeyAlias
            keyPassword = releaseKeyPassword
        }
    }

    defaultConfig {
        applicationId = "com.traknio.app"
        minSdk = 29
        targetSdk = 36
        versionCode = 27
        versionName = "0.5.8"

        testInstrumentationRunner = "androidx.test.runner.AndroidJUnitRunner"

        val syncBaseUrl = propertyValue("TRAKNIO_SYNC_BASE_URL")
            ?: "https://www.traknio.com"
        val googlePlayProductId = propertyValue("GOOGLE_PLAY_SUBSCRIPTION_PRODUCT_ID")
            ?: "traknio_premium"
        val googlePlayPackageName = propertyValue("GOOGLE_PLAY_PACKAGE_NAME")
            ?: "com.traknio.app"
        buildConfigField("String", "TRAKNIO_SYNC_BASE_URL", buildConfigString(syncBaseUrl))
        buildConfigField("String", "GOOGLE_PLAY_SUBSCRIPTION_PRODUCT_ID", buildConfigString(googlePlayProductId))
        buildConfigField("String", "GOOGLE_PLAY_PACKAGE_NAME", buildConfigString(googlePlayPackageName))
    }

    buildTypes {
        release {
            if (hasReleaseSigning) {
                signingConfig = signingConfigs.getByName("release")
            }
            isMinifyEnabled = true
            isShrinkResources = true
            proguardFiles(
                getDefaultProguardFile("proguard-android-optimize.txt"),
                "proguard-rules.pro",
            )
        }
    }
    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
    kotlinOptions {
        jvmTarget = "17"
    }
    buildFeatures {
        buildConfig = true
        viewBinding = true
    }
}

dependencies {
    implementation(fileTree(mapOf("dir" to "libs", "include" to listOf("*.aar"))))
    implementation("androidx.core:core-ktx:1.13.1")
    implementation("androidx.appcompat:appcompat:1.7.0")
    implementation("androidx.fragment:fragment:1.8.9")
    implementation("com.google.android.material:material:1.12.0")
    implementation("androidx.activity:activity-ktx:1.9.2")
    implementation("androidx.health.connect:connect-client:1.1.0")
    implementation("androidx.work:work-runtime-ktx:2.9.1")
    implementation("com.google.code.gson:gson:2.13.2")
    implementation("org.jetbrains.kotlinx:kotlinx-coroutines-android:1.8.1")
    implementation("org.jetbrains.kotlinx:kotlinx-coroutines-play-services:1.8.1")
    implementation("com.android.billingclient:billing:9.1.0")
    implementation("com.google.android.gms:play-services-wearable:19.0.0")
}
