/**
 * テトラ道's picture on its cards.
 *
 * A page says which picture it wants by name — `export const art = "tetra-do"` — and `og/mod.ts`
 * looks the name up. The drawing itself lives here, in `server/`, where Skia is. That split is the
 * point: a page module is rendered into HTML and must not reach for a WebAssembly text shaper, so
 * what crosses the line is a string.
 *
 * The picture is the game rather than a decoration of it: the
 * solid at its home orientation, the `e` facing out and ringed to say so, and under it the three
 * cells that put it there. `a b c` is the shortest trace that comes home — checked against
 * `compose`, not assumed — so the card gives the answer away, which is the right thing for a card
 * to do. A card is an invitation and not a puzzle.
 *
 * Everything it draws comes from the game's own modules: `buildScene` for the geometry, the
 * palette for the colours, `MARK_POSITIONS` for where a letter sits in a cell. Nothing is a second
 * copy — a card that drew its own approximation of the board would be a card for a game nobody
 * can play.
 */

import type { CanvasKit } from "canvaskit-wasm";

import {
  FACE_COLORS,
  ink,
  OP_COLORS,
  surface,
} from "../../client/tetra-do/palette.ts";
import { MARK_POSITIONS } from "../../client/tetra-do/cell.tsx";
import {
  IDENTITY,
  type Op,
  opBase,
  opDirection,
  opLabel,
} from "../../client/tetra-do/rotation.ts";
import {
  buildScene,
  type Face,
  type Marker,
} from "../../client/tetra-do/solid.ts";
import type { Art, Box, Pen } from "../og/card.ts";

/** The picture, drawn once — `og/mod.ts` files it under `"tetra-do"`. */
export const art: Art = tetraDo();

/** The trace the card shows: the three letters that come home, in order. */
const TRACE: readonly Op[] = [0, 1, 2];

/** How much of the picture's height the solid takes, with the cells beneath it. */
const SOLID_SHARE = 0.66;

/** How far the picture keeps off the card's edges, so nothing touches the bar or the border. */
const INSET = 44;

/** The size text inside a transformed frame is shaped at, before being scaled to fit it. */
const SHAPED = 200;

/** How tall the `e` is on its face, in the view box's own units — the screen's font size for it. */
const MARK_SIZE = 0.95;

/** The slant on the `e`, matching the italic the screen draws it in. */
const ITALIC = -0.18;

/** テトラ道's card: its own colours, and its own solid. */
function tetraDo(): Art {
  return {
    background: surface.ink,
    bar: OP_COLORS,
    ink: {
      eyebrow: ink.muted,
      title: ink.text,
      muted: ink.muted,
      rule: surface.edge,
    },
    draw(pen, box) {
      // Kept off the edges: the top bar is a colour and the card's border is somebody else's
      // timeline, and a corner of the solid touching either reads as a crop rather than a picture.
      const within: Box = {
        x: box.x,
        y: box.y + INSET,
        width: box.width - INSET,
        height: box.height - INSET * 2,
      };
      const solid: Box = {
        ...within,
        height: within.height * SOLID_SHARE,
      };
      glow(pen, solid);
      drawSolid(pen, solid);
      drawTrace(pen, {
        ...within,
        y: within.y + within.height * SOLID_SHARE,
        height: within.height * (1 - SOLID_SHARE),
      });
    },
  };
}

// --- the solid ---------------------------------------------------------------

/**
 * A wash of light behind the solid.
 *
 * The screen has this too, under the `e` on a clear. Here it does a second job: it lifts the solid
 * off a flat rectangle, which a timeline's own background would otherwise let it sink into.
 */
function glow(pen: Pen, box: Box): void {
  const { ck, canvas } = pen;
  const x = box.x + box.width / 2;
  const y = box.y + box.height / 2;
  const radius = Math.min(box.width, box.height) * 0.46;

  const paint = new ck.Paint();
  paint.setAntiAlias(true);
  paint.setColor(withAlpha(ck, FACE_COLORS[0], 0.3));
  // A blurred disc rather than a gradient: one number to read, and no two colours to keep in step.
  const blur = ck.MaskFilter.MakeBlur(ck.BlurStyle.Normal, radius * 0.5, true);
  paint.setMaskFilter(blur);
  canvas.drawCircle(x, y, radius, paint);
  blur.delete();
  paint.delete();
}

