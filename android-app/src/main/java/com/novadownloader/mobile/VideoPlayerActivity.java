package com.novadownloader.mobile;

import android.app.Activity;
import android.content.Intent;
import android.content.pm.ActivityInfo;
import android.graphics.Color;
import android.media.MediaPlayer;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.view.MotionEvent;
import android.view.View;
import android.view.Window;
import android.view.WindowManager;
import android.widget.ImageButton;
import android.widget.ProgressBar;
import android.widget.RelativeLayout;
import android.widget.SeekBar;
import android.widget.TextView;
import android.widget.Toast;
import android.widget.VideoView;

import java.util.HashMap;
import java.util.Locale;
import java.util.Map;

public class VideoPlayerActivity extends Activity {

    private VideoView videoView;
    private ProgressBar progressBar;
    private RelativeLayout controlsOverlay;
    private RelativeLayout topBar;
    private TextView titleText;
    private ImageButton backBtn;
    private ImageButton playPauseBtn;
    private ImageButton rewindBtn;
    private ImageButton forwardBtn;
    private SeekBar seekBar;
    private TextView timeCurrent;
    private TextView timeTotal;

    private String videoUrl = "";
    private String videoTitle = "Playing Video";

    private final Handler handler = new Handler(Looper.getMainLooper());
    private boolean isControlsShowing = true;
    private boolean isUserSeeking = false;

    private final Runnable updateProgressRunnable = new Runnable() {
        @Override
        public void run() {
            if (videoView != null && videoView.isPlaying() && !isUserSeeking) {
                int current = videoView.getCurrentPosition();
                int total = videoView.getDuration();
                seekBar.setProgress(current);
                timeCurrent.setText(formatTime(current));
            }
            handler.postDelayed(this, 500);
        }
    };

