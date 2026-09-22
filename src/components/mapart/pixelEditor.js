// helpers for editing the converted map preview pixel by pixel

export const EditorTools = {
  PEN: "PEN",
  EYEDROPPER: "EYEDROPPER",
  BUCKET: "BUCKET",
};

export const TRANSPARENT_KEY = "transparent";

export function rgbToKey(r, g, b) {
  return ((r << 16) + (g << 8) + b).toString();
}

export function pixelKeyAt(data, index) {
  if (data[index + 3] === 0) {
    return TRANSPARENT_KEY;
  }
  return rgbToKey(data[index], data[index + 1], data[index + 2]);
}

export function getEditorPalette(coloursJSON, selectedBlocks, MapModes, optionValue_modeNBTOrMapdat, optionValue_staircasing, optionValue_transparency) {
  // returns the colours the user is allowed to paint with; the same colours the converter chooses from
  const mapMode = Object.values(MapModes).find((mapMode) => mapMode.uniqueId === optionValue_modeNBTOrMapdat);
  const staircaseMode = Object.values(mapMode.staircaseModes).find((staircaseMode) => staircaseMode.uniqueId === optionValue_staircasing);
  const toneKeys = staircaseMode === undefined ? [] : staircaseMode.toneKeys;
  let palette = [];
  for (const [colourSetId, colourSet] of Object.entries(coloursJSON)) {
    if (selectedBlocks[colourSetId] === undefined || selectedBlocks[colourSetId] === "-1") {
      continue;
    }
    const block = colourSet.blocks[selectedBlocks[colourSetId]];
    for (const toneKey of toneKeys) {
      const rgb = colourSet.tonesRGB[toneKey];
      palette.push({
        key: rgbToKey(rgb[0], rgb[1], rgb[2]),
        colourSetId: colourSetId,
        tone: toneKey,
        rgb: rgb,
        displayName: block === undefined ? colourSetId : block.displayName,
      });
    }
  }
  if (optionValue_modeNBTOrMapdat === MapModes.MAPDAT.uniqueId && optionValue_transparency) {
    palette.push({
      key: TRANSPARENT_KEY,
      colourSetId: null,
      tone: null,
      rgb: null,
      displayName: null,
    });
  }
  return palette;
}

export function setPixel(imageData, x, y, paletteEntry) {
  const index = 4 * (y * imageData.width + x);
  const data = imageData.data;
  if (paletteEntry.rgb === null) {
    data[index] = 0;
    data[index + 1] = 0;
    data[index + 2] = 0;
    data[index + 3] = 0;
  } else {
    data[index] = paletteEntry.rgb[0];
    data[index + 1] = paletteEntry.rgb[1];
    data[index + 2] = paletteEntry.rgb[2];
    data[index + 3] = 255;
  }
}

export function lineCoords(x0, y0, x1, y1) {
  // Bresenham so fast strokes do not leave gaps
  let coords = [];
  const dx = Math.abs(x1 - x0);
  const dy = -Math.abs(y1 - y0);
  const sx = x0 < x1 ? 1 : -1;
  const sy = y0 < y1 ? 1 : -1;
  let err = dx + dy;
  let x = x0;
  let y = y0;
  for (;;) {
    coords.push([x, y]);
    if (x === x1 && y === y1) {
      break;
    }
    const e2 = 2 * err;
    if (e2 >= dy) {
      err += dy;
      x += sx;
    }
    if (e2 <= dx) {
      err += dx;
      y += sy;
    }
  }
  return coords;
}

export function floodFill(imageData, x, y, paletteEntry) {
  // 4-connected fill of the exact colour under (x, y); returns whether anything changed
  const { width, height, data } = imageData;
  const startIndex = 4 * (y * width + x);
  const target = [data[startIndex], data[startIndex + 1], data[startIndex + 2], data[startIndex + 3]];
  const replacement = paletteEntry.rgb === null ? [0, 0, 0, 0] : [paletteEntry.rgb[0], paletteEntry.rgb[1], paletteEntry.rgb[2], 255];
  if (target.every((value, i) => value === replacement[i])) {
    return false;
  }
  const matches = (index) =>
    data[index] === target[0] && data[index + 1] === target[1] && data[index + 2] === target[2] && data[index + 3] === target[3];
  let stack = [y * width + x];
  while (stack.length > 0) {
    const pixel = stack.pop();
    const index = 4 * pixel;
    if (!matches(index)) {
      continue;
    }
    data[index] = replacement[0];
    data[index + 1] = replacement[1];
    data[index + 2] = replacement[2];
    data[index + 3] = replacement[3];
    const px = pixel % width;
    const py = (pixel - px) / width;
    if (px > 0) stack.push(pixel - 1);
    if (px < width - 1) stack.push(pixel + 1);
    if (py > 0) stack.push(pixel - width);
    if (py < height - 1) stack.push(pixel + width);
  }
  return true;
}
