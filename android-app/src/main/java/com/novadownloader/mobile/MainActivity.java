package com.novadownloader.mobile;

import android.Manifest;
import android.annotation.SuppressLint;
import android.app.Activity;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.content.pm.ActivityInfo;
import android.content.pm.PackageManager;
import android.graphics.Color;
import android.os.Build;
import android.os.Bundle;
import android.view.View;
import android.view.ViewGroup;
import android.view.Window;
import android.view.WindowManager;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.ProgressBar;

public class MainActivity extends Activity {

    private WebView webView;
    private ProgressBar splashLoader;
    private BroadcastReceiver musicEventReceiver;

    @SuppressLint("SetJavaScriptEnabled")
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        // Lock to Portrait Phone Orientation
        try {
            setRequestedOrientation(ActivityInfo.SCREEN_ORIENTATION_PORTRAIT);
        } catch (Exception ignored) {}

        // Immersive Dark Status & Navigation Bar
        Window window = getWindow();
        window.addFlags(WindowManager.LayoutParams.FLAG_DRAWS_SYSTEM_BAR_BACKGROUNDS);
        window.setStatusBarColor(Color.parseColor("#0B0710"));
        window.setNavigationBarColor(Color.parseColor("#0B0710"));

        setContentView(R.layout.activity_main);

        webView = findViewById(R.id.webView);
        splashLoader = findViewById(R.id.splashLoader);

        setupWebView();
        requestAppPermissions();
        setupMusicReceiver();

