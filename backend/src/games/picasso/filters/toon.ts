import type { PicassoFilter } from "./types.js";

export const filter: PicassoFilter = {
  id: "toon", name: "Toon dément",
  apply: async image => image
    .grayscale()
    .linear(1.7, -90)
    .blur(0.6)
    .sharpen({ sigma: 4, m1: 2, m2: 10 })
    .modulate({ saturation: 2.8, brightness: 1.08 })
    .linear(1.25, -25),
};
