import { ImageResponse } from "next/og";

export const OG_SIZE = { width: 1200, height: 630 };

/** Static Open Graph card in the Gallery look: ivory, ink headline, cobalt eyebrow. */
export function renderOg(eyebrow: string, title: string): ImageResponse {
  return new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        background: "#fafaf8",
        padding: "88px 96px",
        color: "#15161a",
      }}
    >
      <div style={{ display: "flex", fontSize: 30, letterSpacing: -0.5 }}>WealthKart</div>
      <div style={{ display: "flex", flexDirection: "column" }}>
        <div
          style={{
            display: "flex",
            fontSize: 22,
            letterSpacing: 3,
            textTransform: "uppercase",
            color: "#2c4596",
          }}
        >
          {eyebrow}
        </div>
        <div
          style={{ display: "flex", marginTop: 28, fontSize: 68, lineHeight: 1.05, maxWidth: 940 }}
        >
          {title}
        </div>
      </div>
      <div style={{ display: "flex", fontSize: 22, color: "#6b6d75" }}>
        Private savings circles for friends, on Avalanche
      </div>
    </div>,
    OG_SIZE,
  );
}
