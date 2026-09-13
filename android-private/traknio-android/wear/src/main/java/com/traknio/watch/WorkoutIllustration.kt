package com.traknio.watch

import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.os.SystemClock
import android.util.LruCache
import androidx.compose.foundation.Image
import androidx.compose.foundation.layout.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.unit.dp
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import java.io.ByteArrayOutputStream
import java.net.HttpURLConnection
import java.net.URL

/** Public asset requests only: never attach the watch token or the phone cookies. */
private object WorkoutImageCache {
    val images = object : LruCache<String, Bitmap>(2 * 1024 * 1024) {
        override fun sizeOf(key: String, value: Bitmap) = value.allocationByteCount
    }
    val failures = LruCache<String, Long>(32)
    suspend fun load(path: String): Bitmap? = withContext(Dispatchers.IO) {
        images.get(path)?.let { return@withContext it }
        if (failures.get(path)?.let { SystemClock.elapsedRealtime() - it < 300_000 } == true) return@withContext null
        val bitmap = runCatching {
            require(path.length <= 2048 && !path.startsWith("//"))
            val url = URL(if (path.startsWith("/")) BuildConfig.TRAKNIO_SYNC_BASE_URL.trimEnd('/') + path else path)
            require(url.protocol == "https" && url.userInfo == null)
            val connection = url.openConnection() as HttpURLConnection
            try {
                connection.connectTimeout = 4_000
                connection.readTimeout = 4_000
                connection.instanceFollowRedirects = false
                require(connection.responseCode == 200 && connection.contentLength <= 1_048_576)
                val bytes = connection.inputStream.use { input ->
                    val output = ByteArrayOutputStream()
                    val buffer = ByteArray(8192)
                    while (true) {
                        val count = input.read(buffer)
                        if (count < 0) break
                        require(output.size() + count <= 1_048_576)
                        output.write(buffer, 0, count)
                    }
                    output.toByteArray()
                }
                val bounds = BitmapFactory.Options().apply { inJustDecodeBounds = true }
                BitmapFactory.decodeByteArray(bytes, 0, bytes.size, bounds)
                require(bounds.outWidth in 1..8192 && bounds.outHeight in 1..8192)
                var sample = 1
                while (maxOf(bounds.outWidth, bounds.outHeight) / sample > 256) sample *= 2
                BitmapFactory.decodeByteArray(bytes, 0, bytes.size, BitmapFactory.Options().apply { inSampleSize = sample })
            } finally { connection.disconnect() }
        }.getOrNull()
        if (bitmap != null) images.put(path, bitmap) else failures.put(path, SystemClock.elapsedRealtime())
        bitmap
    }
}

@Composable
internal fun WorkoutIllustration(url: String?, exerciseName: String) {
    if (url.isNullOrBlank()) return
    val bitmap by produceState<Bitmap?>(null, url) { value = WorkoutImageCache.load(url) }
    bitmap?.let { Image(it.asImageBitmap(), "Illustration : $exerciseName",
        Modifier.fillMaxWidth(0.8f).height(76.dp), contentScale = ContentScale.Fit) }
}
