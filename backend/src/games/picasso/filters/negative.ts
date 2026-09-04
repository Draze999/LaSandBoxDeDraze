import type { PicassoFilter } from "./types.js";
export const filter: PicassoFilter = { id:"negative", name:"Négatif", apply: async image => image.negate() };