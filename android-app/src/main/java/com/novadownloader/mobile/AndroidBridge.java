package com.novadownloader.mobile;

import android.app.Activity;
import android.app.DownloadManager;
import android.content.Context;
import android.content.Intent;
import android.content.pm.ActivityInfo;
import android.database.Cursor;
import android.net.Uri;
import android.os.Build;
import android.os.Environment;
import android.provider.MediaStore;
import android.webkit.JavascriptInterface;
import android.webkit.WebView;
import android.widget.Toast;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.File;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.io.BufferedReader;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.util.Iterator;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.zip.GZIPInputStream;

public class AndroidBridge {

    private final Activity activity;
    private final WebView webView;
    // Heavy work (network + MediaStore) is dispatched here so the WebView JS thread never blocks
    private final ExecutorService bridgeExecutor = Executors.newFixedThreadPool(4);

    public AndroidBridge(Activity activity, WebView webView) {
        this.activity = activity;
        this.webView = webView;
    }

    private void postJs(String script) {
        if (webView != null) {
            webView.post(() -> webView.evaluateJavascript(script, null));
        }
    }

    @JavascriptInterface
    public void playMusic(String url, String title, String artist, String image) {
        Intent intent = new Intent(activity, MusicService.class);
        intent.setAction(MusicService.ACTION_PLAY);
        intent.putExtra("url", url);
        intent.putExtra("title", title);
        intent.putExtra("artist", artist);
        intent.putExtra("image", image);

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            activity.startForegroundService(intent);
        } else {
            activity.startService(intent);
        }
    }

    @JavascriptInterface
    public void pauseMusic() {
        Intent intent = new Intent(activity, MusicService.class);
        intent.setAction(MusicService.ACTION_PAUSE);
        activity.startService(intent);
    }

    @JavascriptInterface
    public void resumeMusic() {
        Intent intent = new Intent(activity, MusicService.class);
        intent.setAction(MusicService.ACTION_RESUME);
        activity.startService(intent);
    }

    @JavascriptInterface
    public void seekMusic(int positionMs) {
        Intent intent = new Intent(activity, MusicService.class);
        intent.setAction(MusicService.ACTION_SEEK);
        intent.putExtra("position", positionMs);
        activity.startService(intent);
    }

    @JavascriptInterface
    public void stopMusic() {
        Intent intent = new Intent(activity, MusicService.class);
        intent.setAction(MusicService.ACTION_STOP);
        activity.startService(intent);
    }

    @JavascriptInterface
    public void downloadFile(String url, String filename, String title, String mimeType) {
        activity.runOnUiThread(() -> {
            try {
                if (url == null || url.isEmpty()) {
                    Toast.makeText(activity, "Invalid download URL", Toast.LENGTH_SHORT).show();
                    return;
                }

                DownloadManager.Request request = new DownloadManager.Request(Uri.parse(url));
                request.setTitle(title != null && !title.isEmpty() ? title : filename);
                request.setDescription("Downloading with Nova Downloader");
                request.setNotificationVisibility(DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED);

                if (mimeType != null && !mimeType.isEmpty()) {
                    request.setMimeType(mimeType);
                }

                if (url.contains("hakunaymatata.com") || url.contains("aoneroom.com") || url.contains("videodownloader.site") || url.contains("staticjs.org")) {
                    request.addRequestHeader("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36");
                    request.addRequestHeader("Origin", "https://videodownloader.site");
                    request.addRequestHeader("Referer", "https://videodownloader.site/");
                    request.addRequestHeader("x-request-lang", "en");
                }

                String safeName = (filename != null && !filename.isEmpty())
                        ? filename.replaceAll("[/\\\\?%*:|\"<>]", "")
                        : "Nova_Download_" + System.currentTimeMillis();

                request.setDestinationInExternalPublicDir(Environment.DIRECTORY_DOWNLOADS, safeName);
                request.setAllowedOverMetered(true);
                request.setAllowedOverRoaming(true);

                DownloadManager manager = (DownloadManager) activity.getSystemService(Context.DOWNLOAD_SERVICE);
                if (manager != null) {
                    manager.enqueue(request);
                    Toast.makeText(activity, "Download started: " + safeName, Toast.LENGTH_SHORT).show();
                }
            } catch (Exception e) {
                Toast.makeText(activity, "Download error: " + e.getMessage(), Toast.LENGTH_SHORT).show();
            }
        });
    }

    @JavascriptInterface
    public String scanOfflineMusic() {
        JSONArray songArray = new JSONArray();
        try {
            Uri uri = MediaStore.Audio.Media.EXTERNAL_CONTENT_URI;
            String[] projection = {
                    MediaStore.Audio.Media._ID,
                    MediaStore.Audio.Media.TITLE,
                    MediaStore.Audio.Media.ARTIST,
                    MediaStore.Audio.Media.ALBUM,
                    MediaStore.Audio.Media.DURATION,
                    MediaStore.Audio.Media.DATA,
                    MediaStore.Audio.Media.SIZE
            };

            String selection = MediaStore.Audio.Media.IS_MUSIC + " != 0";
            String sortOrder = MediaStore.Audio.Media.DATE_ADDED + " DESC";

            Cursor cursor = activity.getContentResolver().query(uri, projection, selection, null, sortOrder);
            if (cursor != null) {
                int idCol = cursor.getColumnIndexOrThrow(MediaStore.Audio.Media._ID);
                int titleCol = cursor.getColumnIndexOrThrow(MediaStore.Audio.Media.TITLE);
                int artistCol = cursor.getColumnIndexOrThrow(MediaStore.Audio.Media.ARTIST);
                int albumCol = cursor.getColumnIndexOrThrow(MediaStore.Audio.Media.ALBUM);
                int durCol = cursor.getColumnIndexOrThrow(MediaStore.Audio.Media.DURATION);
                int dataCol = cursor.getColumnIndexOrThrow(MediaStore.Audio.Media.DATA);
                int sizeCol = cursor.getColumnIndexOrThrow(MediaStore.Audio.Media.SIZE);

                while (cursor.moveToNext()) {
                    long id = cursor.getLong(idCol);
                    String title = cursor.getString(titleCol);
                    String artist = cursor.getString(artistCol);
                    String album = cursor.getString(albumCol);
                    long duration = cursor.getLong(durCol);
                    String filePath = cursor.getString(dataCol);
                    long size = cursor.getLong(sizeCol);

                    if (filePath != null && new File(filePath).exists()) {
                        JSONObject song = new JSONObject();
                        song.put("id", "local_" + id);
                        song.put("name", title != null ? title : "Unknown Track");
                        song.put("artist", artist != null ? artist : "Offline Audio");
                        song.put("album", album != null ? album : "Local Music");
                        song.put("duration", Math.round(duration / 1000.0));
                        song.put("filePath", filePath);
                        song.put("streamUrl", "file://" + filePath);
                        song.put("size", size);
                        song.put("format", filePath.substring(filePath.lastIndexOf('.') + 1).toUpperCase());
                        song.put("isOffline", true);
                        song.put("source", "offline");

                        songArray.put(song);
                    }
                }
                cursor.close();
            }
        } catch (Exception e) {
            e.printStackTrace();
        }

        return songArray.toString();
    }

    // Non-blocking fetch: runs on a worker thread and resolves the JS-side promise
    // via window.__onNativeFetchResult(requestId, {status, body, headers}).
    @JavascriptInterface
    public void nativeFetchAsync(final String urlStr, final String method, final String headersJson, final String bodyStr, final String requestId) {
        final String id = requestId == null ? "0" : requestId;
        bridgeExecutor.execute(() -> {
            String result = nativeFetch(urlStr, method, headersJson, bodyStr);
            if (result == null || result.isEmpty()) result = "{}";
            // The JSON object is embedded directly as a JS expression argument —
            // org.json guarantees valid escaping, so no string-literal wrapping is needed.
            postJs("window.__onNativeFetchResult && window.__onNativeFetchResult(" + id + ", " + result + ");");
        });
    }

    // Non-blocking MediaStore scan: resolves via window.__onOfflineMusicResult([...]).
    @JavascriptInterface
    public void scanOfflineMusicAsync() {
        bridgeExecutor.execute(() -> {
            String result = scanOfflineMusic();
            if (result == null || result.isEmpty()) result = "[]";
            postJs("window.__onOfflineMusicResult && window.__onOfflineMusicResult(" + result + ");");
        });
    }

    @JavascriptInterface
    public String nativeFetch(String urlStr, String method, String headersJson, String bodyStr) {        try {
            URL url = new URL(urlStr);
            HttpURLConnection conn = (HttpURLConnection) url.openConnection();
            conn.setRequestMethod(method != null ? method.toUpperCase() : "GET");
            conn.setConnectTimeout(15000);
            conn.setReadTimeout(25000);
            conn.setInstanceFollowRedirects(true);

            // Domain-aware default headers
            conn.setRequestProperty("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36");

            if (urlStr.contains("aoneroom.com") || urlStr.contains("videodownloader.site") || urlStr.contains("staticjs.org")) {
                conn.setRequestProperty("Origin", "https://videodownloader.site");
                conn.setRequestProperty("Referer", "https://videodownloader.site/");
                conn.setRequestProperty("x-request-lang", "en");
            } else if (urlStr.contains("youtube.com")) {
                conn.setRequestProperty("Origin", "https://www.youtube.com");
                conn.setRequestProperty("Referer", "https://www.youtube.com/");
            } else if (urlStr.contains("jiosaavn.com") || urlStr.contains("saavncdn.com")) {
                conn.setRequestProperty("Origin", "https://www.jiosaavn.com");
                conn.setRequestProperty("Referer", "https://www.jiosaavn.com/");
                conn.setRequestProperty("Accept", "application/json, text/plain, */*");
            }

            if (headersJson != null && !headersJson.isEmpty()) {
                JSONObject headers = new JSONObject(headersJson);
                Iterator<String> keys = headers.keys();
                while (keys.hasNext()) {
                    String key = keys.next();
                    conn.setRequestProperty(key, headers.getString(key));
                }
            }

            if (bodyStr != null && !bodyStr.isEmpty() && ("POST".equalsIgnoreCase(method) || "PUT".equalsIgnoreCase(method))) {
                conn.setDoOutput(true);
                try (OutputStream os = conn.getOutputStream()) {
                    os.write(bodyStr.getBytes("UTF-8"));
                    os.flush();
                }
            }

            int statusCode = conn.getResponseCode();
            InputStream rawIs = (statusCode >= 200 && statusCode < 400) ? conn.getInputStream() : conn.getErrorStream();
            String responseBody = "";
            if (rawIs != null) {
                InputStream is = rawIs;
                String encoding = conn.getContentEncoding();
                if ("gzip".equalsIgnoreCase(encoding)) {
                    is = new GZIPInputStream(rawIs);
                }

                BufferedReader reader = new BufferedReader(new InputStreamReader(is, "UTF-8"));
                StringBuilder sb = new StringBuilder();
                String line;
                while ((line = reader.readLine()) != null) {
                    sb.append(line).append("\n");
                }
                reader.close();
                responseBody = sb.toString();
            }

            JSONObject respHeaders = new JSONObject();
            for (Map.Entry<String, List<String>> entry : conn.getHeaderFields().entrySet()) {
                if (entry.getKey() != null && entry.getValue() != null && !entry.getValue().isEmpty()) {
                    respHeaders.put(entry.getKey().toLowerCase(), entry.getValue().get(0));
                }
            }

            JSONObject result = new JSONObject();
            result.put("status", statusCode);
            result.put("body", responseBody);
            result.put("headers", respHeaders);
            return result.toString();
        } catch (Exception e) {
            JSONObject err = new JSONObject();
            try {
                err.put("status", 500);
                err.put("error", e.getMessage());
                err.put("body", "");
                err.put("headers", new JSONObject());
            } catch (Exception ignored) {}
            return err.toString();
        }
    }

    @JavascriptInterface
    public void playVideoNative(String url, String title) {
        activity.runOnUiThread(() -> {
            try {
                if (url == null || url.isEmpty()) {
                    Toast.makeText(activity, "Video URL is invalid", Toast.LENGTH_SHORT).show();
                    return;
                }
                Intent intent = new Intent(activity, VideoPlayerActivity.class);
                intent.putExtra("url", url);
                intent.putExtra("title", title);
                activity.startActivity(intent);
            } catch (Exception e) {
                // Fallback to external player
                playVideoExternal(url, title);
            }
        });
    }

    @JavascriptInterface
    public void playVideoExternal(String url, String title) {
        activity.runOnUiThread(() -> {
            try {
                Intent intent = new Intent(Intent.ACTION_VIEW);
                intent.setDataAndType(Uri.parse(url), "video/*");
                intent.putExtra(Intent.EXTRA_TITLE, title);
                intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
                activity.startActivity(Intent.createChooser(intent, "Play with external video player"));
            } catch (Exception e) {
                Toast.makeText(activity, "No external player found: " + e.getMessage(), Toast.LENGTH_SHORT).show();
            }
        });
    }

    @JavascriptInterface
    public void enterPip() {
        activity.runOnUiThread(() -> {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                try {
                    activity.enterPictureInPictureMode();
                } catch (Exception ignored) {}
            }
        });
    }

    @JavascriptInterface
    public void toggleOrientation(boolean landscape) {
        activity.runOnUiThread(() -> {
            try {
                activity.setRequestedOrientation(landscape
                        ? ActivityInfo.SCREEN_ORIENTATION_SENSOR_LANDSCAPE
                        : ActivityInfo.SCREEN_ORIENTATION_PORTRAIT);
            } catch (Exception ignored) {}
        });
    }

    @JavascriptInterface
    public String decryptSaavnUrl(String encryptedUrl) {
        if (encryptedUrl == null || encryptedUrl.isEmpty()) return "";
        try {
            byte[] keyBytes = "38346591".getBytes(java.nio.charset.StandardCharsets.UTF_8);
            javax.crypto.spec.DESKeySpec keySpec = new javax.crypto.spec.DESKeySpec(keyBytes);
            javax.crypto.SecretKeyFactory keyFactory = javax.crypto.SecretKeyFactory.getInstance("DES");
            javax.crypto.SecretKey key = keyFactory.generateSecret(keySpec);

            javax.crypto.Cipher cipher = javax.crypto.Cipher.getInstance("DES/ECB/PKCS5Padding");
            cipher.init(javax.crypto.Cipher.DECRYPT_MODE, key);

            byte[] encBytes = android.util.Base64.decode(encryptedUrl, android.util.Base64.DEFAULT);
            byte[] decBytes = cipher.doFinal(encBytes);
            String url = new String(decBytes, java.nio.charset.StandardCharsets.UTF_8);
            return url.replace("_96.mp4", "_320.mp4").replace("_160.mp4", "_320.mp4");
        } catch (Exception e) {
            e.printStackTrace();
            return "";
        }
    }

    @JavascriptInterface
    public void showToast(String message) {
        activity.runOnUiThread(() -> Toast.makeText(activity, message, Toast.LENGTH_SHORT).show());
    }
}