/** The solid, fitted to a box: back faces, front faces, the `e`, then the three axis letters. */
function drawSolid(pen: Pen, box: Box): void {
  const { ck, canvas } = pen;
  const scene = buildScene(IDENTITY, null);
  const fit = fitted(scene.faces, scene.markers, box);

  const fill = new ck.Paint();
  fill.setAntiAlias(true);
  const edge = new ck.Paint();
  edge.setAntiAlias(true);
  edge.setStyle(ck.PaintStyle.Stroke);
  edge.setStrokeWidth(0.035 * fit.k);
  edge.setStrokeJoin(ck.StrokeJoin.Round);

  for (const face of scene.faces) {
    const path = polygon(ck, face.points, fit);

    fill.setColor(withAlpha(ck, face.fill, face.front ? 0.95 : 0.3));
    canvas.drawPath(path, fill);

    edge.setColor(withAlpha(ck, ink.text, face.front ? 0.9 : 0.35));
    canvas.drawPath(path, edge);

    // A rim round the `e`, the one the screen draws when a trace comes home. The screen can say
    // *this is the face* by moving; a still picture has to say it by drawing.
    if (face.markTransform !== null && face.front) {
      const rim = new ck.Paint();
      rim.setAntiAlias(true);
      rim.setStyle(ck.PaintStyle.Stroke);
      rim.setStrokeWidth(0.055 * fit.k);
      rim.setStrokeJoin(ck.StrokeJoin.Round);
      rim.setColor(withAlpha(ck, ink.good, 0.9));
      canvas.drawPath(path, rim);
      rim.delete();

      drawMark(pen, face, fit);
    }

    path.delete();
  }

  fill.delete();
  edge.delete();

  for (const marker of scene.markers) drawMarker(pen, marker, fit);
}

/** The `e`, laid flat on the face that carries it. */
function drawMark(pen: Pen, face: Face, fit: Fit): void {
  const { canvas } = pen;
  const matrix = face.markTransform?.match(/-?[\d.e+-]+/g)?.map(Number);
  if (matrix === undefined || matrix.length !== 6) return;
  const [a, b, c, d, e, f] = matrix;

  const [x, y] = fit.at(e, f);
  const laid = pen.line("e", {
    size: SHAPED,
    color: ink.text,
    bold: true,
    maxLines: 1,
    center: true,
  }, SHAPED * 4);

  canvas.save();
  canvas.translate(x, y);
  // The face's own frame, at the picture's scale, so the letter lies on the face rather than in
  // front of it — and then shrunk from the size the glyph was shaped at down to the size it wants
  // on the face. A paragraph at a font size under one pixel is a paragraph Skia rounds to nothing,
  // which is why the shaping and the drawing are two different sizes.
  canvas.concat([a * fit.k, c * fit.k, 0, b * fit.k, d * fit.k, 0, 0, 0, 1]);
  const shrink = MARK_SIZE / SHAPED;
  canvas.concat([shrink, ITALIC * shrink, 0, 0, shrink, 0, 0, 0, 1]);
  canvas.drawParagraph(laid, -SHAPED * 2, -laid.getHeight() / 2);
  canvas.restore();
}

/** One axis letter, on the corner it turns about. */
function drawMarker(pen: Pen, marker: Marker, fit: Fit): void {
  const { ck, canvas } = pen;
  const [x, y] = fit.at(marker.x, marker.y);
  const radius = 0.2 * fit.k;

  const disc = new ck.Paint();
  disc.setAntiAlias(true);
  disc.setColor(ck.parseColorString(marker.color));
  canvas.drawCircle(x, y, radius, disc);
  disc.delete();

  const size = radius * 1.25;
  const laid = pen.line(marker.name, {
    size,
    color: surface.ink,
    bold: true,
    maxLines: 1,
    center: true,
  }, radius * 4);
  canvas.drawParagraph(laid, x - radius * 2, y - laid.getHeight() / 2);
}

// --- the trace ---------------------------------------------------------------

/** The three cells, side by side, with the line a finger left across them. */
function drawTrace(pen: Pen, box: Box): void {
  const { ck, canvas } = pen;
  const gap = 0.14;
  const size = Math.min(
    box.height * 0.82,
    box.width * 0.74 / (TRACE.length + gap * (TRACE.length - 1)),
  );
  const step = size * (1 + gap);
  const left = box.x + box.width / 2 - (step * TRACE.length - size * gap) / 2;
  const top = box.y + box.height / 2 - size / 2;

  TRACE.forEach((op, i) => drawCellFace(pen, op, left + step * i, top, size));

  const line = new ck.Paint();
  line.setAntiAlias(true);
  line.setStyle(ck.PaintStyle.Stroke);
  line.setStrokeWidth(Math.max(4, size * 0.13));
  line.setStrokeCap(ck.StrokeCap.Round);
  line.setColor(withAlpha(ck, ink.text, 0.7));
  canvas.drawLine(
    left + size / 2,
    top + size / 2,
    left + step * (TRACE.length - 1) + size / 2,
    top + size / 2,
    line,
  );
  line.delete();

  // The letters last. The line goes through the middle of a cell, which is where a finger went,
  // and on a board that is fine because the letter is read before the trace crosses it — on a card
  // there is no before, so the letter has to be the thing on top.
  TRACE.forEach((op, i) => drawCellLabel(pen, op, left + step * i, top, size));
}

