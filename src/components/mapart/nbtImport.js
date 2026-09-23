import { ungzip } from "pako";

import NBTReader from "./nbtReader";
import MapModes from "./json/mapModes.json";
import SupportedVersions from "./json/supportedVersions.json";

/*
  Reads a schematic .nbt back into the pixels it was made from, so the map preview can be restored and edited again.

  The map colour of a block is decided by its height relative to the block one to the north (z - 1): higher is the
  light tone, lower the dark tone, same the normal tone. That holds in every staircasing mode MapartCraft writes,
  including valley mode, where the pulldowns never reduce a step below its original sign. So the visible (highest)
  block of every column of the schematic, compared with the one north of it, gives back the exact pixel colour.
*/

const MAP_SIZE = 128; // blocks along one side of a single map
const MAX_MAPS_PER_AXIS = 32; // refuse anything bigger; the canvases involved get unreasonable

const readNBTFile = (fileBuffer) => {
  const fileBytes = new Uint8Array(fileBuffer);
  let nbtBuffer = fileBuffer;
  if (fileBytes.length > 1 && fileBytes[0] === 0x1f && fileBytes[1] === 0x8b) {
    // gzipped, as every .nbt MapartCraft writes is
    const nbtBytes = ungzip(fileBytes);
    nbtBuffer = nbtBytes.buffer.slice(nbtBytes.byteOffset, nbtBytes.byteOffset + nbtBytes.byteLength);
  }
  let nbtReader = new NBTReader();
  nbtReader.loadBuffer(nbtBuffer);
  return nbtReader.getData();
};

const getBlockNBTData = (block, MCVersion) => {
  if (!(MCVersion in block.validVersions)) {
    return null;
  }
  let blockNBTData = block.validVersions[MCVersion];
  if (typeof blockNBTData === "string") {
    // this is of the form eg "&1.12.2"
    blockNBTData = block.validVersions[blockNBTData.slice(1)];
  }
  return blockNBTData;
};

const paletteItemIsBlock = (paletteItem, blockNBTData) => {
  if (paletteItem.Name.value !== `minecraft:${blockNBTData.NBTName}`) {
    return false;
  }
  if (!("Properties" in paletteItem)) {
    return Object.keys(blockNBTData.NBTArgs).length === 0;
  }
  const paletteItemProperties = paletteItem.Properties.value;
  return (
    Object.keys(paletteItemProperties).length === Object.keys(blockNBTData.NBTArgs).length &&
    Object.entries(blockNBTData.NBTArgs).every(
      ([argKey, argValue]) => argKey in paletteItemProperties && paletteItemProperties[argKey].value === argValue
    )
  );
};

const resolvePalette = (NBT_palette, coloursJSON, MCVersion) =>
  // entries are [colourSetId, blockId] of the matching block in coloursJSON, or null when we don't know the block
  NBT_palette.map((paletteItem) => {
    for (const [colourSetId, colourSet] of Object.entries(coloursJSON)) {
      for (const [blockId, block] of Object.entries(colourSet.blocks)) {
        const blockNBTData = getBlockNBTData(block, MCVersion);
        if (blockNBTData !== null && paletteItemIsBlock(paletteItem, blockNBTData)) {
          return [colourSetId, blockId];
        }
      }
    }
    return null;
  });

const getCandidateMCVersions = (NBT_value, optionValue_version) => {
  // the version the file says it is first, then the one currently selected, then the rest, newest first
  let candidateMCVersions = [];
  const pushCandidate = (MCVersion) => {
    if (MCVersion !== undefined && !candidateMCVersions.includes(MCVersion)) {
      candidateMCVersions.push(MCVersion);
    }
  };
  if ("DataVersion" in NBT_value) {
    const NBT_DataVersion = NBT_value.DataVersion.value;
    const supportedVersionFound = Object.values(SupportedVersions).find((supportedVersion) => supportedVersion.NBTVersion === NBT_DataVersion);
    if (supportedVersionFound !== undefined) {
      pushCandidate(supportedVersionFound.MCVersion);
    }
  }
  pushCandidate(optionValue_version.MCVersion);
  Object.values(SupportedVersions)
    .reverse()
    .forEach((supportedVersion) => pushCandidate(supportedVersion.MCVersion));
  return candidateMCVersions;
};

