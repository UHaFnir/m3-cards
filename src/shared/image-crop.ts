// Finding the part of a picture that is actually the picture.
//
// WHY THIS EXISTS
//
// A Roborock map is a PNG the size of the robot's whole coordinate space, and
// the flat itself occupies a fraction of it. `object-fit: contain` honours the
// empty margin as faithfully as the floor plan, so a 360px-tall map box shows
// a stamp in the middle and air all around it. Cropping to the content is the
// only thing that makes the picture fill the box.
//
// WHY IT COUNTS PIXELS INSTEAD OF TAKING A PLAIN BOUNDING BOX
//
// A bounding box over every non-transparent pixel is one stray mark away from
// finding nothing to crop. Roborock draws more than rooms: the path the robot
// took, no-go lines and virtual walls added in its app, and on some firmwares
// a faint frame around the whole canvas. Any one of those reaching towards an
// edge pins the box there.
//
// So a row of pixels counts as content only when *enough* of it is opaque. A
// stroke crossing a row leaves one or two pixels there; the floor plan leaves
// hundreds. One threshold separates them, and it is expressed as a fraction of
// the row's length so it holds at any sample size.
//
// The limit of that, stated plainly: a stroke that runs *along* an axis fills
// its own row or column and is kept. A curve or a diagonal is sparse in both
// directions and goes. That is the right way round — a long straight line in a
// map is more often a wall than a decoration — but it means a perfectly
// vertical no-go line still costs some of the crop. `map_fit: picture` turns
// the whole thing off.

export interface ContentInset {
  /** Percentages of the picture's own width/height, for `object-view-box`. */
  top: number;
  right: number;
  bottom: number;
  left: number;
}

export interface ContentInsetOptions {
  /** Below this, a pixel is background. 0-255. */
  alphaThreshold?: number;
  /** A row/column is content when this fraction of it is opaque. */
  density?: number;
  /** Breathing room around the result, as a fraction of the box found. */
  padding?: number;
  /**
   * Below this much cropping the answer is discarded. A picture that is nearly
   * all content should be left alone rather than nudged by a percent.
   */
  minCrop?: number;
}

/**
 * The inset that crops `data` down to its content, or nothing when there is no
 * content to find or too little to gain.
 *
 * `data` is RGBA, as `CanvasRenderingContext2D.getImageData` returns it, and is
 * expected to be a *downscaled* copy — a couple of hundred pixels wide is both
 * plenty for this and cheap enough to run on every new picture.
 */
export function contentInset(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  options: ContentInsetOptions = {},
): ContentInset | undefined {
  const alphaThreshold = options.alphaThreshold ?? 32;
  const density = options.density ?? 0.02;
  const padding = options.padding ?? 0.04;
  const minCrop = options.minCrop ?? 0.06;
  if (width <= 0 || height <= 0 || data.length < width * height * 4) return undefined;

  const rows = new Array<number>(height).fill(0);
  const cols = new Array<number>(width).fill(0);
  for (let y = 0; y < height; y++) {
    const base = y * width * 4;
    for (let x = 0; x < width; x++) {
      if (data[base + x * 4 + 3] > alphaThreshold) {
        rows[y]++;
        cols[x]++;
      }
    }
  }

  // At least one pixel, so a tiny sample cannot make the threshold zero and
  // let a single stroke count as a row of content.
  const rowFloor = Math.max(1, Math.round(width * density));
  const colFloor = Math.max(1, Math.round(height * density));
  const first = (counts: number[], floor: number) => counts.findIndex((n) => n >= floor);
  const last = (counts: number[], floor: number) => {
    for (let i = counts.length - 1; i >= 0; i--) if (counts[i] >= floor) return i;
    return -1;
  };

  const y0 = first(rows, rowFloor);
  const y1 = last(rows, rowFloor);
  const x0 = first(cols, colFloor);
  const x1 = last(cols, colFloor);
  if (y0 < 0 || x0 < 0 || y1 <= y0 || x1 <= x0) return undefined;

  // Fractions of the picture, then padded outwards by a share of the box —
  // proportional, so a small find is not swallowed by a fixed margin.
  const boxW = (x1 + 1 - x0) / width;
  const boxH = (y1 + 1 - y0) / height;
  const left = Math.max(0, x0 / width - boxW * padding);
  const right = Math.max(0, 1 - (x1 + 1) / width - boxW * padding);
  const top = Math.max(0, y0 / height - boxH * padding);
  const bottom = Math.max(0, 1 - (y1 + 1) / height - boxH * padding);

  if (left + right + top + bottom < minCrop) return undefined;
  return {
    top: top * 100,
    right: right * 100,
    bottom: bottom * 100,
    left: left * 100,
  };
}

/** `inset(...)` for `object-view-box`, rounded so the style string is stable. */
export function insetCss(inset: ContentInset): string {
  const n = (value: number) => `${value.toFixed(2)}%`;
  return `inset(${n(inset.top)} ${n(inset.right)} ${n(inset.bottom)} ${n(inset.left)})`;
}