    private final Runnable hideControlsRunnable = new Runnable() {
        @Override
        public void run() {
            hideControls();
        }
    };

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        // Immersive Fullscreen
        requestWindowFeature(Window.FEATURE_NO_TITLE);
        getWindow().setFlags(WindowManager.LayoutParams.FLAG_FULLSCREEN, WindowManager.LayoutParams.FLAG_FULLSCREEN);
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);

        hideSystemUI();

        setContentView(R.layout.activity_video_player);

        Intent intent = getIntent();
        if (intent != null) {
            videoUrl = intent.getStringExtra("url");
            videoTitle = intent.getStringExtra("title");
        }

        initViews();
        setupListeners();

        if (videoUrl == null || videoUrl.isEmpty()) {
            Toast.makeText(this, "Video URL is invalid", Toast.LENGTH_SHORT).show();
            finish();
            return;
        }

        startVideo();
    }

    private void hideSystemUI() {
        View decorView = getWindow().getDecorView();
        decorView.setSystemUiVisibility(
                View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY
                        | View.SYSTEM_UI_FLAG_LAYOUT_STABLE
                        | View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION
                        | View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN);
    }

    private void initViews() {
        videoView = findViewById(R.id.nativeVideoView);
        progressBar = findViewById(R.id.videoProgressBar);
        controlsOverlay = findViewById(R.id.videoControlsOverlay);
        topBar = findViewById(R.id.videoTopBar);
        titleText = findViewById(R.id.videoTitleText);
        backBtn = findViewById(R.id.videoBackBtn);
        playPauseBtn = findViewById(R.id.videoPlayPauseBtn);
        rewindBtn = findViewById(R.id.videoRewindBtn);
        forwardBtn = findViewById(R.id.videoForwardBtn);
        seekBar = findViewById(R.id.videoSeekBar);
        timeCurrent = findViewById(R.id.videoTimeCurrent);
        timeTotal = findViewById(R.id.videoTimeTotal);

        if (videoTitle != null && !videoTitle.isEmpty()) {
            titleText.setText(videoTitle);
        }
    }

    private void setupListeners() {
        backBtn.setOnClickListener(v -> finish());

        playPauseBtn.setOnClickListener(v -> {
            if (videoView.isPlaying()) {
                videoView.pause();
                playPauseBtn.setImageResource(R.drawable.ic_play);
                handler.removeCallbacks(hideControlsRunnable);
            } else {
                videoView.start();
                playPauseBtn.setImageResource(R.drawable.ic_pause);
                scheduleHideControls();
            }
        });

        rewindBtn.setOnClickListener(v -> {
            int current = videoView.getCurrentPosition();
            videoView.seekTo(Math.max(0, current - 10000));
            scheduleHideControls();
        });

        forwardBtn.setOnClickListener(v -> {
            int current = videoView.getCurrentPosition();
            int total = videoView.getDuration();
            videoView.seekTo(Math.min(total, current + 10000));
            scheduleHideControls();
        });

        seekBar.setOnSeekBarChangeListener(new SeekBar.OnSeekBarChangeListener() {
            @Override
            public void onProgressChanged(SeekBar sb, int progress, boolean fromUser) {
                if (fromUser) {
                    timeCurrent.setText(formatTime(progress));
                }
            }

            @Override
            public void onStartTrackingTouch(SeekBar sb) {
                isUserSeeking = true;
                handler.removeCallbacks(hideControlsRunnable);
            }

            @Override
            public void onStopTrackingTouch(SeekBar sb) {
                isUserSeeking = false;
                videoView.seekTo(sb.getProgress());
                scheduleHideControls();
            }
        });

        findViewById(R.id.videoRootLayout).setOnClickListener(v -> toggleControls());
    }

    private void toggleControls() {
        if (isControlsShowing) {
            hideControls();
        } else {
            showControls();
        }
    }

    private void showControls() {
        controlsOverlay.setVisibility(View.VISIBLE);
        isControlsShowing = true;
        hideSystemUI();
        scheduleHideControls();
    }

    private void hideControls() {
        if (videoView != null && videoView.isPlaying()) {
            controlsOverlay.setVisibility(View.GONE);
            isControlsShowing = false;
            hideSystemUI();
        }
    }

    private void scheduleHideControls() {
        handler.removeCallbacks(hideControlsRunnable);
        handler.postDelayed(hideControlsRunnable, 4000);
    }

    private void startVideo() {
        try {
            progressBar.setVisibility(View.VISIBLE);

            Map<String, String> headers = new HashMap<>();
            headers.put("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36");
            headers.put("Origin", "https://videodownloader.site");
            headers.put("Referer", "https://videodownloader.site/");
            headers.put("x-request-lang", "en");

            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
                videoView.setVideoURI(Uri.parse(videoUrl), headers);
            } else {
                videoView.setVideoURI(Uri.parse(videoUrl));
            }

            videoView.setOnPreparedListener(mp -> {
                progressBar.setVisibility(View.GONE);
                int duration = videoView.getDuration();
                seekBar.setMax(duration);
                timeTotal.setText(formatTime(duration));
                videoView.start();
                playPauseBtn.setImageResource(R.drawable.ic_pause);
                handler.post(updateProgressRunnable);
                scheduleHideControls();
            });

            videoView.setOnErrorListener((mp, what, extra) -> {
                progressBar.setVisibility(View.GONE);
                Toast.makeText(VideoPlayerActivity.this, "Cannot play this stream with internal player. Opening external player...", Toast.LENGTH_SHORT).show();
                try {
                    Intent extIntent = new Intent(Intent.ACTION_VIEW);
                    extIntent.setDataAndType(Uri.parse(videoUrl), "video/*");
                    extIntent.putExtra(Intent.EXTRA_TITLE, videoTitle);
                    startActivity(Intent.createChooser(extIntent, "Play with external player"));
                } catch (Exception ignored) {}
                finish();
                return true;
            });

            videoView.setOnCompletionListener(mp -> finish());

        } catch (Exception e) {
            progressBar.setVisibility(View.GONE);
            Toast.makeText(this, "Error playing video: " + e.getMessage(), Toast.LENGTH_SHORT).show();
            finish();
        }
    }

    private String formatTime(int ms) {
        int seconds = (ms / 1000) % 60;
        int minutes = (ms / (1000 * 60)) % 60;
        int hours = (ms / (1000 * 60 * 60));
        if (hours > 0) {
            return String.format(Locale.US, "%02d:%02d:%02d", hours, minutes, seconds);
        }
        return String.format(Locale.US, "%02d:%02d", minutes, seconds);
    }

    @Override
    protected void onPause() {
        super.onPause();
        handler.removeCallbacks(updateProgressRunnable);
        handler.removeCallbacks(hideControlsRunnable);
        if (videoView != null && videoView.isPlaying()) {
            videoView.pause();
        }
    }

    @Override
    protected void onResume() {
        super.onResume();
        if (videoView != null && !videoView.isPlaying()) {
            videoView.start();
            handler.post(updateProgressRunnable);
        }
    }

    @Override
    protected void onDestroy() {
        super.onDestroy();
        handler.removeCallbacksAndMessages(null);
        if (videoView != null) {
            videoView.stopPlayback();
        }
    }
}