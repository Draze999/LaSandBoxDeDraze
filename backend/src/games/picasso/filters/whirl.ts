import type { PicassoFilter } from "./types.js";
import { mapPixels } from "./pixel-utils.js";

export const filter: PicassoFilter = {
  id: "whirl", name: "Whirl infernal",
  apply: image => mapPixels(image, (x, y, w, h) => {
    const nx = x / w - 0.5, ny = y / h - 0.5;
    const radius = Math.sqrt(nx * nx + ny * ny);
    const angle = Math.atan2(ny, nx) + (1 - Math.min(radius * 1.8, 1)) * 2.8;
    const rr = radius * 1.02;
    return [(Math.cos(angle) * rr + 0.5) * w, (Math.sin(angle) * rr + 0.5) * h];
  }),
};
