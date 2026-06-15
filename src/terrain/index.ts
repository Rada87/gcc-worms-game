import { Vector2 } from "@dimforge/rapier2d-compat";
import { Rectangle } from "pixi.js";

// Alpha solid threshold: pixels with alpha <= this value are treated as air.
// 20 excludes anti-aliased edge pixels (1–19) and PNG/JPEG compression artefacts
// that previously caused phantom collision quads at terrain edges.
export const SOLID_ALPHA_THRESHOLD = 20;

// ─── Legacy boundary / quadtree API (still used by scenarioParser) ────────────

export function imageDataToAlpha(
  boundaryX: number,
  boundaryY: number,
  imgData: ImageData,
): Map<number, Map<number, number>> {
  const data: Map<number, Map<number, number>> = new Map();
  const lengthOfOneRow = imgData.width * 4;
  for (let i = 0; i < imgData.data.length; i += 4) {
    const x = (i % lengthOfOneRow) / 4;
    const y = Math.ceil(i / lengthOfOneRow);
    const realX = x + boundaryX;
    const realY = y + boundaryY;
    const [, , , a] = imgData.data.slice(i, i + 4);
    if (!data.has(realY)) {
      data.set(realY, new Map());
    }
    data.get(realY)?.set(realX, a);
  }
  return data;
}

export function imageDataToTerrainBoundaries(
  alphas: ReturnType<typeof imageDataToAlpha>,
  imgData: ImageData,
): { boundaries: Vector2[]; boundingBox: Rectangle } {
  const boundingBox = new Rectangle(
    Number.MAX_SAFE_INTEGER,
    Number.MAX_SAFE_INTEGER,
    0,
    0,
  );
  const boundaries: Array<Vector2> = [];
  const xBoundaryTracker = new Array(imgData.width);
  const yBoundaryTracker = new Array(imgData.height);

  for (const [y, xValues] of alphas.entries()) {
    for (const [x, a] of xValues.entries()) {
      if (a > SOLID_ALPHA_THRESHOLD) {
        if (!xBoundaryTracker[x] || !yBoundaryTracker[y]) {
          if (x > 1 && y > 1) {
            boundaries.push(new Vector2(x, y));
          }
          xBoundaryTracker[x] = true;
          yBoundaryTracker[y] = true;
          boundingBox.x = Math.min(boundingBox.x, x);
          boundingBox.y = Math.min(boundingBox.y, y);
          boundingBox.width = Math.max(boundingBox.width, x);
          boundingBox.height = Math.max(boundingBox.height, y);
        }
      } else if (a < 10) {
        if (xBoundaryTracker[x] || yBoundaryTracker[y]) {
          boundaries.push(new Vector2(x, y));
          xBoundaryTracker[x] = false;
          yBoundaryTracker[y] = false;
        }
      }
    }
  }
  boundingBox.width -= boundingBox.x;
  boundingBox.height -= boundingBox.y;
  return { boundaries, boundingBox };
}

export const QuadtreeCutoff = 8;

export function generateQuadsFromTerrain(
  boundaries: Vector2[],
  width: number,
  height: number,
  x: number,
  y: number,
): Rectangle[] {
  function inner(
    boundaries: Vector2[],
    width: number,
    height: number,
    x: number,
    y: number,
  ): Rectangle[] | Rectangle {
    if (width < QuadtreeCutoff || height < QuadtreeCutoff) {
      return new Rectangle(x, y, width, height);
    }
    const interestedBoundaries = boundaries.filter(
      (v) => v.x >= x && v.x < x + width && v.y >= y && v.y < y + height,
    );
    if (interestedBoundaries.length === 0) {
      return new Rectangle(x, y, width, height);
    }
    const newWidth = Math.round(width / 2);
    const newHeight = Math.round(height / 2);
    const rects: Rectangle[] = [];
    for (const opts of [
      [false, false],
      [true, false],
      [false, true],
      [true, true],
    ]) {
      const newX = x + (opts[0] ? newWidth : 0);
      const newY = y + (opts[1] ? newHeight : 0);
      const newRects = inner(
        interestedBoundaries,
        newWidth,
        newHeight,
        newX,
        newY,
      );
      if (Array.isArray(newRects)) {
        rects.push(...newRects);
      } else if (boundaries.some((s) => newRects.contains(s.x, s.y))) {
        rects.push(newRects);
      }
    }
    return rects;
  }
  const result = inner(boundaries, width, height, x, y);
  return Array.isArray(result) ? result : [result];
}

