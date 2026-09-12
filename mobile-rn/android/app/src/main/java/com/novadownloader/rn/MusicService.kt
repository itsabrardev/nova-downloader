package com.novadownloader.rn

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.media.AudioAttributes
import android.media.MediaPlayer
import android.net.Uri
import android.net.wifi.WifiManager
import android.os.Build
import android.os.IBinder
import android.os.PowerManager
import android.util.Log
import java.io.InputStream
import java.net.HttpURLConnection
import java.net.URL

class MusicService : Service(), MediaPlayer.OnPreparedListener, MediaPlayer.OnCompletionListener, MediaPlayer.OnErrorListener {

    companion object {
        private const val TAG = "NovaMusicService"
        const val CHANNEL_ID = "nova_music_playback_channel"
        const val NOTIFICATION_ID = 1001

        const val ACTION_PLAY = "com.novadownloader.rn.ACTION_PLAY"
        const val ACTION_PAUSE = "com.novadownloader.rn.ACTION_PAUSE"
        const val ACTION_RESUME = "com.novadownloader.rn.ACTION_RESUME"
        const val ACTION_STOP = "com.novadownloader.rn.ACTION_STOP"
        const val ACTION_NEXT = "com.novadownloader.rn.ACTION_NEXT"
        const val ACTION_PREV = "com.novadownloader.rn.ACTION_PREV"
        const val ACTION_SEEK = "com.novadownloader.rn.ACTION_SEEK"

        const val BROADCAST_EVENT = "com.novadownloader.rn.MUSIC_EVENT"
    }

    private var mediaPlayer: MediaPlayer? = null
    private var wakeLock: PowerManager.WakeLock? = null
    private var wifiLock: WifiManager.WifiLock? = null

    private var currentUrl = ""
    private var currentTitle = "Playing Music"
    private var currentArtist = "Nova RN"
    private var currentImage = ""
    private var currentArtBitmap: Bitmap? = null
    private var isPlaying = false

    override fun onCreate() {
        super.onCreate()
        createNotificationChannel()

        val powerManager = getSystemService(Context.POWER_SERVICE) as? PowerManager
        if (powerManager != null) {
            wakeLock = powerManager.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "NovaDownloader:MusicWakeLock").apply {
                acquire()
            }
        }

        val wifiManager = applicationContext.getSystemService(Context.WIFI_SERVICE) as? WifiManager
        if (wifiManager != null) {
            wifiLock = wifiManager.createWifiLock(WifiManager.WIFI_MODE_FULL_HIGH_PERF, "NovaDownloader:MusicWifiLock").apply {
                acquire()
            }
        }

