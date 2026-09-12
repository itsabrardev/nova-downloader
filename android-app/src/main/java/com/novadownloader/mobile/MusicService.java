package com.novadownloader.mobile;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.media.AudioAttributes;
import android.media.MediaPlayer;
import android.net.Uri;
import android.net.wifi.WifiManager;
import android.os.Build;
import android.os.IBinder;
import android.os.PowerManager;
import android.util.Log;

import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;

public class MusicService extends Service implements MediaPlayer.OnPreparedListener, MediaPlayer.OnCompletionListener, MediaPlayer.OnErrorListener {

    private static final String TAG = "NovaMusicService";
    public static final String CHANNEL_ID = "nova_music_playback_channel";
    public static final int NOTIFICATION_ID = 1001;

    public static final String ACTION_PLAY   = "com.novadownloader.mobile.ACTION_PLAY";
    public static final String ACTION_PAUSE  = "com.novadownloader.mobile.ACTION_PAUSE";
    public static final String ACTION_RESUME = "com.novadownloader.mobile.ACTION_RESUME";
    public static final String ACTION_STOP   = "com.novadownloader.mobile.ACTION_STOP";
    public static final String ACTION_NEXT   = "com.novadownloader.mobile.ACTION_NEXT";
    public static final String ACTION_PREV   = "com.novadownloader.mobile.ACTION_PREV";
    public static final String ACTION_SEEK   = "com.novadownloader.mobile.ACTION_SEEK";

    public static final String BROADCAST_EVENT = "com.novadownloader.mobile.MUSIC_EVENT";

    private MediaPlayer mediaPlayer;
    private PowerManager.WakeLock wakeLock;
    private WifiManager.WifiLock wifiLock;

    private String currentUrl = "";
    private String currentTitle = "Playing Music";
    private String currentArtist = "Nova Downloader";
    private String currentImage = "";
    private Bitmap currentArtBitmap = null;
    private boolean isPlaying = false;

    @Override
    public void onCreate() {
        super.onCreate();
        createNotificationChannel();

        // 1. Acquire Partial WakeLock (keeps CPU running when phone screen is turned OFF)
        PowerManager powerManager = (PowerManager) getSystemService(Context.POWER_SERVICE);
        if (powerManager != null) {
            wakeLock = powerManager.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "NovaDownloader:MusicWakeLock");
            wakeLock.acquire();
        }

        // 2. Acquire High-Performance WifiLock (prevents Wi-Fi throttling during screen-off streaming)
        WifiManager wifiManager = (WifiManager) getApplicationContext().getSystemService(Context.WIFI_SERVICE);
        if (wifiManager != null) {
            wifiLock = wifiManager.createWifiLock(WifiManager.WIFI_MODE_FULL_HIGH_PERF, "NovaDownloader:MusicWifiLock");
            wifiLock.acquire();
        }