// ─── Heightmap collision API (used by BitmapTerrain for accurate surface) ─────

export interface SolidColumn {
  /** Topmost solid pixel y (smallest y = highest on screen). */
  top: number;
  /** Bottommost solid pixel y. */
  bottom: number;
}

/** One contiguous vertical run of solid pixels within a single column. */
export interface SolidRun {
  top: number;
  bottom: number;
}

/**
 * Scans imgData and builds a per-column solid extent map (single top/bottom).
 * Used by the spawn-point algorithm which only needs the top surface.
 */
export function imageDataToSolidColumns(
  offsetX: number,
  offsetY: number,
  imgData: ImageData,
): { columns: Map<number, SolidColumn>; boundingBox: Rectangle } {
  const { width, data } = imgData;
  const columns = new Map<number, SolidColumn>();

  let minX = Number.MAX_SAFE_INTEGER;
  let minY = Number.MAX_SAFE_INTEGER;
  let maxX = -1;
  let maxY = -1;

  for (let i = 0; i < data.length; i += 4) {
    const a = data[i + 3];
    if (a <= SOLID_ALPHA_THRESHOLD) continue;

    const pixelIdx = i >> 2;
    const localX = pixelIdx % width;
    const localY = (pixelIdx / width) | 0;
    const rx = localX + offsetX;
    const ry = localY + offsetY;

    const col = columns.get(rx);
    if (!col) {
      columns.set(rx, { top: ry, bottom: ry });
    } else {
      if (ry < col.top) col.top = ry;
      if (ry > col.bottom) col.bottom = ry;
    }

    if (rx < minX) minX = rx;
    if (rx > maxX) maxX = rx;
    if (ry < minY) minY = ry;
    if (ry > maxY) maxY = ry;
  }

  const boundingBox =
    columns.size > 0
      ? new Rectangle(minX, minY, maxX - minX, maxY - minY)
      : new Rectangle(0, 0, 0, 0);

  return { columns, boundingBox };
}

/**
 * Scans imgData column-by-column and builds a list of all solid runs per column.
 * Unlike imageDataToSolidColumns this correctly handles overhangs and hollow areas:
 * each distinct contiguous solid segment in a column becomes a separate SolidRun,
 * so air gaps between segments are never filled with phantom collision.
 */
export function imageDataToSolidRuns(
  offsetX: number,
  offsetY: number,
  imgData: ImageData,
): { columns: Map<number, SolidRun[]>; boundingBox: Rectangle } {
  const { width, height, data } = imgData;
  const columns = new Map<number, SolidRun[]>();

  let minX = Number.MAX_SAFE_INTEGER;
  let minY = Number.MAX_SAFE_INTEGER;
  let maxX = -1;
  let maxY = -1;

  for (let localX = 0; localX < width; localX++) {
    const rx = localX + offsetX;
    const runs: SolidRun[] = [];
    let runStart: number | null = null;

    for (let localY = 0; localY <= height; localY++) {
      const solid =
        localY < height &&
        data[(localY * width + localX) * 4 + 3] > SOLID_ALPHA_THRESHOLD;

      if (solid) {
        const ry = localY + offsetY;
        if (runStart === null) runStart = ry;
        if (rx < minX) minX = rx;
        if (rx > maxX) maxX = rx;
        if (ry < minY) minY = ry;
        if (ry > maxY) maxY = ry;
      } else if (runStart !== null) {
        runs.push({ top: runStart, bottom: localY - 1 + offsetY });
        runStart = null;
      }
    }

    if (runs.length > 0) columns.set(rx, runs);
  }

  const boundingBox =
    columns.size > 0
      ? new Rectangle(minX, minY, maxX - minX, maxY - minY)
      : new Rectangle(0, 0, 0, 0);

  return { columns, boundingBox };
}

/**
 * Groups solid columns into horizontal collision strips (single top/bottom per column).
 * Used by the spawner which only needs top-surface strips for ground clearance checks.
 */
