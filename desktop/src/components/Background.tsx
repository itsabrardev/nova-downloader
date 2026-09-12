import { useState } from "react";
import { useSettings } from "../state/SettingsContext";

const SOURCES = ["/assets/background.mp4", "/assets/background.webm", "/assets/background.mov"];

/** Optional looping muted background video with a static-gradient fallback. */
export function Background() {
  const { settings } = useSettings();
  const [sourceIndex, setSourceIndex] = useState(0);
  const [failed, setFailed] = useState(false);

  const enabled = settings?.animated_background ?? true;
  const opacity = settings?.background_opacity ?? 0.35;
  const blur = settings?.blur_intensity ?? 0.5;
  const showVideo = enabled && !failed && sourceIndex < SOURCES.length;

  return (
    <div className="background" aria-hidden="true">
      <div className="background-gradient" />
      {showVideo && (
        <video
          key={SOURCES[sourceIndex]}
          className="background-video"
          src={SOURCES[sourceIndex]}
          autoPlay
          loop
          muted
          playsInline
          onError={() => {
            if (sourceIndex + 1 < SOURCES.length) setSourceIndex(sourceIndex + 1);
            else setFailed(true);
          }}
        />
      )}
      <div
        className="background-overlay"
        style={{ backdropFilter: `blur(${Math.round(blur * 28)}px)`, backgroundColor: `rgba(4, 7, 14, ${opacity})` }}
      />
    </div>
  );
}