        initMediaPlayer();
    }

    private void initMediaPlayer() {
        if (mediaPlayer == null) {
            mediaPlayer = new MediaPlayer();
            mediaPlayer.setWakeMode(getApplicationContext(), PowerManager.PARTIAL_WAKE_LOCK);
            mediaPlayer.setAudioAttributes(new AudioAttributes.Builder()
                    .setContentType(AudioAttributes.CONTENT_TYPE_MUSIC)
                    .setUsage(AudioAttributes.USAGE_MEDIA)
                    .build());
            mediaPlayer.setOnPreparedListener(this);
            mediaPlayer.setOnCompletionListener(this);
            mediaPlayer.setOnErrorListener(this);
        }
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        if (intent == null || intent.getAction() == null) {
            return START_STICKY;
        }

        String action = intent.getAction();
        Log.d(TAG, "Action received: " + action);

        if (ACTION_PLAY.equals(action)) {
            String url = intent.getStringExtra("url");
            currentTitle = intent.getStringExtra("title");
            currentArtist = intent.getStringExtra("artist");
            currentImage = intent.getStringExtra("image");

            if (currentTitle == null || currentTitle.isEmpty()) currentTitle = "Music Track";
            if (currentArtist == null) currentArtist = "Nova Mobile";

            loadArtAsync(currentImage);

            if (url != null && !url.isEmpty()) {
                playUrl(url);
            } else if (mediaPlayer != null) {
                resumePlayback();
            }
        } else if (ACTION_PAUSE.equals(action)) {
            pausePlayback();
        } else if (ACTION_RESUME.equals(action)) {
            resumePlayback();
        } else if (ACTION_STOP.equals(action)) {
            stopPlayback();
        } else if (ACTION_SEEK.equals(action)) {
            int pos = intent.getIntExtra("position", 0);
            seekTo(pos);
        } else if (ACTION_NEXT.equals(action)) {
            sendEventBroadcast("next", 0, 0);
        } else if (ACTION_PREV.equals(action)) {
            sendEventBroadcast("prev", 0, 0);
        }

        return START_STICKY;
    }

    private void playUrl(String url) {
        try {
            currentUrl = url;
            initMediaPlayer();
            mediaPlayer.reset();

            if (url.startsWith("content://") || url.startsWith("file://")) {
                mediaPlayer.setDataSource(getApplicationContext(), Uri.parse(url));
            } else {
                mediaPlayer.setDataSource(url);
            }

            mediaPlayer.prepareAsync();
            updateNotification(true);
            sendEventBroadcast("buffering", 0, 0);
        } catch (Exception e) {
            Log.e(TAG, "playUrl error: " + e.getMessage(), e);
            sendEventBroadcast("error", 0, 0);
        }
    }

    private void pausePlayback() {
        if (mediaPlayer != null && mediaPlayer.isPlaying()) {
            mediaPlayer.pause();
            isPlaying = false;
            updateNotification(false);
            sendEventBroadcast("pause", mediaPlayer.getCurrentPosition(), mediaPlayer.getDuration());
        }
    }

    private void resumePlayback() {
        if (mediaPlayer != null) {
            mediaPlayer.start();
            isPlaying = true;
            updateNotification(true);
            sendEventBroadcast("play", mediaPlayer.getCurrentPosition(), mediaPlayer.getDuration());
        }
    }

    private void seekTo(int positionMs) {
        if (mediaPlayer != null) {
            mediaPlayer.seekTo(positionMs);
            sendEventBroadcast("seek", positionMs, mediaPlayer.getDuration());
        }
    }

    private void stopPlayback() {
        if (mediaPlayer != null) {
            if (mediaPlayer.isPlaying()) mediaPlayer.stop();
            mediaPlayer.reset();
        }
        isPlaying = false;
        stopForeground(true);
        stopSelf();
        sendEventBroadcast("stop", 0, 0);
    }

    @Override
    public void onPrepared(MediaPlayer mp) {
        mp.start();
        isPlaying = true;
        updateNotification(true);
        sendEventBroadcast("prepared", mp.getCurrentPosition(), mp.getDuration());
    }

    @Override
    public void onCompletion(MediaPlayer mp) {
        isPlaying = false;
        updateNotification(false);
        sendEventBroadcast("ended", mp.getDuration(), mp.getDuration());
    }

    @Override
    public boolean onError(MediaPlayer mp, int what, int extra) {
        Log.e(TAG, "MediaPlayer error: what=" + what + ", extra=" + extra);
        isPlaying = false;
        updateNotification(false);
        sendEventBroadcast("error", 0, 0);
        return true;
    }

    private void createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationChannel channel = new NotificationChannel(
                    CHANNEL_ID,
                    "Nova Background Music",
                    NotificationManager.IMPORTANCE_LOW
            );
            channel.setDescription("Background audio player notification controls");
            channel.setShowBadge(false);
            channel.setSound(null, null);
            channel.enableVibration(false);

            NotificationManager manager = getSystemService(NotificationManager.class);
            if (manager != null) {
                manager.createNotificationChannel(channel);
            }
        }
    }

    private void updateNotification(boolean playing) {
        Intent appIntent = new Intent(this, MainActivity.class);
        appIntent.setFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        PendingIntent contentPendingIntent = PendingIntent.getActivity(
                this, 0, appIntent,
                Build.VERSION.SDK_INT >= Build.VERSION_CODES.M ? PendingIntent.FLAG_IMMUTABLE : 0
        );

        // Previous Action
        Intent prevIntent = new Intent(this, NotificationActionReceiver.class);
        prevIntent.setAction(ACTION_PREV);
        PendingIntent prevPendingIntent = PendingIntent.getBroadcast(
                this, 1, prevIntent,
                Build.VERSION.SDK_INT >= Build.VERSION_CODES.M ? PendingIntent.FLAG_IMMUTABLE : 0
        );

        // Play/Pause Action
        Intent toggleIntent = new Intent(this, NotificationActionReceiver.class);
        toggleIntent.setAction(playing ? ACTION_PAUSE : ACTION_RESUME);
        PendingIntent togglePendingIntent = PendingIntent.getBroadcast(
                this, 2, toggleIntent,
                Build.VERSION.SDK_INT >= Build.VERSION_CODES.M ? PendingIntent.FLAG_IMMUTABLE : 0
        );

        // Next Action
        Intent nextIntent = new Intent(this, NotificationActionReceiver.class);
        nextIntent.setAction(ACTION_NEXT);
        PendingIntent nextPendingIntent = PendingIntent.getBroadcast(
                this, 3, nextIntent,
                Build.VERSION.SDK_INT >= Build.VERSION_CODES.M ? PendingIntent.FLAG_IMMUTABLE : 0
        );

        // Stop Action
        Intent stopIntent = new Intent(this, NotificationActionReceiver.class);
        stopIntent.setAction(ACTION_STOP);
        PendingIntent stopPendingIntent = PendingIntent.getBroadcast(
                this, 4, stopIntent,
                Build.VERSION.SDK_INT >= Build.VERSION_CODES.M ? PendingIntent.FLAG_IMMUTABLE : 0
        );

        Notification.Builder builder;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            builder = new Notification.Builder(this, CHANNEL_ID);
        } else {
            builder = new Notification.Builder(this);
        }

        builder.setContentTitle(currentTitle)
                .setContentText(currentArtist)
                .setContentIntent(contentPendingIntent)
                .setSmallIcon(R.drawable.ic_play)
                .setOngoing(playing)
                .setVisibility(Notification.VISIBILITY_PUBLIC)
                .setPriority(Notification.PRIORITY_HIGH)
                .addAction(R.drawable.ic_prev, "Previous", prevPendingIntent)
                .addAction(playing ? R.drawable.ic_pause : R.drawable.ic_play, playing ? "Pause" : "Play", togglePendingIntent)
                .addAction(R.drawable.ic_next, "Next", nextPendingIntent)
                .addAction(R.drawable.ic_play, "Close", stopPendingIntent);

        if (currentArtBitmap != null) {
            builder.setLargeIcon(currentArtBitmap);
        }

        Notification notification = builder.build();
        startForeground(NOTIFICATION_ID, notification);
    }

    private void loadArtAsync(final String artUrl) {
        if (artUrl == null || artUrl.isEmpty()) {
            currentArtBitmap = null;
            return;
        }

        new Thread(() -> {
            try {
                URL url = new URL(artUrl);
                HttpURLConnection conn = (HttpURLConnection) url.openConnection();
                conn.setDoInput(true);
                conn.setConnectTimeout(5000);
                conn.connect();
                InputStream input = conn.getInputStream();
                currentArtBitmap = BitmapFactory.decodeStream(input);
                if (isPlaying) {
                    updateNotification(true);
                }
            } catch (Exception ignored) {
                currentArtBitmap = null;
            }
        }).start();
    }

    private void sendEventBroadcast(String event, int currentPosition, int duration) {
        Intent broadcast = new Intent(BROADCAST_EVENT);
        broadcast.putExtra("event", event);
        broadcast.putExtra("position", currentPosition);
        broadcast.putExtra("duration", duration);
        sendBroadcast(broadcast);
    }

    @Override
    public void onDestroy() {
        super.onDestroy();
        if (mediaPlayer != null) {
            mediaPlayer.release();
            mediaPlayer = null;
        }
        if (wakeLock != null && wakeLock.isHeld()) {
            wakeLock.release();
        }
        if (wifiLock != null && wifiLock.isHeld()) {
            wifiLock.release();
        }
        stopForeground(true);
    }

    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }
}