export function generateStripsFromColumns(
  columns: Map<number, SolidColumn>,
  groupTolerance = 1,
): Rectangle[] {
  if (columns.size === 0) return [];

  const sortedX = [...columns.keys()].sort((a, b) => a - b);
  const strips: Rectangle[] = [];

  let groupStartX = sortedX[0];
  let refTop = columns.get(sortedX[0])!.top;
  let groupMinTop = refTop;
  let groupMaxBottom = columns.get(sortedX[0])!.bottom;
  let prevX = sortedX[0];

  const emit = (endX: number) => {
    const w = endX - groupStartX + 1;
    if (w > 0) {
      strips.push(
        new Rectangle(
          groupStartX,
          groupMinTop,
          w,
          groupMaxBottom - groupMinTop + 1,
        ),
      );
    }
  };

  for (let i = 1; i < sortedX.length; i++) {
    const x = sortedX[i];
    const col = columns.get(x)!;

    const xGap = x - prevX > 1;
    const topShift = Math.abs(col.top - refTop) > groupTolerance;

    if (xGap || topShift) {
      emit(prevX);
      groupStartX = x;
      refTop = col.top;
      groupMinTop = col.top;
      groupMaxBottom = col.bottom;
    } else {
      if (col.top < groupMinTop) groupMinTop = col.top;
      if (col.bottom > groupMaxBottom) groupMaxBottom = col.bottom;
    }
    prevX = x;
  }
  emit(prevX);

  return strips;
}

type ActiveStrip = {
  startX: number;
  refTop: number;
  minTop: number;
  maxBottom: number;
};

/**
 * Groups solid runs from imageDataToSolidRuns into horizontal collision strips.
 *
 * Each run in a column is matched to the nearest active strip by Y proximity.
 * Adjacent runs with top height differing by ≤ groupTolerance are merged into
 * one strip. Runs at different Y levels (overhangs, hollow areas) produce
 * separate strips — no phantom collision is created in the gaps between them.
 */
export function generateStripsFromRuns(
  columns: Map<number, SolidRun[]>,
  groupTolerance = 1,
): Rectangle[] {
  if (columns.size === 0) return [];

  const sortedX = [...columns.keys()].sort((a, b) => a - b);
  const strips: Rectangle[] = [];
  let activeStrips: ActiveStrip[] = [];
  let prevX: number | null = null;

  const emitStrip = (s: ActiveStrip, endX: number) => {
    const w = endX - s.startX + 1;
    if (w > 0) {
      strips.push(
        new Rectangle(s.startX, s.minTop, w, s.maxBottom - s.minTop + 1),
      );
    }
  };

  for (const x of sortedX) {
    const runs = columns.get(x)!;
    const xGap = prevX !== null && x - prevX > 1;

    if (xGap) {
      for (const s of activeStrips) emitStrip(s, prevX!);
      activeStrips = [];
    }

    const matchedActive = new Set<number>();
    const nextActive: ActiveStrip[] = [];

    for (const run of runs) {
      // Find the closest active strip whose refTop is within tolerance.
      let bestIdx = -1;
      let bestDiff = Infinity;
      for (let i = 0; i < activeStrips.length; i++) {
        if (matchedActive.has(i)) continue;
        const diff = Math.abs(run.top - activeStrips[i].refTop);
        if (diff <= groupTolerance && diff < bestDiff) {
          bestDiff = diff;
          bestIdx = i;
        }
      }

      if (bestIdx >= 0) {
        matchedActive.add(bestIdx);
        const s = activeStrips[bestIdx];
        if (run.top < s.minTop) s.minTop = run.top;
        if (run.bottom > s.maxBottom) s.maxBottom = run.bottom;
        nextActive.push(s);
      } else {
        nextActive.push({
          startX: x,
          refTop: run.top,
          minTop: run.top,
          maxBottom: run.bottom,
        });
      }
    }

    // Emit active strips that had no matching run in this column.
    for (let i = 0; i < activeStrips.length; i++) {
      if (!matchedActive.has(i)) emitStrip(activeStrips[i], prevX!);
    }

    activeStrips = nextActive;
    prevX = x;
  }

  if (prevX !== null) {
    for (const s of activeStrips) emitStrip(s, prevX);
  }

  return strips;
}
