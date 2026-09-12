import { GlassCard } from "../components/GlassCard";
import { NumberField, SelectField, SliderField, TextField, Toggle } from "../components/fields";
import { getNova } from "../lib/electron";
import type { Settings } from "../lib/types";
import { useSettings } from "../state/SettingsContext";
import { useToast } from "../state/ToastContext";

export function SettingsPage() {
  const { settings, update, reset } = useSettings();
  const toast = useToast();
  const nova = getNova();

  if (!settings) {
    return <div className="page-inner">Loading settings…</div>;
  }

  const pickFolder = async () => {
    if (!nova) {
      toast.info("Folder picker unavailable", "Type the full path instead (available in the desktop app).");
      return;
    }
    const folder = await nova.pickFolder();
    if (folder) void update({ download_folder: folder });
  };

  const copyToken = async () => {
    try {
      await navigator.clipboard.writeText(settings.api_token);
      toast.success("Pairing token copied");
    } catch {
      toast.error("Could not copy", "Select the text and copy it manually.");
    }
  };

  const set = (patch: Partial<Settings>) => void update(patch);

  return (
    <div className="page-inner">
      <div className="page-header">
        <div>
          <h1>Settings</h1>
          <p className="page-subtitle">Changes apply immediately and persist to {settings.config_path ?? "config.json"}</p>
        </div>
      </div>

      <h2 className="settings-section-title">Downloads</h2>
      <GlassCard className="settings-card">
        <TextField
          label="Download folder"
          hint="Where finished files are saved"
          value={settings.download_folder}
          mono
          onChange={(value) => set({ download_folder: value })}
          action={
            <button type="button" className="btn ghost" onClick={() => void pickFolder()}>
              Browse…
            </button>
          }
        />
        <NumberField
          label="Simultaneous downloads"
          hint="How many tasks run at once (1–6)"
          value={settings.max_concurrent_downloads}
          min={1}
          max={6}
          onChange={(value) => set({ max_concurrent_downloads: value })}
        />
        <NumberField
          label="Connections per download"
          hint="Fragmented downloader connections (1–16)"
          value={settings.connections}
          min={1}
          max={16}
          onChange={(value) => set({ connections: value })}
        />
        <NumberField
          label="Retries"
          hint="Automatic retries before a task fails (0–10)"
          value={settings.retries}
          min={0}
          max={10}
          onChange={(value) => set({ retries: value })}
        />
        <NumberField
          label="Speed limit (KB/s)"
          hint="0 = unlimited"
          value={settings.speed_limit_kbps}
          min={0}
          max={1000000}
          step={100}
          onChange={(value) => set({ speed_limit_kbps: value })}
        />
      </GlassCard>

      <h2 className="settings-section-title">Behaviour</h2>
      <GlassCard className="settings-card">
        <Toggle
          label="Notifications"
          hint="Toast + system notification when a download completes or fails"
          checked={settings.notifications}
          onChange={(value) => set({ notifications: value })}
        />
        <Toggle
          label="Clipboard monitor"
          hint="Detect copied video links and offer to analyze them"
          checked={settings.clipboard_monitor}
          onChange={(value) => set({ clipboard_monitor: value })}
        />
        <Toggle
          label="Minimize to tray"
          hint="The close button hides the window instead of quitting"
          checked={settings.minimize_to_tray}
          onChange={(value) => set({ minimize_to_tray: value })}
        />
        <Toggle
          label="Start with Windows"
          hint="Registers the packaged app at login"
          checked={settings.start_with_windows}
          onChange={(value) => set({ start_with_windows: value })}
        />
      </GlassCard>

      <h2 className="settings-section-title">Appearance</h2>
      <GlassCard className="settings-card">
        <Toggle
          label="Animated background"
          hint="Drop a video as assets/background.mp4 (falls back to a gradient)"
          checked={settings.animated_background}
          onChange={(value) => set({ animated_background: value })}
        />
        <SliderField
          label="Overlay strength"
          value={settings.background_opacity}
          min={0}
          max={1}
          step={0.05}
          format={(value) => `${Math.round(value * 100)}%`}
          onChange={(value) => set({ background_opacity: value })}
        />
        <SliderField
          label="Blur"
          value={settings.blur_intensity}
          min={0}
          max={1}
          step={0.05}
          format={(value) => `${Math.round(value * 100)}%`}
          onChange={(value) => set({ blur_intensity: value })}
        />
        <SliderField
          label="Animation intensity"
          value={settings.animation_intensity}
          min={0}
          max={1.5}
          step={0.1}
          format={(value) => `${value.toFixed(1)}×`}
          onChange={(value) => set({ animation_intensity: value })}
        />
      </GlassCard>

      <h2 className="settings-section-title">Advanced</h2>
      <GlassCard className="settings-card">
        <TextField
          label="FFmpeg path"
          hint="Empty = auto-discovery (bundled → PATH); used for merging"
          value={settings.ffmpeg_path}
          mono
          placeholder="(auto)"
          onChange={(value) => set({ ffmpeg_path: value })}
        />
        <SelectField
          label="Log level"
          hint="Written to %APPDATA%/novadownloader/logs/"
          value={settings.log_level}
          options={[
            { value: "debug", label: "Debug" },
            { value: "info", label: "Info" },
            { value: "warning", label: "Warning" },
            { value: "error", label: "Error" },
          ]}
          onChange={(value) => set({ log_level: value })}
        />
        <NumberField
          label="Local API port"
          hint="Restart the app to apply (default 8765)"
          value={settings.api_port}
          min={1024}
          max={65535}
          onChange={(value) => set({ api_port: value })}
        />
        <div className="field token-field">
          <div className="field-text">
            <span className="field-label">Pairing token</span>
            <span className="field-hint">Paste once into the Chrome extension popup</span>
          </div>
          <div className="field-row">
            <input className="input mono" type="text" readOnly value={settings.api_token} />
            <button type="button" className="btn ghost" onClick={() => void copyToken()}>
              Copy
            </button>
          </div>
        </div>
        <Toggle
          label="Require pairing token"
          hint="Extra check on every mutating API call"
          checked={settings.api_token_enabled}
          onChange={(value) => set({ api_token_enabled: value })}
        />
      </GlassCard>

      <div className="settings-footer">
        <button
          type="button"
          className="btn ghost danger"
          onClick={() => {
            if (window.confirm("Reset all settings to their defaults? (Download folder and API settings are kept.)")) {
              void reset();
            }
          }}
        >
          Reset to defaults
        </button>
      </div>
    </div>
  );
}
