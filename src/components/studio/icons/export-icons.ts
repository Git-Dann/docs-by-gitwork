// App-icon export. Each appearance/layer is rendered ONCE at 1024px (html-to-image) then downscaled
// to every target size with a high-quality canvas draw — far cheaper and crisper than rasterizing
// dozens of DOM nodes. Assembles a drop-in iOS AppIcon.appiconset (with a valid Contents.json +
// light/dark/tinted appearances) and an Android res/ tree (mipmap densities, adaptive-icon XML,
// monochrome layer, 512 Play icon), zipped with fflate. Export is always full-bleed square; the OS
// applies its own mask (ic_launcher_round is the one legitimately circle-masked asset).

import { toPng } from "html-to-image";
import { zipSync, strToU8 } from "fflate";
import { ANDROID_DENSITIES, ANDROID_PLAY_PX, IOS_ICONS, IOS_LIGHT_PX } from "./config";

type NodeMap = Record<string, HTMLElement>; // keys: light, dark, tinted, fg, bg, mono

interface ExportOpts {
  tinted: boolean;
  platforms: { ios: boolean; android: boolean };
}

function dataUrlToBytes(dataUrl: string): Uint8Array {
  const base64 = dataUrl.slice(dataUrl.indexOf(",") + 1);
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function loadImage(dataUrl: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = dataUrl;
  });
}

async function rasterizeMaster(node: HTMLElement): Promise<HTMLImageElement> {
  // No backgroundColor → transparency preserved for the foreground / background / mono layers.
  const dataUrl = await toPng(node, { pixelRatio: 1, cacheBust: true });
  return loadImage(dataUrl);
}

function drawScaled(img: HTMLImageElement, size: number, circle = false): Uint8Array {
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d")!;
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  if (circle) {
    ctx.beginPath();
    ctx.arc(size / 2, size / 2, size / 2, 0, Math.PI * 2);
    ctx.closePath();
    ctx.clip();
  }
  ctx.drawImage(img, 0, 0, size, size);
  return dataUrlToBytes(canvas.toDataURL("image/png"));
}

function iosContentsJson(tinted: boolean): string {
  const images: Record<string, string>[] = IOS_ICONS.map((s) => ({
    size: s.size,
    idiom: s.idiom,
    filename: `Icon-${s.px}.png`,
    scale: s.scale,
  }));
  images.push({ size: "1024x1024", idiom: "ios-marketing", filename: "Icon-1024.png", scale: "1x" });
  // Dark + tinted appearances (Xcode 15+ single-size). Appearances arrays are added below.
  const marketingDark = { size: "1024x1024", idiom: "ios-marketing", filename: "Icon-1024-dark.png", scale: "1x", appearances: [{ appearance: "luminosity", value: "dark" }] };
  const marketingTinted = { size: "1024x1024", idiom: "ios-marketing", filename: "Icon-1024-tinted.png", scale: "1x", appearances: [{ appearance: "luminosity", value: "tinted" }] };
  const all: unknown[] = [...images, marketingDark];
  if (tinted) all.push(marketingTinted);
  return JSON.stringify({ images: all, info: { author: "gitwork-foundry-studio", version: 1 } }, null, 2);
}

function adaptiveXml(mono: boolean): string {
  return `<?xml version="1.0" encoding="utf-8"?>
<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android">
    <background android:drawable="@mipmap/ic_launcher_background" />
    <foreground android:drawable="@mipmap/ic_launcher_foreground" />
${mono ? '    <monochrome android:drawable="@mipmap/ic_launcher_monochrome" />\n' : ""}</adaptive-icon>
`;
}

