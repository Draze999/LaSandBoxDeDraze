import type { PicassoFilter } from "./types.js";

export const filter: PicassoFilter = {
  id: "low-poly", name: "Low-poly acide",
  apply: async image => {
    const meta = await image.metadata(); const w = meta.width ?? 720, h = meta.height ?? 720;
    return image.resize({ width: Math.max(18, Math.floor(w / 20)), height: Math.max(18, Math.floor(h / 20)), fit: "fill" }).resize({ width: w, height: h, fit: "fill", kernel: "nearest" }).modulate({ saturation: 3.5, brightness: 1.15 });
  },
};