        initMediaPlayer()
    }

    private fun initMediaPlayer() {
        if (mediaPlayer == null) {
            mediaPlayer = MediaPlayer().apply {
                setWakeMode(applicationContext, PowerManager.PARTIAL_WAKE_LOCK)
                setAudioAttributes(
                    AudioAttributes.Builder()
                        .setContentType(AudioAttributes.CONTENT_TYPE_MUSIC)
                        .setUsage(AudioAttributes.USAGE_MEDIA)
                        .build()
                )
                setOnPreparedListener(this@MusicService)
                setOnCompletionListener(this@MusicService)
                setOnErrorListener(this@MusicService)
            }
        }
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        if (intent == null || intent.action == null) {
            return START_STICKY
        }

        when (intent.action) {
            ACTION_PLAY -> {
                val url = intent.getStringExtra("url")
                currentTitle = intent.getStringExtra("title") ?: "Music Track"
                currentArtist = intent.getStringExtra("artist") ?: "Nova RN"
                currentImage = intent.getStringExtra("image") ?: ""

                loadArtAsync(currentImage)

                if (!url.isNullOrEmpty()) {
                    playUrl(url)
                } else {
                    resumePlayback()
                }
            }
            ACTION_PAUSE -> pausePlayback()
            ACTION_RESUME -> resumePlayback()
            ACTION_STOP -> stopPlayback()
            ACTION_SEEK -> seekTo(intent.getIntExtra("position", 0))
            ACTION_NEXT -> sendEventBroadcast("next", 0, 0)
            ACTION_PREV -> sendEventBroadcast("prev", 0, 0)
        }

        return START_STICKY
    }

    private fun playUrl(url: String) {
        try {
            currentUrl = url
            initMediaPlayer()
            mediaPlayer?.reset()

            if (url.startsWith("content://") || url.startsWith("file://")) {
                mediaPlayer?.setDataSource(applicationContext, Uri.parse(url))
            } else {
                mediaPlayer?.setDataSource(url)
            }

            mediaPlayer?.prepareAsync()
            updateNotification(true)
            sendEventBroadcast("buffering", 0, 0)
        } catch (e: Exception) {
            Log.e(TAG, "playUrl error: ${e.message}", e)
            sendEventBroadcast("error", 0, 0)
        }
    }

    private fun pausePlayback() {
        if (mediaPlayer != null && mediaPlayer!!.isPlaying) {
            mediaPlayer!!.pause()
            isPlaying = false
            updateNotification(false)
            sendEventBroadcast("pause", mediaPlayer!!.currentPosition, mediaPlayer!!.duration)
        }
    }

    private fun resumePlayback() {
        if (mediaPlayer != null) {
            mediaPlayer!!.start()
            isPlaying = true
            updateNotification(true)
            sendEventBroadcast("play", mediaPlayer!!.currentPosition, mediaPlayer!!.duration)
        }
    }

    private fun seekTo(positionMs: Int) {
        if (mediaPlayer != null) {
            mediaPlayer!!.seekTo(positionMs)
            sendEventBroadcast("seek", positionMs, mediaPlayer!!.duration)
        }
    }

    private fun stopPlayback() {
        if (mediaPlayer != null) {
            if (mediaPlayer!!.isPlaying) mediaPlayer!!.stop()
            mediaPlayer!!.reset()
        }
        isPlaying = false
        stopForeground(true)
        stopSelf()
        sendEventBroadcast("stop", 0, 0)
    }

    override fun onPrepared(mp: MediaPlayer) {
        mp.start()
        isPlaying = true
        updateNotification(true)
        sendEventBroadcast("prepared", mp.currentPosition, mp.duration)
    }

    override fun onCompletion(mp: MediaPlayer) {
        isPlaying = false
        updateNotification(false)
        sendEventBroadcast("ended", mp.duration, mp.duration)
    }

    override fun onError(mp: MediaPlayer, what: Int, extra: Int): Boolean {
        Log.e(TAG, "MediaPlayer error: what=$what, extra=$extra")
        isPlaying = false
        updateNotification(false)
        sendEventBroadcast("error", 0, 0)
        return true
    }

    private fun createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val channel = NotificationChannel(
                CHANNEL_ID,
                "Nova Background Music",
                NotificationManager.IMPORTANCE_LOW
            ).apply {
                description = "Background audio player notification controls"
                setShowBadge(false)
                setSound(null, null)
                enableVibration(false)
            }
            val manager = getSystemService(NotificationManager::class.java)
            manager?.createNotificationChannel(channel)
        }
    }

    private fun updateNotification(playing: Boolean) {
        val flags = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) PendingIntent.FLAG_IMMUTABLE else 0

        val launchIntent = packageManager.getLaunchIntentForPackage(packageName)
        val contentPendingIntent = launchIntent?.let {
            PendingIntent.getActivity(this, 0, it, flags)
        }

        fun actionPending(action: String, requestCode: Int): PendingIntent {
            val intent = Intent(this, NotificationActionReceiver::class.java).apply { this.action = action }
            return PendingIntent.getBroadcast(this, requestCode, intent, flags)
        }

        val builder = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            Notification.Builder(this, CHANNEL_ID)
        } else {
            @Suppress("DEPRECATION")
            Notification.Builder(this)
        }

        builder.setContentTitle(currentTitle)
            .setContentText(currentArtist)
            .setSmallIcon(android.R.drawable.ic_media_play)
            .setOngoing(playing)
            .setVisibility(Notification.VISIBILITY_PUBLIC)
            .setPriority(Notification.PRIORITY_HIGH)

        contentPendingIntent?.let { builder.setContentIntent(it) }
        builder.addAction(android.R.drawable.ic_media_previous, "Previous", actionPending(ACTION_PREV, 1))
        builder.addAction(
            if (playing) android.R.drawable.ic_media_pause else android.R.drawable.ic_media_play,
            if (playing) "Pause" else "Play",
            actionPending(if (playing) ACTION_PAUSE else ACTION_RESUME, 2)
        )
        builder.addAction(android.R.drawable.ic_media_next, "Next", actionPending(ACTION_NEXT, 3))
        builder.addAction(android.R.drawable.ic_menu_close_clear_cancel, "Close", actionPending(ACTION_STOP, 4))

        currentArtBitmap?.let { builder.setLargeIcon(it) }

        startForeground(NOTIFICATION_ID, builder.build())
    }

    private fun loadArtAsync(artUrl: String) {
        if (artUrl.isEmpty()) {
            currentArtBitmap = null
            return
        }
        Thread {
            try {
                val url = URL(artUrl)
                val conn = url.openConnection() as HttpURLConnection
                conn.doInput = true
                conn.connectTimeout = 5000
                conn.connect()
                val input: InputStream = conn.inputStream
                currentArtBitmap = BitmapFactory.decodeStream(input)
                if (isPlaying) {
                    updateNotification(true)
                }
            } catch (_: Exception) {
                currentArtBitmap = null
            }
        }.start()
    }

    private fun sendEventBroadcast(event: String, currentPosition: Int, duration: Int) {
        val broadcast = Intent(BROADCAST_EVENT).apply {
            putExtra("event", event)
            putExtra("position", currentPosition)
            putExtra("duration", duration)
            setPackage(packageName)
        }
        sendBroadcast(broadcast)
    }

    override fun onDestroy() {
        super.onDestroy()
        mediaPlayer?.release()
        mediaPlayer = null
        if (wakeLock?.isHeld == true) wakeLock?.release()
        if (wifiLock?.isHeld == true) wifiLock?.release()
        stopForeground(true)
    }

    override fun onBind(intent: Intent?): IBinder? = null
}
