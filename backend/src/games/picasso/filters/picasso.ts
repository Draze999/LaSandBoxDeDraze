import type { PicassoFilter } from "./types.js";
import { mapPixels } from "./pixel-utils.js";

export const filter: PicassoFilter = {
  id: "picasso", name: "Picasso",
  apply: image => mapPixels(image, (x, y, w, h) => {
    const nx = x / w - 0.5;
    const ny = y / h - 0.5;
    const r = Math.sqrt(nx * nx + ny * ny);
    const a = Math.atan2(ny, nx) + 0.65 * Math.sin(r * 11) + 0.18 * Math.sin(ny * 24);
    const rr = r * (1 + 0.38 * Math.sin(a * 5 + r * 15));
    return [(Math.cos(a) * rr + 0.5) * w, (Math.sin(a) * rr + 0.5) * h];
  }).then(result => result.modulate({ saturation: 2.5, hue: Math.floor(Math.random() * 360), brightness: 1.05 })),
};
