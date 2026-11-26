import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const STORAGE_ROOT = path.resolve(__dirname, "../storage");
export const ORIGINALS_DIR = path.join(STORAGE_ROOT, "originals");

export async function ensureStorageDirectories() {
  await fs.mkdir(ORIGINALS_DIR, { recursive: true });
}

/**
 * Resolve a storage key safely inside ORIGINALS_DIR, preventing directory traversal.
 */
export function resolveOriginalFilePath(storageKey) {
  if (!storageKey || typeof storageKey !== "string") {
    return null;
  }
  const normalized = path.normalize(storageKey).replace(/^(\.\.(\/|\\|$))+/, "");
  const fullPath = path.resolve(ORIGINALS_DIR, normalized);
  if (!fullPath.startsWith(ORIGINALS_DIR + path.sep)) {
    return null;
  }
  return fullPath;
}

/**
 * Build an artistic SVG photograph for demo/seed events so the app works offline
 * and demonstrates private original storage vs. watermarked preview separation.
 */
export function buildDemoPhotoSvg({
  title,
  eventName,
  photographerName,
  palette = ["#4f46e5", "#ec4899", "#f59e0b"],
  photoNumber = 1,
  watermarked = false,
}) {
  const [c1, c2, c3] = palette;
  const safeTitle = escapeXml(title);
  const safeEvent = escapeXml(eventName);
  const safePhotographer = escapeXml(photographerName);

  const watermarkLayer = watermarked
    ? `
    <g opacity="0.26" transform="rotate(-24 600 400)">
      <text x="120" y="210" font-family="Arial, sans-serif" font-size="44" font-weight="700" fill="#ffffff" letter-spacing="6">CELEBRARE PREVIEW • UNPAID</text>
      <text x="160" y="420" font-family="Arial, sans-serif" font-size="52" font-weight="800" fill="#ffffff" letter-spacing="8">PREVIEW ONLY • ${safePhotographer.toUpperCase()}</text>
      <text x="140" y="630" font-family="Arial, sans-serif" font-size="44" font-weight="700" fill="#ffffff" letter-spacing="6">PAY VIA UPI TO UNLOCK ORIGINAL</text>
    </g>
    `
    : `
    <g opacity="0.9">
      <rect x="44" y="718" width="420" height="44" rx="10" fill="rgba(15, 23, 42, 0.55)" />
      <text x="64" y="746" font-family="Arial, sans-serif" font-size="18" font-weight="600" fill="#f8fafc">${safePhotographer} • Original Licensed Print #${photoNumber}</text>
    </g>
    `;

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 800" width="1200" height="800">
  <defs>
    <linearGradient id="bg-${photoNumber}" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="${c1}" />
      <stop offset="55%" stop-color="${c2}" />
      <stop offset="100%" stop-color="${c3}" />
    </linearGradient>
    <radialGradient id="glow-${photoNumber}" cx="35%" cy="30%" r="65%">
      <stop offset="0%" stop-color="rgba(255,255,255,0.45)" />
      <stop offset="100%" stop-color="rgba(255,255,255,0)" />
    </radialGradient>
  </defs>
  <rect width="1200" height="800" fill="url(#bg-${photoNumber})" />
  <rect width="1200" height="800" fill="url(#glow-${photoNumber})" />
  <circle cx="${260 + ((photoNumber * 97) % 680)}" cy="${220 + ((photoNumber * 61) % 240)}" r="170" fill="rgba(255,255,255,0.14)" />
  <circle cx="${880 - ((photoNumber * 83) % 450)}" cy="${520 - ((photoNumber * 47) % 180)}" r="120" fill="rgba(15,23,42,0.18)" />
  <path d="M0 640 Q 320 510 620 620 T 1200 570 L 1200 800 L 0 800 Z" fill="rgba(15, 23, 42, 0.28)" />
  <rect x="44" y="44" width="230" height="38" rx="19" fill="rgba(255,255,255,0.22)" />
  <text x="64" y="69" font-family="Arial, sans-serif" font-size="16" font-weight="700" fill="#ffffff">${safeEvent}</text>
  <text x="60" y="395" font-family="Georgia, serif" font-size="56" font-weight="700" fill="#ffffff">${safeTitle}</text>
  <text x="60" y="445" font-family="Arial, sans-serif" font-size="24" fill="rgba(255,255,255,0.88)">Shot by ${safePhotographer} • Frame #${photoNumber}</text>
  ${watermarkLayer}
</svg>`;
}

/**
 * Create a watermarked SVG preview wrapper when serving an uploaded raster image preview,
 * or return watermarked SVG directly for SVG originals.
 */
export function buildWatermarkedPreviewWrapper({
  title,
  photographerName,
  eventName,
  photoId,
}) {
  return buildDemoPhotoSvg({
    title,
    eventName,
    photographerName,
    photoNumber: photoId,
    watermarked: true,
  });
}

function escapeXml(value = "") {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}
