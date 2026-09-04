import type { PicassoFilter } from "./types.js";
import { mapPixels } from "./pixel-utils.js";

export const filter: PicassoFilter = {
  id: "flip-flop", name: "Miroir fou",
  apply: image => mapPixels(image, (x, y, w, h) => {
    const band = Math.floor((y / h) * 8);
    const mirrorX = band % 2 === 0;
    const sx = mirrorX ? w - 1 - x : x;
    const sy = (band % 3 === 0) ? h - 1 - y : y;
    return [sx, sy];
  }),
};
