import sharp from "sharp";
import type { PicassoFilter } from "./types.js";

export const filter: PicassoFilter = {
  id: "scanlines", name: "Scanlines acides",
  apply: async image => {
    const meta = await image.metadata(); const w = meta.width ?? 720, h = meta.height ?? 720;
    const step = 6;
    let lines = "";
    for (let y = 0; y < h; y += step) lines += `<rect y="${y}" width="${w}" height="2" fill="#000" opacity=".8"/>`;
    const svg = Buffer.from(`<svg width="${w}" height="${h}">${lines}</svg>`);
    return image.modulate({ saturation: 2.5 }).linear(1.15, -18).composite([{ input: svg, blend: "multiply" }]);
  },
};
