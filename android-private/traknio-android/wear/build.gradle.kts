plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

android {
    namespace = "com.traknio.watch"
    compileSdk = 35

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

    fun readRootEnv(name: String): String? {
        val rootEnv = rootProject.projectDir.parentFile?.parentFile?.resolve(".env")
            ?: return null
        if (!rootEnv.exists()) return null

        return rootEnv.readLines()
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
            ?: readRootEnv(name)
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
        minSdk = 30
        targetSdk = 35
        versionCode = 25
        versionName = "0.5.8"

        val syncBaseUrl = propertyValue("TRAKNIO_SYNC_BASE_URL")
            ?: "https://www.traknio.com"
        buildConfigField("String", "TRAKNIO_SYNC_BASE_URL", buildConfigString(syncBaseUrl))
    }

    buildTypes {
        release {
            if (hasReleaseSigning) {
                signingConfig = signingConfigs.getByName("release")
            }
            isMinifyEnabled = false
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
        compose = true
    }
    composeOptions {
        kotlinCompilerExtensionVersion = "1.5.14"
    }
}

dependencies {
    implementation("androidx.activity:activity-compose:1.9.2")
    implementation("androidx.core:core-ktx:1.13.1")
    implementation("androidx.lifecycle:lifecycle-runtime-ktx:2.8.4")
    implementation("androidx.lifecycle:lifecycle-viewmodel-compose:2.8.4")
    implementation("androidx.wear.compose:compose-foundation:1.4.1")
    implementation("androidx.wear.compose:compose-material:1.4.1")
    compileOnly("androidx.compose.ui:ui-tooling-preview:1.6.8")
    implementation("org.jetbrains.kotlinx:kotlinx-coroutines-android:1.8.1")
    implementation("org.jetbrains.kotlinx:kotlinx-coroutines-play-services:1.8.1")
    implementation("com.google.android.gms:play-services-wearable:19.0.0")
    implementation("androidx.health:health-services-client:1.0.0")
    implementation("com.google.guava:guava:32.1.3-android")

    debugImplementation("androidx.compose.ui:ui-tooling:1.6.8")
    testImplementation("junit:junit:4.13.2")
}