        webView.loadUrl("file:///android_asset/www/index.html");
    }

    @SuppressLint("SetJavaScriptEnabled")
    private void setupWebView() {
        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setDatabaseEnabled(true);
        settings.setMediaPlaybackRequiresUserGesture(false);
        settings.setAllowFileAccess(true);
        settings.setAllowContentAccess(true);
        settings.setAllowFileAccessFromFileURLs(true);
        settings.setAllowUniversalAccessFromFileURLs(true);
        settings.setLoadsImagesAutomatically(true);
        settings.setUseWideViewPort(true);
        settings.setLoadWithOverviewMode(true);
        settings.setSupportZoom(false);

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
            settings.setMixedContentMode(WebSettings.MIXED_CONTENT_ALWAYS_ALLOW);
        }

        webView.setBackgroundColor(Color.parseColor("#0B0710"));
        webView.setWebChromeClient(new WebChromeClient() {
            private View customView;
            private WebChromeClient.CustomViewCallback customViewCallback;

            @Override
            public void onShowCustomView(View view, CustomViewCallback callback) {
                if (customView != null) {
                    onHideCustomView();
                    return;
                }
                customView = view;
                customViewCallback = callback;
                try {
                    setRequestedOrientation(ActivityInfo.SCREEN_ORIENTATION_SENSOR_LANDSCAPE);
                } catch (Exception ignored) {}

                ViewGroup decor = (ViewGroup) getWindow().getDecorView();
                decor.addView(customView, new ViewGroup.LayoutParams(
                        ViewGroup.LayoutParams.MATCH_PARENT,
                        ViewGroup.LayoutParams.MATCH_PARENT));
                webView.setVisibility(View.GONE);
            }

            @Override
            public void onHideCustomView() {
                if (customView == null) return;
                try {
                    setRequestedOrientation(ActivityInfo.SCREEN_ORIENTATION_PORTRAIT);
                } catch (Exception ignored) {}

                ViewGroup decor = (ViewGroup) getWindow().getDecorView();
                decor.removeView(customView);
                customView = null;
                if (customViewCallback != null) {
                    customViewCallback.onCustomViewHidden();
                    customViewCallback = null;
                }
                webView.setVisibility(View.VISIBLE);
            }
        });
        webView.setWebViewClient(new WebViewClient() {
            @Override
            public void onPageFinished(WebView view, String url) {
                if (splashLoader != null) {
                    splashLoader.setVisibility(View.GONE);
                }
            }

            @Override
            public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
                if (request == null || request.getUrl() == null) {
                    return super.shouldInterceptRequest(view, request);
                }

                String urlStr = request.getUrl().toString();

                if (urlStr.contains("aoneroom.com") ||
                    urlStr.contains("videodownloader.site") ||
                    urlStr.contains("staticjs.org") ||
                    urlStr.contains("hakunaymatata.com") ||
                    urlStr.contains("jiosaavn.com") ||
                    urlStr.contains("saavncdn.com")) {
                    try {
                        java.net.URL targetUrl = new java.net.URL(urlStr);
                        java.net.HttpURLConnection conn = (java.net.HttpURLConnection) targetUrl.openConnection();
                        conn.setRequestMethod(request.getMethod());
                        conn.setConnectTimeout(20000);
                        conn.setReadTimeout(35000);
                        conn.setInstanceFollowRedirects(true);

                        java.util.Map<String, String> reqHeaders = request.getRequestHeaders();
                        if (reqHeaders != null) {
                            for (java.util.Map.Entry<String, String> h : reqHeaders.entrySet()) {
                                conn.setRequestProperty(h.getKey(), h.getValue());
                            }
                        }

                        // Attach required domain bypass headers
                        conn.setRequestProperty("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36");
                        if (urlStr.contains("jiosaavn.com") || urlStr.contains("saavncdn.com")) {
                            conn.setRequestProperty("Origin", "https://www.jiosaavn.com");
                            conn.setRequestProperty("Referer", "https://www.jiosaavn.com/");
                        } else {
                            conn.setRequestProperty("Origin", "https://videodownloader.site");
                            conn.setRequestProperty("Referer", "https://videodownloader.site/");
                            conn.setRequestProperty("x-request-lang", "en");
                        }

                        int statusCode = conn.getResponseCode();
                        java.io.InputStream is = (statusCode >= 200 && statusCode < 400) ? conn.getInputStream() : conn.getErrorStream();

                        String mimeType = conn.getContentType();
                        if (mimeType == null || mimeType.isEmpty()) {
                            mimeType = urlStr.contains(".mp4") ? "video/mp4" : "application/octet-stream";
                        }
                        if (mimeType.contains(";")) {
                            mimeType = mimeType.split(";")[0].trim();
                        }

                        String encoding = conn.getContentEncoding();
                        if (encoding == null || encoding.isEmpty()) {
                            encoding = "UTF-8";
                        }

                        java.util.Map<String, String> respHeaders = new java.util.HashMap<>();
                        for (java.util.Map.Entry<String, java.util.List<String>> entry : conn.getHeaderFields().entrySet()) {
                            if (entry.getKey() != null && entry.getValue() != null && !entry.getValue().isEmpty()) {
                                respHeaders.put(entry.getKey(), entry.getValue().get(0));
                            }
                        }
                        respHeaders.put("Access-Control-Allow-Origin", "*");
                        respHeaders.put("Access-Control-Allow-Methods", "GET, HEAD, OPTIONS");
                        respHeaders.put("Access-Control-Allow-Headers", "*");

                        String message = conn.getResponseMessage();
                        if (message == null || message.isEmpty()) {
                            message = (statusCode == 206) ? "Partial Content" : (statusCode == 200 ? "OK" : "Status " + statusCode);
                        }

                        return new WebResourceResponse(mimeType, encoding, statusCode, message, respHeaders, is);
                    } catch (Exception e) {
                        e.printStackTrace();
                    }
                }

                return super.shouldInterceptRequest(view, request);
            }
        });

        // Attach Native Android Bridge
        webView.addJavascriptInterface(new AndroidBridge(this, webView), "AndroidBridge");
    }

    private void setupMusicReceiver() {
        musicEventReceiver = new BroadcastReceiver() {
            @Override
            public void onReceive(Context context, Intent intent) {
                if (intent == null) return;
                String event = intent.getStringExtra("event");
                int position = intent.getIntExtra("position", 0);
                int duration = intent.getIntExtra("duration", 0);

                if (webView != null && event != null) {
                    String script = String.format("window.onNativeMusicEvent && window.onNativeMusicEvent('%s', %d, %d);", event, position, duration);
                    webView.evaluateJavascript(script, null);
                }
            }
        };

        IntentFilter filter = new IntentFilter(MusicService.BROADCAST_EVENT);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            registerReceiver(musicEventReceiver, filter, Context.RECEIVER_NOT_EXPORTED);
        } else {
            registerReceiver(musicEventReceiver, filter);
        }
    }

    private void requestAppPermissions() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            if (checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) {
                requestPermissions(new String[]{
                        Manifest.permission.POST_NOTIFICATIONS,
                        Manifest.permission.READ_MEDIA_AUDIO,
                        Manifest.permission.READ_MEDIA_VIDEO
                }, 101);
            }
        } else if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            if (checkSelfPermission(Manifest.permission.WRITE_EXTERNAL_STORAGE) != PackageManager.PERMISSION_GRANTED) {
                requestPermissions(new String[]{
                        Manifest.permission.WRITE_EXTERNAL_STORAGE,
                        Manifest.permission.READ_EXTERNAL_STORAGE
                }, 102);
            }
        }
    }

    @Override
    public void onBackPressed() {
        if (webView != null) {
            webView.evaluateJavascript("window.handleBackPress ? window.handleBackPress() : false;", value -> {
                if (!"true".equals(value)) {
                    if (webView.canGoBack()) {
                        webView.goBack();
                    } else {
                        // Move task to back so music keeps playing smoothly without closing the app
                        moveTaskToBack(true);
                    }
                }
            });
            return;
        }
        moveTaskToBack(true);
    }

    @Override
    protected void onDestroy() {
        super.onDestroy();
        if (musicEventReceiver != null) {
            try {
                unregisterReceiver(musicEventReceiver);
            } catch (Exception ignored) {}
        }
    }
}
