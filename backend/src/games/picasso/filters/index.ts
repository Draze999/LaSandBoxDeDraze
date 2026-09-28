import { filter as negative } from "./negative.js";
import { filter as acid_hue } from "./acid-hue.js";
import { filter as psychedelic } from "./psychedelic.js";
import { filter as posterize } from "./posterize.js";
import { filter as pixel_mosaic } from "./pixel-mosaic.js";
import { filter as blur_storm } from "./blur-storm.js";
import { filter as edge_crush } from "./edge-crush.js";
import { filter as color_shock } from "./color-shock.js";
import { filter as flip_flop } from "./flip-flop.js";
import { filter as comic } from "./comic.js";
import { filter as sepia_inferno } from "./sepia-inferno.js";
import { filter as channel_split } from "./channel-split.js";
import { filter as contrast_collapse } from "./contrast-collapse.js";
import { filter as median_melt } from "./median-melt.js";
import { filter as vivid_invert } from "./vivid-invert.js";
import { filter as hexagons } from "./hexagons.js";
import { filter as picasso } from "./picasso.js";
import { filter as neon_ghost } from "./neon-ghost.js";

import { filter as whirl } from "./whirl.js";
import { filter as toon } from "./toon.js";
import { filter as color_lines } from "./color-lines.js";
import { filter as scanlines } from "./scanlines.js";
import { filter as kaleidoscope } from "./kaleidoscope.js";
import { filter as wave } from "./wave.js";
import { filter as liquid } from "./liquid.js";
import { filter as blocks } from "./blocks.js";
import { filter as chromatic } from "./chromatic.js";
import { filter as ink } from "./ink.js";
import { filter as low_poly } from "./low-poly.js";
import { filter as glass_warp } from "./glass-warp.js";
import { filter as rotate_chaos } from "./rotate-chaos.js";
import { filter as shear } from "./shear.js";

/**
 * Picasso est construit en 3 familles.
 *
 * 1. Couleur : transforme principalement la palette, la saturation,
 *    le contraste ou les canaux.
 * 2. Forme / texture : transforme le rendu, les contours, la matière
 *    ou ajoute une structure visuelle.
 * 3. Mouvement : déforme fortement la géométrie ou donne une impression
 *    de déplacement / torsion de l'image.
 *
 * L'ordre de ces tableaux est volontaire : le moteur choisit exactement
 * un filtre dans chaque famille, puis les applique dans cet ordre.
 */
export const PICASSO_COLOR_FILTERS = [
  negative,
  acid_hue,
  psychedelic,
  color_shock,
  sepia_inferno,
  channel_split,
  contrast_collapse,
  vivid_invert,
  neon_ghost,
  color_lines,
  scanlines,
  posterize,
];

export const PICASSO_SHAPE_FILTERS = [
  pixel_mosaic,
  blur_storm,
  edge_crush,
  median_melt,
  hexagons,
  picasso,
  comic,
  toon,
  ink,
  low_poly,
  blocks,
];

export const PICASSO_MOVEMENT_FILTERS = [
  flip_flop,
  whirl,
  kaleidoscope,
  wave,
  liquid,
  chromatic,
  glass_warp,
  rotate_chaos,
  shear,
];

/**
 * Conservé pour les éventuels imports externes.
 * Le moteur de Picasso utilise désormais les catégories ci-dessus.
 */
export const PICASSO_FILTERS = [
  ...PICASSO_COLOR_FILTERS,
  ...PICASSO_SHAPE_FILTERS,
  ...PICASSO_MOVEMENT_FILTERS,
];