const README = `Gitwork Foundry Studio — app icon export

iOS
  Drag AppIcon.appiconset into your Xcode asset catalog (Assets.xcassets), replacing the existing
  AppIcon. Contents.json includes light, dark and tinted (iOS 18) marketing appearances.

Android
  Copy the contents of android/res into your module's src/main/res. This includes:
    mipmap-*/ic_launcher.png + ic_launcher_round.png   (legacy launcher)
    mipmap-*/ic_launcher_foreground.png + _background.png  (adaptive layers)
    mipmap-anydpi-v26/ic_launcher.xml + ic_launcher_round.xml  (adaptive-icon)
    (optional) mipmap-*/ic_launcher_monochrome.png     (Android 13+ themed icons)
  play/ic_launcher-web-512.png is the 512×512 Play Store listing icon (not bundled in the APK).
`;

/** Build + download the full icon asset-catalog zip. */
export async function exportIcons(nodes: NodeMap, opts: ExportOpts, onProgress?: (done: number, total: number) => void): Promise<void> {
  const files: Record<string, Uint8Array> = {};
  const { tinted, platforms } = opts;

  // Rasterize the master layers we'll need (once each).
  const masters: Record<string, HTMLImageElement> = {};
  const needed = ["light"];
  if (platforms.ios) needed.push("dark");
  if (platforms.ios && tinted) needed.push("tinted");
  if (platforms.android) needed.push("fg", "bg");
  if (platforms.android && tinted) needed.push("mono");
  for (const key of needed) {
    if (nodes[key]) masters[key] = await rasterizeMaster(nodes[key]);
  }

  // Rough progress across every produced PNG.
  let done = 0;
  const total =
    (platforms.ios ? IOS_LIGHT_PX.length + 1 + (tinted ? 1 : 0) : 0) +
    (platforms.android ? ANDROID_DENSITIES.length * (3 + (tinted ? 1 : 0)) + 1 : 0);
  const tick = () => onProgress?.(++done, total);

  // ── iOS ──
  if (platforms.ios && masters.light) {
    const base = "ios/AppIcon.appiconset";
    files[`${base}/Contents.json`] = strToU8(iosContentsJson(tinted));
    for (const px of IOS_LIGHT_PX) {
      files[`${base}/Icon-${px}.png`] = drawScaled(masters.light, px);
      tick();
    }
    if (masters.dark) {
      files[`${base}/Icon-1024-dark.png`] = drawScaled(masters.dark, 1024);
      tick();
    }
    if (tinted && masters.tinted) {
      files[`${base}/Icon-1024-tinted.png`] = drawScaled(masters.tinted, 1024);
      tick();
    }
  }

  // ── Android ──
  if (platforms.android && masters.light && masters.fg && masters.bg) {
    for (const d of ANDROID_DENSITIES) {
      files[`android/res/mipmap-${d.dir}/ic_launcher.png`] = drawScaled(masters.light, d.launcher);
      files[`android/res/mipmap-${d.dir}/ic_launcher_round.png`] = drawScaled(masters.light, d.launcher, true);
      files[`android/res/mipmap-${d.dir}/ic_launcher_foreground.png`] = drawScaled(masters.fg, d.adaptive);
      files[`android/res/mipmap-${d.dir}/ic_launcher_background.png`] = drawScaled(masters.bg, d.adaptive);
      done += 3;
      if (tinted && masters.mono) {
        files[`android/res/mipmap-${d.dir}/ic_launcher_monochrome.png`] = drawScaled(masters.mono, d.adaptive);
        done += 1;
      }
      onProgress?.(done, total);
    }
    files["android/res/mipmap-anydpi-v26/ic_launcher.xml"] = strToU8(adaptiveXml(tinted && !!masters.mono));
    files["android/res/mipmap-anydpi-v26/ic_launcher_round.xml"] = strToU8(adaptiveXml(tinted && !!masters.mono));
    files["android/play/ic_launcher-web-512.png"] = drawScaled(masters.light, ANDROID_PLAY_PX);
    tick();
  }

  files["README.txt"] = strToU8(README);

  const zipped = zipSync(files, { level: 0 });
  const ab = new ArrayBuffer(zipped.byteLength);
  new Uint8Array(ab).set(zipped);
  const url = URL.createObjectURL(new Blob([ab], { type: "application/zip" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = "gitwork-studio-app-icons.zip";
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