/** One cell's face: the `e` face's triangle, with the corner this move turns about marked. */
function drawCellFace(
  pen: Pen,
  op: Op,
  x: number,
  y: number,
  size: number,
): void {
  const { ck, canvas } = pen;
  const base = opBase(op);
  const color = OP_COLORS[base];
  const inverse = opDirection(op) < 0;
  /** The glyph is drawn on a 0–100 square, the same one the screen's SVG uses. */
  const u = (n: number): number => n * size / 100;

  const tile = new ck.Paint();
  tile.setAntiAlias(true);
  tile.setColor(ck.parseColorString(surface.cellActive));
  canvas.drawRRect(
    ck.RRectXY(ck.LTRBRect(x, y, x + size, y + size), u(14), u(14)),
    tile,
  );
  tile.delete();

  const triangle = new ck.Path();
  triangle.moveTo(x + u(50), y + u(15));
  triangle.lineTo(x + u(14), y + u(77));
  triangle.lineTo(x + u(86), y + u(77));
  triangle.close();

  const outline = new ck.Paint();
  outline.setAntiAlias(true);
  outline.setStyle(ck.PaintStyle.Stroke);
  outline.setStrokeWidth(u(3.5));
  outline.setStrokeJoin(ck.StrokeJoin.Round);
  outline.setColor(withAlpha(ck, color, 0.8));
  canvas.drawPath(triangle, outline);
  outline.delete();
  triangle.delete();

  const [markX, markY] = MARK_POSITIONS[base];
  const disc = new ck.Paint();
  disc.setAntiAlias(true);
  disc.setColor(ck.parseColorString(inverse ? surface.cellActive : color));
  canvas.drawCircle(x + u(markX), y + u(markY), u(10), disc);
  disc.setStyle(ck.PaintStyle.Stroke);
  disc.setStrokeWidth(u(4));
  disc.setColor(ck.parseColorString(color));
  canvas.drawCircle(x + u(markX), y + u(markY), u(10), disc);
  disc.delete();
}

/** One cell's letter, which is what the mark on it is checked against. */
function drawCellLabel(
  pen: Pen,
  op: Op,
  x: number,
  y: number,
  size: number,
): void {
  const inverse = opDirection(op) < 0;
  const u = (n: number): number => n * size / 100;
  const laid = pen.line(opLabel(op), {
    size: u(inverse ? 22 : 26),
    color: OP_COLORS[opBase(op)],
    bold: true,
    maxLines: 1,
    center: true,
  }, size);
  // `63` is where the screen puts the letter's baseline in the cell's own hundred units.
  pen.canvas.drawParagraph(laid, x, y + u(63) - laid.getHeight() * 0.78);
}

// --- fitting -----------------------------------------------------------------

/** How view-box units become card pixels. */
interface Fit {
  /** Pixels per view-box unit. */
  k: number;
  at(x: number, y: number): [number, number];
}

/**
 * The transform that puts the whole scene inside a box.
 *
 * Measured from the scene rather than from `VIEW_BOX`: the view box leaves room for the solid to
 * turn, which a still frame does not need, and a card has no pixels to spare on room.
 *
 * @param faces The faces, for the solid's own extent
 * @param markers The axis letters, which sit outside it
 * @param box Where it all has to fit
 * @returns The scale and the mapping
 */
function fitted(
  faces: readonly Face[],
  markers: readonly Marker[],
  box: Box,
): Fit {
  const xs: number[] = [];
  const ys: number[] = [];
  for (const face of faces) {
    for (const [x, y] of points(face.points)) {
      xs.push(x);
      ys.push(y);
    }
  }
  // A letter's disc is 0.2 across and its own outline a little more.
  for (const marker of markers) {
    xs.push(marker.x - 0.26, marker.x + 0.26);
    ys.push(marker.y - 0.26, marker.y + 0.26);
  }

  const minX = Math.min(...xs);
  const minY = Math.min(...ys);
  const spanX = Math.max(...xs) - minX;
  const spanY = Math.max(...ys) - minY;
  const k = Math.min(box.width / spanX, box.height / spanY);

  const originX = box.x + (box.width - spanX * k) / 2 - minX * k;
  const originY = box.y + (box.height - spanY * k) / 2 - minY * k;

  return {
    k,
    at: (x, y) => [originX + x * k, originY + y * k],
  };
}

/** An SVG `points` string, as numbers. */
function points(list: string): [number, number][] {
  return list.split(" ").map((pair) => {
    const [x, y] = pair.split(",").map(Number);
    return [x, y] as [number, number];
  });
}

/** One of the scene's polygons, as a path in card pixels. */
function polygon(ck: CanvasKit, list: string, fit: Fit) {
  const path = new ck.Path();
  points(list).forEach(([x, y], i) => {
    const [px, py] = fit.at(x, y);
    if (i === 0) path.moveTo(px, py);
    else path.lineTo(px, py);
  });
  path.close();
  return path;
}

/** A colour from the palette, at an opacity the palette does not carry. */
function withAlpha(ck: CanvasKit, hex: string, alpha: number): Float32Array {
  const [r, g, b] = ck.parseColorString(hex);
  return ck.Color4f(r, g, b, alpha);
}
