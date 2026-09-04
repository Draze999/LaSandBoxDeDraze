import sharp from "sharp";
import type { PicassoFilter } from "./types.js";

/**
 * Grosse pixelisation volontaire : chaque bloc est remplacé par sa couleur
 * moyenne, puis reconstruit pixel par pixel. On évite ainsi les optimisations
 * de la chaîne resize() de Sharp qui pouvaient laisser passer l'image source.
 */
export const filter: PicassoFilter = {
  id: "pixel-mosaic",
  name: "Mosaïque pixel",
  apply: async image => {
    const pixelSize = 20;

    const { data, info } = await image
      .clone()
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });

    const { width, height, channels } = info;
    const output = Buffer.alloc(data.length);

    for (let by = 0; by < height; by += pixelSize) {
      for (let bx = 0; bx < width; bx += pixelSize) {
        const maxX = Math.min(width, bx + pixelSize);
        const maxY = Math.min(height, by + pixelSize);

        let r = 0;
        let g = 0;
        let b = 0;
        let a = 0;
        let count = 0;

        // Moyenne de la couleur du bloc pour obtenir une vraie mosaïque.
        for (let y = by; y < maxY; y++) {
          for (let x = bx; x < maxX; x++) {
            const i = (y * width + x) * channels;
            r += data[i];
            g += data[i + 1];
            b += data[i + 2];
            a += data[i + 3];
            count++;
          }
        }

        const cr = Math.round(r / count);
        const cg = Math.round(g / count);
        const cb = Math.round(b / count);
        const ca = Math.round(a / count);

        for (let y = by; y < maxY; y++) {
          for (let x = bx; x < maxX; x++) {
            const i = (y * width + x) * channels;
            output[i] = cr;
            output[i + 1] = cg;
            output[i + 2] = cb;
            output[i + 3] = ca;
          }
        }
      }
    }

    return sharp(output, {
      raw: {
        width,
        height,
        channels: 4,
      },
    }).modulate({ saturation: 1.35, brightness: 1.02 });
  },
};
