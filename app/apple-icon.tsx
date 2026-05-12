import { ImageResponse } from "next/og";

// iOS uses this for "Add to Home Screen". Next renders it on demand at the
// returned size and serves a PNG.
export const size = { width: 180, height: 180 };
export const contentType = "image/png";

export default function AppleIcon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          background: "#2563eb",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          borderRadius: 40,
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 12,
            background: "#ffffff",
            color: "#2563eb",
            width: 116,
            height: 92,
            borderRadius: 22,
            position: "relative",
            fontSize: 36,
            fontWeight: 700,
          }}
        >
          {/* three dots resembling the conversation bubble in icon.svg */}
          <span style={{ width: 12, height: 12, borderRadius: 6, background: "#2563eb" }} />
          <span style={{ width: 12, height: 12, borderRadius: 6, background: "#2563eb" }} />
          <span style={{ width: 12, height: 12, borderRadius: 6, background: "#2563eb" }} />
        </div>
      </div>
    ),
    size,
  );
}
