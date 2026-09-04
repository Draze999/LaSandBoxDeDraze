import type { PicassoFilter } from "./types.js";

export const filter: PicassoFilter = {
  id: "ink", name: "Encre manga",
  apply: async image => image.grayscale().convolve({ width: 3, height: 3, kernel: [-1,-1,-1,-1,9,-1,-1,-1,-1] }).linear(2.2, -190).negate(),
};
