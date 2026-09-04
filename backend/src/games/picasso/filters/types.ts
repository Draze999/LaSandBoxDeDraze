import type sharp from "sharp";

export type SharpImage = ReturnType<typeof sharp>;

export type PicassoFilter = {
  id: string;
  name: string;
  apply: (image: SharpImage) => Promise<SharpImage>;
};
