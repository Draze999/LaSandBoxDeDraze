import sharp from "sharp";
import type { PicassoFilter } from "./types.js";

export const filter: PicassoFilter = {
  id: "color-lines", name: "Lignes chromatiques",
  apply: async image => {
    const meta = await image.metadata(); const w = meta.width ?? 720, h = meta.height ?? 720;
    let lines = "";
    const step = Math.max(7, Math.floor(h / 45));
    for (let y = 0; y < h; y += step) {
      const hue = Math.floor((y / h) * 360);
      lines += `<rect y="${y}" width="${w}" height="${Math.max(2, step * .55)}" fill="hsl(${hue},100%,55%)" opacity=".72"/>`;
    }
    const svg = Buffer.from(`<svg width="${w}" height="${h}">${lines}</svg>`);
    return image.modulate({ saturation: 2.2, brightness: 1.05 }).composite([{ input: svg, blend: "multiply" }]);
  },
};
