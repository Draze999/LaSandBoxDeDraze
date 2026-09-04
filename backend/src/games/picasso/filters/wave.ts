import type { PicassoFilter } from "./types.js";
import { mapPixels } from "./pixel-utils.js";

export const filter: PicassoFilter = {
  id: "wave", name: "Vagues distordues",
  apply: image => mapPixels(image, (x, y, w, h) => [
    x + Math.sin(y * .045) * w * .055 + Math.sin(y * .13) * 10,
    y + Math.sin(x * .035) * h * .035,
  ]),
};
