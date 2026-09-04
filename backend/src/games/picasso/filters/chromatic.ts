import type { PicassoFilter } from "./types.js";
import { mapPixels, clamp } from "./pixel-utils.js";
import sharp from "sharp";

export const filter: PicassoFilter = {
  id: "chromatic", name: "Aberration chromatique",
  apply: async image => {
    const { data, info } = await image.clone().ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    const out = Buffer.from(data);
    const shift = Math.max(5, Math.floor(info.width * .035));
    for (let y = 0; y < info.height; y++) for (let x = 0; x < info.width; x++) {
      const i = (y * info.width + x) * info.channels;
      const rx = Math.min(info.width - 1, x + shift), bx = Math.max(0, x - shift);
      const ri = (y * info.width + rx) * info.channels, bi = (y * info.width + bx) * info.channels;
      out[i] = clamp(data[ri]); out[i + 2] = clamp(data[bi]);
    }
    return sharp(out, { raw: { width: info.width, height: info.height, channels: info.channels } });
  },
};
