import sharp from "sharp";
import type { SharpImage } from "./types.js";

export async function mapPixels(
  image: SharpImage,
  mapper: (x: number, y: number, sx: number, sy: number, data: Buffer) => [number, number],
) {
  const { data, info } = await image.clone().ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const out = Buffer.alloc(data.length);
  const channels = info.channels;
  for (let y = 0; y < info.height; y++) {
    for (let x = 0; x < info.width; x++) {
      const [sx, sy] = mapper(x, y, info.width, info.height, data);
      const dx = Math.max(0, Math.min(info.width - 1, Math.round(sx)));
      const dy = Math.max(0, Math.min(info.height - 1, Math.round(sy)));
      const src = (dy * info.width + dx) * channels;
      const dst = (y * info.width + x) * channels;
      for (let c = 0; c < channels; c++) out[dst + c] = data[src + c];
    }
  }
  return sharp(out, { raw: { width: info.width, height: info.height, channels } });
}

export function clamp(v: number, min = 0, max = 255) {
  return Math.max(min, Math.min(max, Math.round(v)));
}
