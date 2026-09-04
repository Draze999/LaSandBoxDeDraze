import type { PicassoFilter } from "./types.js";
import { mapPixels } from "./pixel-utils.js";

export const filter: PicassoFilter = {
  id: "liquid", name: "Liquide hallucinatoire",
  apply: image => mapPixels(image, (x, y, w, h) => {
    const nx = x / w, ny = y / h;
    return [x + Math.sin(ny * 26) * 24 + Math.sin(ny * 71 + nx * 8) * 11, y + Math.sin(nx * 31) * 22];
  }),
};
