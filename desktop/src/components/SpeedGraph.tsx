import { useId } from "react";
import type { SpeedSample } from "../lib/types";

/** Sparkline of the last 60 s of download speed (client-side samples). */
export function SpeedGraph({ samples, height = 56 }: { samples: SpeedSample[]; height?: number }) {
  const gradientId = useId();
  const points = samples.filter((sample) => sample.speed >= 0).slice(-120);

  if (points.length < 2) {
    return <div className="speed-graph empty" style={{ height }} />;
  }

  const width = 300;
  const t0 = points[0].t;
  const t1 = Math.max(points[points.length - 1].t, t0 + 1);
  const maxSpeed = Math.max(...points.map((sample) => sample.speed), 2048) * 1.15;

  const coords = points.map((sample) => {
    const x = ((sample.t - t0) / (t1 - t0)) * width;
    const y = height - (sample.speed / maxSpeed) * height;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });
  const line = coords.join(" ");
  const area = `0,${height} ${line} ${width},${height}`;

  return (
    <svg
      className="speed-graph"
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="none"
      style={{ height }}
      aria-hidden="true"
    >
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="var(--accent)" stopOpacity="0.35" />
          <stop offset="100%" stopColor="var(--accent)" stopOpacity="0" />
        </linearGradient>
      </defs>
      <polygon points={area} fill={`url(#${gradientId})`} />
      <polyline points={line} fill="none" stroke="var(--accent)" strokeWidth="1.5" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}
