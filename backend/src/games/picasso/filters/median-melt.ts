import type { PicassoFilter } from "./types.js";
export const filter: PicassoFilter = { id:"median-melt", name:"Fonte médiane", apply: async image => image.median(9).blur(2).sharpen(5) };