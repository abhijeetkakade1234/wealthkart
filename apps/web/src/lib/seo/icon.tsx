import { ImageResponse } from "next/og";

const IVORY = "#fafaf8";
const INK = "#15161a";
const COBALT = "#2c4596";

/**
 * App icon: a cobalt ring (the circle) with three ink dots (the friends), on ivory.
 * Same drawing as `app/icon.svg`. `maskable` keeps the art inside the 80% safe zone.
 */
export function renderIcon(size: number, { maskable = false } = {}): ImageResponse {
  const scale = maskable ? 0.62 : 0.8;
  const ring = size * 0.53 * scale;
  const stroke = Math.max(2, size * 0.078 * scale);
  const dot = size * 0.156 * scale;
  const r = ring / 2;
  // three dots on the ring at 90°, 210°, 330°
  const dots = [90, 210, 330].map((deg) => {
    const rad = (deg * Math.PI) / 180;
    return { x: size / 2 + r * Math.cos(rad) - dot / 2, y: size / 2 - r * Math.sin(rad) - dot / 2 };
  });
  return new ImageResponse(
    <div
      style={{
        width: size,
        height: size,
        display: "flex",
        position: "relative",
        background: IVORY,
      }}
    >
      <div
        style={{
          position: "absolute",
          left: size / 2 - r,
          top: size / 2 - r,
          width: ring,
          height: ring,
          borderRadius: ring,
          border: `${stroke}px solid ${COBALT}`,
        }}
      />
      {dots.map((d, i) => (
        <div
          key={i}
          style={{
            position: "absolute",
            left: d.x,
            top: d.y,
            width: dot,
            height: dot,
            borderRadius: dot,
            background: INK,
          }}
        />
      ))}
    </div>,
    { width: size, height: size },
  );
}
