package com.novadownloader.rn

import android.app.Activity
import android.app.DownloadManager
import android.content.Context
import android.content.Intent
import android.database.Cursor
import android.net.Uri
import android.os.Build
import android.os.Environment
import android.provider.MediaStore
import android.widget.Toast
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.JavaScriptModule
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.modules.core.DeviceEventManagerModule
import com.facebook.react.bridge.Callback
import org.json.JSONArray
import org.json.JSONObject
import java.io.File
import java.util.concurrent.ExecutorService
import java.util.concurrent.Executors

class NovaModule(reactContext: ReactApplicationContext) : ReactContextBaseJavaModule(reactContext) {

    private val executor: ExecutorService = Executors.newFixedThreadPool(3)

    override fun getName() = "NovaModule"

    private fun emitEvent(event: String, position: Int, duration: Int) {
        val params = Arguments.createMap().apply {
            putString("event", event)
            putInt("position", position)
            putInt("duration", duration)
        }
        reactApplicationContext
            .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
            .emit("NovaMusicEvent", params)
    }

    // Forward MusicService broadcasts (position/duration/end) to JS
    private val receiver = object : android.content.BroadcastReceiver() {
        override fun onReceive(context: Context?, intent: Intent?) {
            intent ?: return
            val event = intent.getStringExtra("event") ?: return
            val position = intent.getIntExtra("position", 0)
            val duration = intent.getIntExtra("duration", 0)
            emitEvent(event, position, duration)
        }
    }

