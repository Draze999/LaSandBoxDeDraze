import type { PicassoFilter } from "./types.js";
import { mapPixels } from "./pixel-utils.js";

export const filter: PicassoFilter = {
  id: "blocks", name: "Blocs fracturés",
  apply: image => mapPixels(image, (x, y, w, h) => {
    const size = Math.max(18, Math.floor(Math.min(w, h) / 12));
    const bx = Math.floor(x / size), by = Math.floor(y / size);
    const ox = ((bx * 37 + by * 17) % 9) - 4;
    const oy = ((bx * 11 + by * 29) % 9) - 4;
    return [x + ox * size * .18, y + oy * size * .18];
  }),
};
