import type { PicassoFilter } from "./types.js";

export const filter: PicassoFilter = {
  id: "neon-ghost", name: "Fantôme néon",
  apply: async image => {
    const hue = Math.floor(Math.random() * 360);
    const ghost = await image.clone().modulate({ hue, saturation: 3.5, brightness: 1.2 }).blur(7).toBuffer();
    return image
      .negate({ alpha: false })
      .modulate({ saturation: 2.2, brightness: 1.05 })
      .composite([{ input: ghost, blend: "screen", left: 10, top: -10 }]);
  },
};