    override fun initialize() {
        super.initialize()
        val filter = android.content.IntentFilter(MusicService.BROADCAST_EVENT)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            reactApplicationContext.registerReceiver(receiver, filter, Context.RECEIVER_NOT_EXPORTED)
        } else {
            reactApplicationContext.registerReceiver(receiver, filter)
        }
    }

    override fun onCatalystInstanceDestroy() {
        try {
            reactApplicationContext.unregisterReceiver(receiver)
        } catch (_: Exception) {}
        super.onCatalystInstanceDestroy()
    }

    // ---------------- Event emitter plumbing (required by NativeEventEmitter) ----------------

    @ReactMethod
    fun addListener(eventName: String) {
        // Events are broadcast-driven; no per-listener registration needed on the native side
    }

    @ReactMethod
    fun removeListeners(count: Int) {
        // No-op, see addListener
    }

    // ---------------- Music playback ----------------

    @ReactMethod
    fun playMusic(url: String, title: String, artist: String, image: String) {
        val intent = Intent(reactApplicationContext, MusicService::class.java).apply {
            action = MusicService.ACTION_PLAY
            putExtra("url", url)
            putExtra("title", title)
            putExtra("artist", artist)
            putExtra("image", image)
        }
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            reactApplicationContext.startForegroundService(intent)
        } else {
            reactApplicationContext.startService(intent)
        }
    }

    @ReactMethod
    fun pauseMusic() {
        val intent = Intent(reactApplicationContext, MusicService::class.java).apply { action = MusicService.ACTION_PAUSE }
        reactApplicationContext.startService(intent)
    }

    @ReactMethod
    fun resumeMusic() {
        val intent = Intent(reactApplicationContext, MusicService::class.java).apply { action = MusicService.ACTION_RESUME }
        reactApplicationContext.startService(intent)
    }

    @ReactMethod
    fun seekMusic(positionMs: Int) {
        val intent = Intent(reactApplicationContext, MusicService::class.java).apply {
            action = MusicService.ACTION_SEEK
            putExtra("position", positionMs)
        }
        reactApplicationContext.startService(intent)
    }

    @ReactMethod
    fun stopMusic() {
        val intent = Intent(reactApplicationContext, MusicService::class.java).apply { action = MusicService.ACTION_STOP }
        reactApplicationContext.startService(intent)
    }

    // ---------------- Downloads ----------------

    @ReactMethod
    fun downloadFile(url: String, filename: String, title: String, mimeType: String) {
        val activity: Activity? = reactApplicationContext.currentActivity
        executor.execute {
            try {
                if (url.isEmpty()) {
                    activity?.runOnUiThread {
                        Toast.makeText(activity, "Invalid download URL", Toast.LENGTH_SHORT).show()
                    }
                    return@execute
                }

                val request = DownloadManager.Request(Uri.parse(url)).apply {
                    setTitle(if (title.isNotEmpty()) title else filename)
                    setDescription("Downloading with Nova RN")
                    setNotificationVisibility(DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED)
                    if (mimeType.isNotEmpty()) setMimeType(mimeType)
                    if (url.contains("hakunaymatata.com") || url.contains("aoneroom.com") ||
                        url.contains("videodownloader.site") || url.contains("staticjs.org")) {
                        addRequestHeader("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36")
                        addRequestHeader("Origin", "https://videodownloader.site")
                        addRequestHeader("Referer", "https://videodownloader.site/")
                        addRequestHeader("x-request-lang", "en")
                    }
                    val safeName = if (filename.isNotEmpty()) filename.replace(Regex("[/\\\\?%*:|\"<>]"), "")
                    else "Nova_Download_${System.currentTimeMillis()}"
                    setDestinationInExternalPublicDir(Environment.DIRECTORY_DOWNLOADS, safeName)
                    setAllowedOverMetered(true)
                    setAllowedOverRoaming(true)
                }

                val manager = reactApplicationContext.getSystemService(Context.DOWNLOAD_SERVICE) as? DownloadManager
                manager?.enqueue(request)
                activity?.runOnUiThread {
                    Toast.makeText(activity, "Download started", Toast.LENGTH_SHORT).show()
                }
            } catch (e: Exception) {
                activity?.runOnUiThread {
                    Toast.makeText(activity, "Download error: ${e.message}", Toast.LENGTH_SHORT).show()
                }
            }
        }
    }

    // ---------------- Offline library scan ----------------

    @ReactMethod
    fun scanOfflineMusic(promise: Promise) {
        executor.execute {
            try {
                val songArray = JSONArray()
                val uri = MediaStore.Audio.Media.EXTERNAL_CONTENT_URI
                val projection = arrayOf(
                    MediaStore.Audio.Media._ID,
                    MediaStore.Audio.Media.TITLE,
                    MediaStore.Audio.Media.ARTIST,
                    MediaStore.Audio.Media.ALBUM,
                    MediaStore.Audio.Media.DURATION,
                    MediaStore.Audio.Media.DATA,
                    MediaStore.Audio.Media.SIZE
                )
                val selection = "${MediaStore.Audio.Media.IS_MUSIC} != 0"
                val sortOrder = "${MediaStore.Audio.Media.DATE_ADDED} DESC"

                val cursor: Cursor? = reactApplicationContext.contentResolver.query(uri, projection, selection, null, sortOrder)
                cursor?.use { c ->
                    while (c.moveToNext()) {
                        val id = c.getLong(0)
                        val title = c.getString(1)
                        val artist = c.getString(2)
                        val album = c.getString(3)
                        val duration = c.getLong(4)
                        val filePath = c.getString(5)
                        val size = c.getLong(6)

                        if (filePath != null && File(filePath).exists()) {
                            val song = JSONObject()
                            song.put("id", "local_$id")
                            song.put("name", title ?: "Unknown Track")
                            song.put("artist", artist ?: "Offline Audio")
                            song.put("album", album ?: "Local Music")
                            song.put("duration", Math.round(duration / 1000.0))
                            song.put("filePath", filePath)
                            song.put("streamUrl", "file://$filePath")
                            song.put("size", size)
                            song.put("format", filePath.substring(filePath.lastIndexOf('.') + 1).uppercase())
                            song.put("isOffline", true)
                            song.put("source", "offline")
                            songArray.put(song)
                        }
                    }
                }
                promise.resolve(songArray.toString())
            } catch (e: Exception) {
                promise.reject("SCAN_ERROR", e)
            }
        }
    }

    // ---------------- Saavn URL decryption ----------------

    @ReactMethod
    fun decryptSaavnUrl(encryptedUrl: String, promise: Promise) {
        if (encryptedUrl.isEmpty()) {
            promise.resolve("")
            return
        }
        executor.execute {
            try {
                val keyBytes = "38346591".toByteArray(Charsets.UTF_8)
                val keySpec = javax.crypto.spec.DESKeySpec(keyBytes)
                val keyFactory = javax.crypto.SecretKeyFactory.getInstance("DES")
                val key = keyFactory.generateSecret(keySpec)
                val cipher = javax.crypto.Cipher.getInstance("DES/ECB/PKCS5Padding")
                cipher.init(javax.crypto.Cipher.DECRYPT_MODE, key)
                val encBytes = android.util.Base64.decode(encryptedUrl, android.util.Base64.DEFAULT)
                val decBytes = cipher.doFinal(encBytes)
                val url = String(decBytes, Charsets.UTF_8)
                promise.resolve(url.replace("_96.mp4", "_320.mp4").replace("_160.mp4", "_320.mp4"))
            } catch (e: Exception) {
                promise.resolve("")
            }
        }
    }
}
