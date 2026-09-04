import type { PicassoFilter } from "./types.js";

export const filter: PicassoFilter = {
  id: "channel-split",
  name: "Canaux décalés",
  apply: async image => {
    return image.recomb([
      [1.15, -0.18, 0],
      [0, 1.1, -0.2],
      [-0.15, 0, 1.2],
    ]).sharpen({ sigma: 2 }).modulate({ saturation: 2.4 });
  },
};