const getStaircasing = (tonesUsed, optionValue_staircasing) => {
  if (tonesUsed.light === 0 && tonesUsed.dark === 0) {
    return MapModes.SCHEMATIC_NBT.staircaseModes.OFF.uniqueId;
  }
  // classic and valley give back identical pixels, so we keep classic if that is what is already selected
  return optionValue_staircasing === MapModes.SCHEMATIC_NBT.staircaseModes.CLASSIC.uniqueId
    ? MapModes.SCHEMATIC_NBT.staircaseModes.CLASSIC.uniqueId
    : MapModes.SCHEMATIC_NBT.staircaseModes.VALLEY.uniqueId;
};

const getMapartFromNBT = (NBT, coloursJSON, optionValue_version, optionValue_staircasing) => {
  const NBT_value = NBT.value;
  const NBT_size = NBT_value.size.value.value;
  const NBT_palette = NBT_value.palette.value.value;
  const NBT_blocks = NBT_value.blocks.value.value;
  if (!Array.isArray(NBT_size) || NBT_size.length !== 3 || !Array.isArray(NBT_palette) || !Array.isArray(NBT_blocks)) {
    return { error: "MAP-PREVIEW/NBT-UPLOAD/ERROR-NOT-MAPART" };
  }

  const width = NBT_size[0];
  const depth = NBT_size[2];
  // schematics we write have a noobline row north of the map, so they are one block deeper than the map itself
  const hasNoobline = (depth - 1) % MAP_SIZE === 0;
  const mapSize_x = width / MAP_SIZE;
  const mapSize_y = (hasNoobline ? depth - 1 : depth) / MAP_SIZE;
  if (!Number.isInteger(mapSize_x) || !Number.isInteger(mapSize_y) || mapSize_x < 1 || mapSize_y < 1) {
    return { error: "MAP-PREVIEW/NBT-UPLOAD/ERROR-NOT-MAPART" };
  }
  if (mapSize_x > MAX_MAPS_PER_AXIS || mapSize_y > MAX_MAPS_PER_AXIS) {
    return { error: "MAP-PREVIEW/NBT-UPLOAD/ERROR-TOO-BIG" };
  }

  // keep only the highest block of every x-z column; that is the block whose colour the map shows
  let topPaletteIds = new Int32Array(width * depth).fill(-1);
  let topHeights = new Int32Array(width * depth);
  for (const NBT_block of NBT_blocks) {
    const [block_x, block_y, block_z] = NBT_block.pos.value.value;
    const paletteId = NBT_block.state.value;
    if (block_x < 0 || block_x >= width || block_z < 0 || block_z >= depth || !(paletteId >= 0 && paletteId < NBT_palette.length)) {
      continue;
    }
    const blockIndex = block_z * width + block_x;
    if (topPaletteIds[blockIndex] === -1 || block_y > topHeights[blockIndex]) {
      topPaletteIds[blockIndex] = paletteId;
      topHeights[blockIndex] = block_y;
    }
  }

  const firstMapRow = hasNoobline ? 1 : 0;
  let visiblePaletteIds = new Set();
  for (let z = firstMapRow; z < depth; z++) {
    for (let x = 0; x < width; x++) {
      const paletteId = topPaletteIds[z * width + x];
      if (paletteId !== -1) {
        visiblePaletteIds.add(paletteId);
      }
    }
  }
  if (visiblePaletteIds.size === 0) {
    return { error: "MAP-PREVIEW/NBT-UPLOAD/ERROR-NOT-MAPART" };
  }

  // pick the version whose blocks the file's palette matches best
  let bestVersion = null;
  for (const MCVersion of getCandidateMCVersions(NBT_value, optionValue_version)) {
    const resolvedPalette = resolvePalette(NBT_palette, coloursJSON, MCVersion);
    const resolvedCount = [...visiblePaletteIds].filter((paletteId) => resolvedPalette[paletteId] !== null).length;
    if (bestVersion === null || resolvedCount > bestVersion.resolvedCount) {
      bestVersion = { MCVersion, resolvedPalette, resolvedCount };
    }
    if (resolvedCount === visiblePaletteIds.size) {
      break;
    }
  }
  const { MCVersion, resolvedPalette } = bestVersion;

  let selectedBlocks = {};
  for (const paletteId of visiblePaletteIds) {
    if (resolvedPalette[paletteId] !== null) {
      const [colourSetId, blockId] = resolvedPalette[paletteId];
      selectedBlocks[colourSetId] = blockId;
    }
  }

  let imageData = new ImageData(MAP_SIZE * mapSize_x, MAP_SIZE * mapSize_y);
  let tonesUsed = { dark: 0, normal: 0, light: 0 };
  let unknownBlocksCount = 0;
  for (let z = firstMapRow; z < depth; z++) {
    for (let x = 0; x < width; x++) {
      const blockIndex = z * width + x;
      const imageDataOffset = 4 * ((z - firstMapRow) * width + x);
      imageData.data[imageDataOffset + 3] = 255;
      const paletteId = topPaletteIds[blockIndex];
      if (paletteId === -1 || resolvedPalette[paletteId] === null) {
        // a hole in the schematic, or a block MapartCraft doesn't know; black, which the conversion turns into the closest colour
        unknownBlocksCount++;
        continue;
      }
      let tone = "normal";
      if (z > 0 && topPaletteIds[blockIndex - width] !== -1) {
        const heightDifference = topHeights[blockIndex] - topHeights[blockIndex - width];
        tone = heightDifference > 0 ? "light" : heightDifference < 0 ? "dark" : "normal";
      }
      tonesUsed[tone]++;
      const [colourSetId] = resolvedPalette[paletteId];
      const toneRGB = coloursJSON[colourSetId].tonesRGB[tone];
      imageData.data[imageDataOffset] = toneRGB[0];
      imageData.data[imageDataOffset + 1] = toneRGB[1];
      imageData.data[imageDataOffset + 2] = toneRGB[2];
    }
  }

  // the noobline is made of the support block, so it tells us which one the schematic was built with
  let optionValue_supportBlock = null;
  if (hasNoobline) {
    for (let x = 0; x < width; x++) {
      const paletteId = topPaletteIds[x];
      if (paletteId !== -1 && !("Properties" in NBT_palette[paletteId])) {
        optionValue_supportBlock = NBT_palette[paletteId].Name.value.replace(/^minecraft:/, "");
        break;
      }
    }
  }

  return {
    imageData,
    mapSize_x,
    mapSize_y,
    MCVersion,
    optionValue_staircasing: getStaircasing(tonesUsed, optionValue_staircasing),
    optionValue_supportBlock,
    selectedBlocks,
    unknownBlocksCount,
  };
};

/*
  Returns either { error: <locale key> } or everything needed to restore the preview:
  { imageData, mapSize_x, mapSize_y, MCVersion, optionValue_staircasing, optionValue_supportBlock, selectedBlocks, unknownBlocksCount }
*/
const getMapartFromNBTFile = (fileBuffer, coloursJSON, optionValue_version, optionValue_staircasing) => {
  let NBT;
  try {
    NBT = readNBTFile(fileBuffer);
  } catch (e) {
    return { error: "MAP-PREVIEW/NBT-UPLOAD/ERROR-UNREADABLE" };
  }
  try {
    return getMapartFromNBT(NBT, coloursJSON, optionValue_version, optionValue_staircasing);
  } catch (e) {
    // valid NBT, but some tag we rely on is missing or of the wrong shape
    console.log(e);
    return { error: "MAP-PREVIEW/NBT-UPLOAD/ERROR-NOT-MAPART" };
  }
};

export default getMapartFromNBTFile;
