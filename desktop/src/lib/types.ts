export interface MediaFormat {
  id: string;
  kind: "video" | "audio" | "combined";
  ext: string;
  vcodec: string | null;
  acodec: string | null;
  height: number | null;
  fps: number | null;
  tbr: number | null; // total bitrate, kbps
  filesize: number | null; // bytes, when known
  language: string | null;
}

export interface AudioTrack {
  language: string; // "original" or ISO code
  label: string;
}

export interface SubtitleTrack {
  language: string;
  name: string;
  auto: boolean;
  ext: string;
}

export interface MediaInfo {
  url: string;
  title: string;
  uploader: string | null;
  thumbnail: string | null;
  duration: number | null;
  is_live: boolean;
  qualities: string[]; // e.g. ["best", "4K", "1080p", "audio"]
  formats: MediaFormat[];
  audio_tracks: AudioTrack[];
  subtitles: SubtitleTrack[];
}

export type TaskStatus =
  | "queued"
  | "analyzing"
  | "downloading"
  | "processing"
  | "paused"
  | "completed"
  | "failed"
  | "cancelled";

export interface DownloadTask {
  id: number;
  url: string;
  title: string;
  uploader: string | null;
  thumbnail: string | null;
  duration: number | null;
  status: TaskStatus;
  progress: number; // 0..1
  downloaded_bytes: number;
  total_bytes: number | null;
  speed: number; // bytes/second
  eta: number | null;
  quality: string;
  container: string;
  audio_language: string;
  subtitle_mode: "none" | "external" | "embedded";
  subtitle_lang: string | null;
  error_code: string;
  error_message: string;
  file_path: string;
  created_at: string;
  started_at: string | null;
  completed_at: string | null;
  priority: number;
}

export interface Settings {
  download_folder: string;
  max_concurrent_downloads: number;
  connections: number;
  retries: number;
  speed_limit_kbps: number;
  api_port: number;
  api_token_enabled: boolean;
  api_token: string;
  clipboard_monitor: boolean;
  minimize_to_tray: boolean;
  start_with_windows: boolean;
  notifications: boolean;
  animated_background: boolean;
  background_opacity: number;
  blur_intensity: number;
  animation_intensity: number;
  ffmpeg_path: string;
  log_level: "debug" | "info" | "warning" | "error";
  config_path?: string;
}

export interface HistoryRow {
  id: number;
  url: string;
  title: string | null;
  uploader: string | null;
  thumbnail_url: string | null;
  duration_s: number | null;
  quality: string | null;
  container: string | null;
  audio_language: string | null;
  subtitle_mode: string | null;
  subtitle_lang: string | null;
  status: TaskStatus;
  progress: number;
  total_bytes: number | null;
  downloaded_bytes: number;
  file_path: string | null;
  error_code: string | null;
  error_message: string | null;
  created_at: string;
  updated_at: string;
  started_at: string | null;
  completed_at: string | null;
}

export interface DownloadBody {
  url: string;
  quality: string;
  format: string;
  audio_language: string;
  subtitle_mode: "none" | "external" | "embedded";
  subtitle_lang: string | null;
}

export interface SpeedSample {
  t: number; // epoch ms
  speed: number; // bytes/second
}
