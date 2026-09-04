import type { PicassoFilter } from "./types.js";
import { mapPixels } from "./pixel-utils.js";

export const filter: PicassoFilter = {
  id: "kaleidoscope", name: "Kaléidoscope brisé",
  apply: image => mapPixels(image, (x, y, w, h) => {
    let nx = x / w - .5, ny = y / h - .5;
    let a = Math.atan2(ny, nx), r = Math.sqrt(nx * nx + ny * ny);
    const sector = Math.PI / 4;
    a = Math.abs(((a + sector / 2) % sector) - sector / 2);
    const twist = a + Math.sin(r * 20) * .12;
    return [(Math.cos(twist) * r + .5) * w, (Math.sin(twist) * r + .5) * h];
  }),
};
