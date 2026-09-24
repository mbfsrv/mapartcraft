import React, { Component, createRef } from "react";

import Tooltip from "../tooltip";
// .js gets imported as code, anything else as URL. the URL has to end in .js though: static hosts (GitHub Pages) serve .jsworker as
// application/octet-stream, and Firefox refuses to run a worker script with a non-JavaScript MIME type
// eslint-disable-next-line import/no-webpack-loader-syntax
import MapCanvasWorker from "!!file-loader?name=static/media/[name].[hash:8].js!./workers/mapCanvas.jsworker";

import BackgroundColourModes from "./json/backgroundColourModes.json";
import CropModes from "./json/cropModes.json";
import DitherMethods from "./json/ditherMethods.json";
import MapModes from "./json/mapModes.json";
import WhereSupportBlocksModes from "./json/whereSupportBlocksModes.json";
import { EditorTools, getEditorPalette, pixelKeyAt, setPixel, lineCoords, floodFill } from "./pixelEditor";

import IMG_GridOverlay from "../../images/gridOverlay.png";

import "./mapPreview.css";

// inline icons for the editor toolbar buttons; stroke follows the button text colour
const editorIcons = {
  [EditorTools.PEN]: (
    <>
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" />
    </>
  ),
  [EditorTools.EYEDROPPER]: (
    <>
      <path d="m2 22 1-1h3l9-9" />
      <path d="M3 21v-3l9-9" />
      <path d="m15 6 3.4-3.4a2.1 2.1 0 1 1 3 3L18 9l.4.4a2.1 2.1 0 1 1-3 3l-3.8-3.8a2.1 2.1 0 1 1 3-3l.4.4Z" />
    </>
  ),
  [EditorTools.BUCKET]: (
    <>
      <path d="m19 11-8-8-8.6 8.6a2 2 0 0 0 0 2.8l5.2 5.2c.8.8 2 .8 2.8 0L19 11Z" />
      <path d="m5 2 5 5" />
      <path d="M2 13h15" />
      <path d="M22 20a2 2 0 1 1-4 0c0-1.6 1.7-2.4 2-4 .3 1.6 2 2.4 2 4Z" />
    </>
  ),
  UNDO: (
    <>
      <path d="M9 14 4 9l5-5" />
      <path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11" />
    </>
  ),
};

function EditorIcon({ name }) {
  return (
    <svg
      className="pixelEditorIcon"
      viewBox="0 0 24 24"
      width="16"
      height="16"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {editorIcons[name]}
    </svg>
  );
}

class MapPreview extends Component {
  state = {
    mapPreviewSizeScale: 2,
    workerProgress: 0,
    editorTool: EditorTools.PEN,
    editorColourKey: null,
    undoCount: 0,
    editorHintKey: null, // locale key of a short message explaining why a click on the map did nothing
  };

  editorHintTimeout = null;

  editImageData = null; // converted map pixels; the source of truth that the editor modifies
  undoStack = [];
  isConverting = false; // true while the image is being converted from source; editing is blocked
  strokeLastPixel = null; // last pixel under the pointer in the current pen / bucket drag
  strokeTool = null; // tool used for the current drag
  strokeBucketSnapshot = null; // pixels before a bucket drag; only pushed to undo if the drag changed something
  UNDO_LIMIT = 30;

  mapCanvasWorker = new Worker(MapCanvasWorker);

  constructor(props) {
    super(props);
    this.canvasRef_source = createRef(); // hidden source canvas that at all times contains the uploaded image
    this.canvasRef_display = createRef(); // display canvas that displays to the user, may be pixels, may be image
    this.fileInputRef = createRef();
    this.nbtInputRef = createRef();
  }

  shouldCanvasUpdate_source(prevProps, newProps, prevState, newState) {
    const propChanges = [
      prevProps.coloursJSON === newProps.coloursJSON,
      prevProps.selectedBlocks === newProps.selectedBlocks,
      prevProps.optionValue_mapSize_x === newProps.optionValue_mapSize_x,
      prevProps.optionValue_mapSize_y === newProps.optionValue_mapSize_y,
      prevProps.optionValue_cropImage === newProps.optionValue_cropImage,
      prevProps.optionValue_cropImage_zoom === newProps.optionValue_cropImage_zoom,
      prevProps.optionValue_cropImage_percent_x === newProps.optionValue_cropImage_percent_x,
      prevProps.optionValue_cropImage_percent_y === newProps.optionValue_cropImage_percent_y,
      prevProps.optionValue_staircasing === newProps.optionValue_staircasing,
      prevProps.optionValue_preprocessingEnabled === newProps.optionValue_preprocessingEnabled,
      prevProps.preProcessingValue_brightness === newProps.preProcessingValue_brightness,
      prevProps.preProcessingValue_contrast === newProps.preProcessingValue_contrast,
      prevProps.preProcessingValue_saturation === newProps.preProcessingValue_saturation,
      prevProps.preProcessingValue_backgroundColourSelect === newProps.preProcessingValue_backgroundColourSelect,
      prevProps.preProcessingValue_backgroundColour === newProps.preProcessingValue_backgroundColour,
      prevProps.uploadedImage === newProps.uploadedImage,
    ];
    return (
      newProps.uploadedImage !== null &&
      prevState.workerProgress === newState.workerProgress &&
      !propChanges.every((elt) => {
        return elt === true;
      })
    );
  }

  shouldCanvasUpdate_display(prevProps, newProps, prevState, newState) {
    // ugly but useful method to determine whether map canvas contents should be redrawn on component update
    const propChanges = [
      prevProps.coloursJSON === newProps.coloursJSON,
      prevProps.selectedBlocks === newProps.selectedBlocks,
      prevProps.optionValue_modeNBTOrMapdat === newProps.optionValue_modeNBTOrMapdat,
      prevProps.optionValue_mapSize_x === newProps.optionValue_mapSize_x,
      prevProps.optionValue_mapSize_y === newProps.optionValue_mapSize_y,
      prevProps.optionValue_cropImage === newProps.optionValue_cropImage,
      prevProps.optionValue_cropImage_zoom === newProps.optionValue_cropImage_zoom,
      prevProps.optionValue_cropImage_percent_x === newProps.optionValue_cropImage_percent_x,
      prevProps.optionValue_cropImage_percent_y === newProps.optionValue_cropImage_percent_y,
      prevProps.optionValue_staircasing === newProps.optionValue_staircasing,
      prevProps.optionValue_whereSupportBlocks === newProps.optionValue_whereSupportBlocks,
      prevProps.optionValue_transparency === newProps.optionValue_transparency,
      prevProps.optionValue_transparencyTolerance === newProps.optionValue_transparencyTolerance,
      prevProps.optionValue_betterColour === newProps.optionValue_betterColour,
      prevProps.optionValue_dithering === newProps.optionValue_dithering,
      prevProps.optionValue_preprocessingEnabled === newProps.optionValue_preprocessingEnabled,
      prevProps.preProcessingValue_brightness === newProps.preProcessingValue_brightness,
      prevProps.preProcessingValue_contrast === newProps.preProcessingValue_contrast,
      prevProps.preProcessingValue_saturation === newProps.preProcessingValue_saturation,
      prevProps.preProcessingValue_backgroundColourSelect === newProps.preProcessingValue_backgroundColourSelect,
      prevProps.preProcessingValue_backgroundColour === newProps.preProcessingValue_backgroundColour,
      prevProps.uploadedImage === newProps.uploadedImage,
    ];
    return (
      newProps.uploadedImage !== null &&
      prevState.workerProgress === newState.workerProgress &&
      !propChanges.every((elt) => {
        return elt === true;
      })
    );
  }

  componentDidUpdate(prevProps, prevState) {
    if (this.shouldCanvasUpdate_source(prevProps, this.props, prevState, this.state)) {
      this.updateCanvas_source(); // draw uploaded image on source canvas
    }
    if (this.shouldCanvasUpdate_display(prevProps, this.props, prevState, this.state)) {
      this.updateCanvas_display(); // draw pixelart of image on display canvas
    }
  }

  closestSmoothColourTo(colourHex) {
    const { coloursJSON, selectedBlocks, optionValue_staircasing } = this.props;
    const rgbGroups_input = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(colourHex);
    const colourRGB_input = [parseInt(rgbGroups_input[1], 16), parseInt(rgbGroups_input[2], 16), parseInt(rgbGroups_input[3], 16)];
    let smallestDistance = 9999999;
    let colourRGB_return = null;
    for (const [colourSetId, colourSet] of Object.entries(coloursJSON)) {
      if (selectedBlocks[colourSetId] === "-1") {
        continue;
      }
      let coloursRGB_colourSet;
      switch (optionValue_staircasing) {
        case MapModes.SCHEMATIC_NBT.staircaseModes.OFF.uniqueId:
        case MapModes.SCHEMATIC_NBT.staircaseModes.CLASSIC.uniqueId:
        case MapModes.SCHEMATIC_NBT.staircaseModes.VALLEY.uniqueId:
        case MapModes.MAPDAT.staircaseModes.OFF.uniqueId: {
          coloursRGB_colourSet = [colourSet.tonesRGB.normal];
          break;
        }
        case MapModes.SCHEMATIC_NBT.staircaseModes.FULL_DARK.uniqueId:
        case MapModes.MAPDAT.staircaseModes.FULL_DARK.uniqueId: {
          coloursRGB_colourSet = [colourSet.tonesRGB.dark];
          break;
        }
        case MapModes.SCHEMATIC_NBT.staircaseModes.FULL_LIGHT.uniqueId:
        case MapModes.MAPDAT.staircaseModes.FULL_LIGHT.uniqueId: {
          coloursRGB_colourSet = [colourSet.tonesRGB.light];
          break;
        }
        case MapModes.MAPDAT.staircaseModes.FULL_UNOBTAINABLE.uniqueId: {
          coloursRGB_colourSet = [colourSet.tonesRGB.unobtainable];
          break;
        }
        case MapModes.MAPDAT.staircaseModes.ON.uniqueId: {
          coloursRGB_colourSet = [colourSet.tonesRGB.dark, colourSet.tonesRGB.normal, colourSet.tonesRGB.light];
          break;
        }
        case MapModes.MAPDAT.staircaseModes.ON_UNOBTAINABLE.uniqueId: {
          coloursRGB_colourSet = [colourSet.tonesRGB.dark, colourSet.tonesRGB.normal, colourSet.tonesRGB.light, colourSet.tonesRGB.unobtainable];
          break;
        }
        default: {
          throw new Error("Unknown staircasing mode");
        }
      }
      for (const colourRGB_colourSet of coloursRGB_colourSet) {
        const colourDistance =
          Math.pow(colourRGB_input[0] - colourRGB_colourSet[0], 2) +
          Math.pow(colourRGB_input[1] - colourRGB_colourSet[1], 2) +
          Math.pow(colourRGB_input[2] - colourRGB_colourSet[2], 2);
        if (colourDistance < smallestDistance) {
          smallestDistance = colourDistance;
          colourRGB_return = colourRGB_colourSet;
        }
      }
    }
    const colourHex_return = `#${colourRGB_return[0].toString(16).padStart(2, "0")}${colourRGB_return[1].toString(16).padStart(2, "0")}${colourRGB_return[2]
      .toString(16)
      .padStart(2, "0")}`;
    return colourHex_return;
  }

  updateCanvas_source() {
    const {
      selectedBlocks,
      optionValue_preprocessingEnabled,
      preProcessingValue_brightness,
      preProcessingValue_contrast,
      preProcessingValue_saturation,
      preProcessingValue_backgroundColourSelect,
      preProcessingValue_backgroundColour,
      uploadedImage,
    } = this.props;
    const {
      optionValue_mapSize_x,
      optionValue_mapSize_y,
      optionValue_cropImage,
      optionValue_cropImage_zoom,
      optionValue_cropImage_percent_x,
      optionValue_cropImage_percent_y,
    } = this.props;
    const { canvasRef_source } = this;
    const ctx_source = canvasRef_source.current.getContext("2d", { willReadFrequently: true });
    ctx_source.imageSmoothingEnabled = true;   // These two options keep the map preview consistent on Chrome(ium). Otherwise the first render after changing
    ctx_source.imageSmoothingQuality = "high"; // map x or z size is pixelated to a noticeably lower quality. This is not a solution to the cause but a
                                               // workaround the effect (I do not know exactly why this happens: maybe it is to do with
                                               // anti-fingerprinting). Firefox is unaffected by any of this.
    ctx_source.clearRect(0, 0, ctx_source.canvas.width, ctx_source.canvas.height);

    if (optionValue_preprocessingEnabled) {
      if (preProcessingValue_backgroundColourSelect !== BackgroundColourModes.OFF.uniqueId && /^#?[a-f\d]{6}$/i.test(preProcessingValue_backgroundColour)) {
        let backgroundColour;
        if (
          preProcessingValue_backgroundColourSelect === BackgroundColourModes.SMOOTH.uniqueId &&
          !Object.values(selectedBlocks).every((selectedBlockId) => selectedBlockId === "-1")
        ) {
          backgroundColour = this.closestSmoothColourTo(preProcessingValue_backgroundColour);
        } else {
          backgroundColour = preProcessingValue_backgroundColour;
        }
        ctx_source.filter = "none"; // this needs to be present to stop filters affecting background colour
        ctx_source.rect(0, 0, ctx_source.canvas.width, ctx_source.canvas.height);
        ctx_source.fillStyle = backgroundColour;
        ctx_source.fill();
      }
      ctx_source.filter = `brightness(${preProcessingValue_brightness}%) contrast(${preProcessingValue_contrast}%) saturate(${preProcessingValue_saturation}%)`;
    } else {
      ctx_source.filter = "none";
    }

    switch (optionValue_cropImage) {
      case CropModes.OFF.uniqueId: {
        ctx_source.drawImage(uploadedImage, 0, 0, ctx_source.canvas.width, ctx_source.canvas.height);
        break;
      }
      case CropModes.CENTER.uniqueId:
      case CropModes.MANUAL.uniqueId: {
        const img_width = uploadedImage.width;
        const img_height = uploadedImage.height;
        let samplingWidth;
        let samplingHeight;
        let samplingOffset_x;
        let samplingOffset_y;
        if (img_width * optionValue_mapSize_y > img_height * optionValue_mapSize_x) {
          // image w/h greater than canvas w/h
          samplingWidth = Math.floor((10 * img_height * optionValue_mapSize_x) / (optionValue_mapSize_y * optionValue_cropImage_zoom));
          // the 10 is because the input is from 10 to 50 in steps of 1; scale down by 10
          samplingHeight = Math.floor((10 * img_height) / optionValue_cropImage_zoom);
          samplingOffset_x = Math.floor((optionValue_cropImage_percent_x * (img_width - samplingWidth)) / 100);
          samplingOffset_y = Math.floor((optionValue_cropImage_percent_y * (img_height - samplingHeight)) / 100);
        } else {
          // image w/h leq canvas w/h
          samplingWidth = Math.floor((10 * img_width) / optionValue_cropImage_zoom);
          samplingHeight = Math.floor((10 * img_width * optionValue_mapSize_y) / (optionValue_mapSize_x * optionValue_cropImage_zoom));
          samplingOffset_x = Math.floor((optionValue_cropImage_percent_x * (img_width - samplingWidth)) / 100);
          samplingOffset_y = Math.floor((optionValue_cropImage_percent_y * (img_height - samplingHeight)) / 100);
        }
        ctx_source.drawImage(
          uploadedImage,
          samplingOffset_x,
          samplingOffset_y,
          samplingWidth,
          samplingHeight,
          0,
          0,
          ctx_source.canvas.width,
          ctx_source.canvas.height
        );
        break;
      }
      default: {
        throw new Error("Unknown optionValue_cropImage");
      }
    }
  }

  getSourceImageData() {
    const { optionValue_cropImage, optionValue_preprocessingEnabled, uploadedImage_exactPixels } = this.props;
    const ctx_source = this.canvasRef_source.current.getContext("2d", { willReadFrequently: true });
    const { width, height } = ctx_source.canvas;
    if (
      uploadedImage_exactPixels !== null &&
      uploadedImage_exactPixels.width === width &&
      uploadedImage_exactPixels.height === height &&
      optionValue_cropImage === CropModes.OFF.uniqueId &&
      !optionValue_preprocessingEnabled
    ) {
      // pixels restored from a .nbt are exact palette colours. reading them back from the canvas can be off by one in browsers
      // that add anti-fingerprinting noise, which is enough to swap near-identical colours (magenta / purple terracotta)
      return uploadedImage_exactPixels;
    }
    return ctx_source.getImageData(0, 0, width, height);
  }

  updateCanvas_display() {
    this.mapCanvasWorker.terminate();
    const { canvasRef_display } = this;
    const {
      coloursJSON,
      selectedBlocks,
      optionValue_modeNBTOrMapdat,
      optionValue_mapSize_x,
      optionValue_mapSize_y,
      optionValue_staircasing,
      optionValue_whereSupportBlocks,
      optionValue_transparency,
      optionValue_transparencyTolerance,
      optionValue_betterColour,
      optionValue_dithering,
      onGetMapMaterials,
      onMapPreviewWorker_begin,
    } = this.props;
    const canvasImageData = this.getSourceImageData();
    const t0 = performance.now();
    this.mapCanvasWorker = new Worker(MapCanvasWorker);
    this.mapCanvasWorker.onmessage = (e) => {
      if (e.data.head === "PIXELS_MATERIALS_CURRENTSELECTEDBLOCKS") {
        const t1 = performance.now();
        console.log(`Calculated map preview data in ${(t1 - t0).toString()}ms`);
        const ctx_display = canvasRef_display.current.getContext("2d");
        ctx_display.putImageData(e.data.body.pixels, 0, 0);
        const pixels = e.data.body.pixels;
        this.editImageData = new ImageData(new Uint8ClampedArray(pixels.data), pixels.width, pixels.height);
        this.undoStack = [];
        this.isConverting = false;
        this.strokeLastPixel = null;
        this.setState({ workerProgress: 1, undoCount: 0 });
        onGetMapMaterials({
          pixelsData: e.data.body.pixels.data,
          maps: e.data.body.maps,
          currentSelectedBlocks: e.data.body.currentSelectedBlocks,
        });
      } else if (e.data.head === "PROGRESS_REPORT") {
        this.setState({ workerProgress: e.data.body });
      }
    };
    this.isConverting = true;
    onMapPreviewWorker_begin();
    this.mapCanvasWorker.postMessage({
      head: "PIXELS",
      body: {
        coloursJSON: coloursJSON,
        MapModes: MapModes,
        WhereSupportBlocksModes: WhereSupportBlocksModes,
        DitherMethods: DitherMethods,
        canvasImageData: canvasImageData,
        selectedBlocks: selectedBlocks,
        optionValue_modeNBTOrMapdat: optionValue_modeNBTOrMapdat,
        optionValue_mapSize_x: optionValue_mapSize_x,
        optionValue_mapSize_y: optionValue_mapSize_y,
        optionValue_staircasing: optionValue_staircasing,
        optionValue_whereSupportBlocks: optionValue_whereSupportBlocks,
        optionValue_transparency: optionValue_transparency,
        optionValue_transparencyTolerance: optionValue_transparencyTolerance,
        optionValue_betterColour: optionValue_betterColour,
        optionValue_dithering: optionValue_dithering,
      },
    });
  }

  updateMaterials_edited() {
    // re-run the worker on the edited pixels so materials, support blocks and exported NBT / map.dat stay in sync.
    // every pixel is already an exact palette colour so no dithering is wanted; the worker maps each pixel to itself
    this.mapCanvasWorker.terminate();
    const {
      coloursJSON,
      selectedBlocks,
      optionValue_modeNBTOrMapdat,
      optionValue_mapSize_x,
      optionValue_mapSize_y,
      optionValue_staircasing,
      optionValue_whereSupportBlocks,
      optionValue_transparency,
      onGetMapMaterials,
      onMapPreviewWorker_begin,
    } = this.props;
    const { editImageData } = this;
    this.mapCanvasWorker = new Worker(MapCanvasWorker);
    this.mapCanvasWorker.onmessage = (e) => {
      if (e.data.head === "PIXELS_MATERIALS_CURRENTSELECTEDBLOCKS") {
        this.setState({ workerProgress: 1 });
        onGetMapMaterials({
          pixelsData: e.data.body.pixels.data,
          maps: e.data.body.maps,
          currentSelectedBlocks: e.data.body.currentSelectedBlocks,
        });
      } else if (e.data.head === "PROGRESS_REPORT") {
        this.setState({ workerProgress: e.data.body });
      }
    };
    onMapPreviewWorker_begin();
    this.mapCanvasWorker.postMessage({
      head: "PIXELS",
      body: {
        coloursJSON: coloursJSON,
        MapModes: MapModes,
        WhereSupportBlocksModes: WhereSupportBlocksModes,
        DitherMethods: DitherMethods,
        canvasImageData: new ImageData(new Uint8ClampedArray(editImageData.data), editImageData.width, editImageData.height),
        selectedBlocks: selectedBlocks,
        optionValue_modeNBTOrMapdat: optionValue_modeNBTOrMapdat,
        optionValue_mapSize_x: optionValue_mapSize_x,
        optionValue_mapSize_y: optionValue_mapSize_y,
        optionValue_staircasing: optionValue_staircasing,
        optionValue_whereSupportBlocks: optionValue_whereSupportBlocks,
        optionValue_transparency: optionValue_transparency,
        optionValue_transparencyTolerance: 128, // edited pixels are either fully opaque or fully transparent
        optionValue_betterColour: false,
        optionValue_dithering: DitherMethods.None.uniqueId,
      },
    });
  }

  getEditorPalette() {
    const { coloursJSON, selectedBlocks, optionValue_modeNBTOrMapdat, optionValue_staircasing, optionValue_transparency } = this.props;
    return getEditorPalette(coloursJSON, selectedBlocks, MapModes, optionValue_modeNBTOrMapdat, optionValue_staircasing, optionValue_transparency);
  }

  getSelectedPaletteEntry(palette) {
    const { editorColourKey } = this.state;
    const found = palette.find((paletteEntry) => paletteEntry.key === editorColourKey);
    return found === undefined ? null : found;
  }

  canEdit() {
    const { editImageData, canvasRef_display } = this;
    return (
      !this.isConverting &&
      editImageData !== null &&
      canvasRef_display.current !== null &&
      editImageData.width === canvasRef_display.current.width &&
      editImageData.height === canvasRef_display.current.height
    );
  }

  pushUndo(snapshot = new Uint8ClampedArray(this.editImageData.data)) {
    this.undoStack.push(snapshot);
    if (this.undoStack.length > this.UNDO_LIMIT) {
      this.undoStack.shift();
    }
    this.setState({ undoCount: this.undoStack.length });
  }

  handleUndo = () => {
    if (!this.canEdit() || this.undoStack.length === 0) {
      return;
    }
    this.editImageData.data.set(this.undoStack.pop());
    this.canvasRef_display.current.getContext("2d").putImageData(this.editImageData, 0, 0);
    this.setState({ undoCount: this.undoStack.length });
    this.updateMaterials_edited();
  };

  eventListener_keydown = (e) => {
    if (!(e.ctrlKey || e.metaKey) || e.shiftKey || e.key.toLowerCase() !== "z") {
      return;
    }
    const target = e.target;
    if (target instanceof HTMLElement && (target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName))) {
      return;
    }
    e.preventDefault();
    this.handleUndo();
  };

  componentDidMount() {
    document.addEventListener("keydown", this.eventListener_keydown);
  }

  getCanvasPixelFromEvent(e) {
    const canvas = this.canvasRef_display.current;
    const rect = canvas.getBoundingClientRect();
    const x = Math.floor(((e.clientX - rect.left) / rect.width) * canvas.width);
    const y = Math.floor(((e.clientY - rect.top) / rect.height) * canvas.height);
    if (x < 0 || y < 0 || x >= canvas.width || y >= canvas.height) {
      return null;
    }
    return [x, y];
  }

  showEditorHint(localeKey) {
    clearTimeout(this.editorHintTimeout);
    this.setState({ editorHintKey: localeKey });
    this.editorHintTimeout = setTimeout(() => this.setState({ editorHintKey: null }), 4000);
  }

  pickColourAt(x, y, palette) {
    const key = pixelKeyAt(this.editImageData.data, 4 * (y * this.editImageData.width + x));
    // only colours that are currently allowed can be picked up
    if (palette.some((paletteEntry) => paletteEntry.key === key)) {
      clearTimeout(this.editorHintTimeout);
      this.setState((currentState) => ({
        editorColourKey: key,
        editorTool: currentState.editorTool === EditorTools.EYEDROPPER ? EditorTools.PEN : currentState.editorTool,
        editorHintKey: null,
      }));
    } else {
      this.showEditorHint("MAP-PREVIEW/EDITOR/PICK-FAILED");
    }
  }

  paintPixels(coords, paletteEntry) {
    const ctx_display = this.canvasRef_display.current.getContext("2d");
    if (paletteEntry.rgb !== null) {
      ctx_display.fillStyle = `rgb(${paletteEntry.rgb[0]}, ${paletteEntry.rgb[1]}, ${paletteEntry.rgb[2]})`;
    }
    for (const [x, y] of coords) {
      setPixel(this.editImageData, x, y, paletteEntry);
      if (paletteEntry.rgb === null) {
        ctx_display.clearRect(x, y, 1, 1);
      } else {
        ctx_display.fillRect(x, y, 1, 1);
      }
    }
  }

  onCanvasClick = () => {
    // with no image chosen yet, tapping the preview opens the file dialog
    if (this.props.uploadedImage_isPlaceholder) {
      this.fileInputRef.current.click();
    }
  };

  onCanvasPointerDown = (e) => {
    if (this.props.uploadedImage_isPlaceholder) {
      return;
    }
    // left button paints with the current tool, right button (or Alt+left) is always the eyedropper
    if (![0, 2].includes(e.button) || !this.canEdit()) {
      return;
    }
    const pixel = this.getCanvasPixelFromEvent(e);
    if (pixel === null) {
      return;
    }
    e.preventDefault();
    const [x, y] = pixel;
    const palette = this.getEditorPalette();
    if (palette.length === 0) {
      this.showEditorHint("MAP-PREVIEW/EDITOR/NO-COLOURS");
      return;
    }
    const { editorTool } = this.state;
    if (editorTool === EditorTools.EYEDROPPER || e.button === 2 || e.altKey) {
      this.pickColourAt(x, y, palette);
      return;
    }
    const paletteEntry = this.getSelectedPaletteEntry(palette);
    if (paletteEntry === null) {
      this.showEditorHint("MAP-PREVIEW/EDITOR/NO-COLOUR-SELECTED");
      return;
    }
    e.currentTarget.setPointerCapture(e.pointerId);
    this.strokeLastPixel = pixel;
    this.strokeTool = editorTool;
    if (editorTool === EditorTools.BUCKET) {
      // holding and dragging keeps filling every area the pointer passes over; the whole drag is one undo step
      this.strokeBucketSnapshot = new Uint8ClampedArray(this.editImageData.data);
      this.bucketFillPixels([pixel], paletteEntry);
      return;
    }
    // pen
    this.pushUndo();
    this.paintPixels([pixel], paletteEntry);
  };

  bucketFillPixels(coords, paletteEntry) {
    let changed = false;
    for (const [x, y] of coords) {
      // floodFill returns immediately for pixels that already have the fill colour, so dragging over filled areas is cheap
      changed = floodFill(this.editImageData, x, y, paletteEntry) || changed;
    }
    if (changed) {
      this.canvasRef_display.current.getContext("2d").putImageData(this.editImageData, 0, 0);
    }
  }

  onCanvasPointerMove = (e) => {
    if (this.strokeLastPixel === null || !this.canEdit()) {
      return;
    }
    const pixel = this.getCanvasPixelFromEvent(e);
    if (pixel === null) {
      return;
    }
    const paletteEntry = this.getSelectedPaletteEntry(this.getEditorPalette());
    if (paletteEntry === null) {
      return;
    }
    const [x0, y0] = this.strokeLastPixel;
    const [x1, y1] = pixel;
    if (x0 === x1 && y0 === y1) {
      return;
    }
    if (this.strokeTool === EditorTools.BUCKET) {
      this.bucketFillPixels(lineCoords(x0, y0, x1, y1), paletteEntry);
    } else {
      this.paintPixels(lineCoords(x0, y0, x1, y1), paletteEntry);
    }
    this.strokeLastPixel = pixel;
  };

  onCanvasPointerUp = () => {
    if (this.strokeLastPixel === null) {
      return;
    }
    const strokeTool = this.strokeTool;
    const snapshot = this.strokeBucketSnapshot;
    this.strokeLastPixel = null;
    this.strokeTool = null;
    this.strokeBucketSnapshot = null;
    if (!this.canEdit()) {
      return;
    }
    if (strokeTool === EditorTools.BUCKET) {
      const data = this.editImageData.data;
      if (snapshot.every((value, i) => value === data[i])) {
        return; // nothing was filled
      }
      this.pushUndo(snapshot);
    }
    this.updateMaterials_edited();
  };

  onEditorToolChange = (tool) => {
    this.setState({ editorTool: tool });
  };

  onEditorColourChange = (key) => {
    this.setState((currentState) => ({
      editorColourKey: key,
      editorTool: currentState.editorTool === EditorTools.EYEDROPPER ? EditorTools.PEN : currentState.editorTool,
    }));
  };

  increasePreviewScale = () => {
    this.setState({
      mapPreviewSizeScale: this.state.mapPreviewSizeScale * 1.2,
    });
  };

  decreasePreviewScale = () => {
    this.setState({
      mapPreviewSizeScale: this.state.mapPreviewSizeScale / 1.2,
    });
  };

  componentWillUnmount() {
    this.mapCanvasWorker.terminate();
    document.removeEventListener("keydown", this.eventListener_keydown);
    clearTimeout(this.editorHintTimeout);
  }

  renderEditor(palette) {
    const { getLocaleString, optionValue_mapSize_x } = this.props;
    const { mapPreviewSizeScale, editorTool, undoCount, editorHintKey } = this.state;
    const selectedPaletteEntry = this.getSelectedPaletteEntry(palette);
    const tools = [
      [EditorTools.PEN, "MAP-PREVIEW/EDITOR/PEN", "MAP-PREVIEW/EDITOR/PEN-TT"],
      [EditorTools.EYEDROPPER, "MAP-PREVIEW/EDITOR/EYEDROPPER", "MAP-PREVIEW/EDITOR/EYEDROPPER-TT"],
      [EditorTools.BUCKET, "MAP-PREVIEW/EDITOR/BUCKET", "MAP-PREVIEW/EDITOR/BUCKET-TT"],
    ];
    const toneLocaleKeys = {
      dark: "MAP-PREVIEW/EDITOR/TONE-DARK",
      normal: "MAP-PREVIEW/EDITOR/TONE-NORMAL",
      light: "MAP-PREVIEW/EDITOR/TONE-LIGHT",
      unobtainable: "MAP-PREVIEW/EDITOR/TONE-UNOBTAINABLE",
    };
    const paletteEntryTitle = (paletteEntry) =>
      paletteEntry.rgb === null
        ? getLocaleString("MAP-PREVIEW/EDITOR/TRANSPARENT")
        : `${paletteEntry.displayName} (${getLocaleString(toneLocaleKeys[paletteEntry.tone])})`;
    return (
      <div className="pixelEditor" style={{ maxWidth: `${Math.max(256, mapPreviewSizeScale * 128 * optionValue_mapSize_x).toString()}px` }}>
        <div className="pixelEditorToolbar">
          {tools.map(([tool, labelKey, tooltipKey]) => (
            <button
              key={tool}
              type="button"
              className={`pixelEditorButton${editorTool === tool ? " pixelEditorButton_selected" : ""}`}
              title={getLocaleString(tooltipKey)}
              onClick={() => this.onEditorToolChange(tool)}
            >
              <EditorIcon name={tool} />
              {getLocaleString(labelKey)}
            </button>
          ))}
          <button type="button" className="pixelEditorButton" title={getLocaleString("MAP-PREVIEW/EDITOR/UNDO-TT")} disabled={undoCount === 0} onClick={this.handleUndo}>
            <EditorIcon name="UNDO" />
            {getLocaleString("MAP-PREVIEW/EDITOR/UNDO")}
          </button>
          <span
            className={`pixelEditorSwatch pixelEditorCurrentSwatch${selectedPaletteEntry !== null && selectedPaletteEntry.rgb === null ? " pixelEditorSwatch_transparent" : ""}`}
            title={selectedPaletteEntry === null ? getLocaleString("MAP-PREVIEW/EDITOR/NO-COLOUR-SELECTED") : paletteEntryTitle(selectedPaletteEntry)}
            style={
              selectedPaletteEntry !== null && selectedPaletteEntry.rgb !== null
                ? { backgroundColor: `rgb(${selectedPaletteEntry.rgb.join(",")})` }
                : undefined
            }
          />
          <small className="pixelEditorCurrentName">
            {selectedPaletteEntry === null ? getLocaleString("MAP-PREVIEW/EDITOR/NO-COLOUR-SELECTED") : paletteEntryTitle(selectedPaletteEntry)}
          </small>
        </div>
        {editorHintKey !== null && editorHintKey !== "MAP-PREVIEW/EDITOR/NO-COLOURS" && (
          <div className="pixelEditorHint">{getLocaleString(editorHintKey)}</div>
        )}
        {palette.length === 0 ? (
          <div className={`pixelEditorNoColours${editorHintKey === "MAP-PREVIEW/EDITOR/NO-COLOURS" ? " pixelEditorHint" : ""}`}>
            {getLocaleString("MAP-PREVIEW/EDITOR/NO-COLOURS")}
          </div>
        ) : (
          <div className="pixelEditorPalette">
            {palette.map((paletteEntry) => (
              <span
                key={paletteEntry.key}
                className={`pixelEditorSwatch${paletteEntry.rgb === null ? " pixelEditorSwatch_transparent" : ""}${
                  selectedPaletteEntry === paletteEntry ? " pixelEditorSwatch_selected" : ""
                }`}
                title={paletteEntryTitle(paletteEntry)}
                style={paletteEntry.rgb === null ? undefined : { backgroundColor: `rgb(${paletteEntry.rgb.join(",")})` }}
                onClick={() => this.onEditorColourChange(paletteEntry.key)}
              />
            ))}
          </div>
        )}
      </div>
    );
  }

  render() {
    const {
      getLocaleString,
      optionValue_mapSize_x, // map size in maps
      optionValue_mapSize_y,
      optionValue_cropImage,
      optionValue_showGridOverlay,
      onFileDialogEvent,
      uploadedImage,
      uploadedImage_isPlaceholder,
    } = this.props;
    const { mapPreviewSizeScale, workerProgress, editorTool } = this.state;
    const palette = this.getEditorPalette();
    return (
      <div className="section mapPreviewDiv">
        <div className="mapPreviewHeader">
          <h2>{getLocaleString("MAP-PREVIEW/TITLE")}</h2>
          <button type="button" className="changeImageButton" onClick={() => this.fileInputRef.current.click()}>
            {getLocaleString("MAP-PREVIEW/CHANGE-IMAGE")}
          </button>
          <Tooltip tooltipText={getLocaleString("MAP-PREVIEW/NBT-UPLOAD/LOAD-TT")}>
            <button type="button" className="changeImageButton" onClick={() => this.nbtInputRef.current.click()}>
              {getLocaleString("MAP-PREVIEW/NBT-UPLOAD/LOAD")}
            </button>
          </Tooltip>
          <div className="previewScaleButtons">
            <Tooltip tooltipText={getLocaleString("MAP-PREVIEW/SCALE-PLUS-TT")}>
              <button type="button" className="changeImageButton sizeButton" onClick={this.increasePreviewScale}>
                +
              </button>
            </Tooltip>
            <Tooltip tooltipText={getLocaleString("MAP-PREVIEW/SCALE-MINUS-TT")}>
              <button type="button" className="changeImageButton sizeButton" onClick={this.decreasePreviewScale}>
                −
              </button>
            </Tooltip>
          </div>
        </div>
        <input
          type="file"
          accept="image/*"
          className="imgUpload"
          ref={this.fileInputRef}
          onChange={(e) => {
            onFileDialogEvent(e);
            e.target.value = ""; // allow choosing the same file again
          }}
        />
        <input
          type="file"
          accept=".nbt"
          className="imgUpload"
          ref={this.nbtInputRef}
          onChange={(e) => {
            onFileDialogEvent(e);
            e.target.value = "";
          }}
        />
        <div>
          <span
            className="gridOverlay"
            style={{
              backgroundImage: `url(${IMG_GridOverlay})`,
              display: optionValue_showGridOverlay ? "block" : "none",
              width: `${(mapPreviewSizeScale * 128 * optionValue_mapSize_x).toString()}px`,
              height: `${(mapPreviewSizeScale * 128 * optionValue_mapSize_y).toString()}px`,
              backgroundSize: `${(mapPreviewSizeScale * 128).toString()}px`,
            }}
          />
          <canvas
            className={uploadedImage_isPlaceholder ? "mapCanvas mapCanvas_upload" : `mapCanvas mapCanvas_${editorTool.toLowerCase()}`}
            width={128 * optionValue_mapSize_x}
            height={128 * optionValue_mapSize_y}
            ref={this.canvasRef_display}
            style={{
              width: `${(mapPreviewSizeScale * 128 * optionValue_mapSize_x).toString()}px`,
              height: `${(mapPreviewSizeScale * 128 * optionValue_mapSize_y).toString()}px`,
            }}
            onClick={this.onCanvasClick}
            onPointerDown={this.onCanvasPointerDown}
            onPointerMove={this.onCanvasPointerMove}
            onPointerUp={this.onCanvasPointerUp}
            onPointerCancel={this.onCanvasPointerUp}
            onContextMenu={(e) => e.preventDefault()}
          />
          <canvas className="displayNone" width={128 * optionValue_mapSize_x} height={128 * optionValue_mapSize_y} ref={this.canvasRef_source}></canvas>
        </div>
        <div className="mapResolutionAndZoom">
          <div>
            <Tooltip tooltipText={getLocaleString("MAP-PREVIEW/BEST-RESOLUTION-TT")}>
              <small>{`${(128 * optionValue_mapSize_x).toString()}x${(128 * optionValue_mapSize_y).toString()}`}</small>
            </Tooltip>{" "}
            <Tooltip tooltipText={getLocaleString("MAP-PREVIEW/ASPECT-RATIO-MISMATCH-TT")}>
              <small
                className="mapResWarning"
                style={{
                  display:
                    uploadedImage === null || uploadedImage.height * optionValue_mapSize_x === uploadedImage.width * optionValue_mapSize_y ? "none" : "inline",
                  color: optionValue_cropImage === CropModes.OFF.uniqueId ? "red" : "orange",
                }}
              >
                {uploadedImage === null ? null : `${uploadedImage.width.toString()}x${uploadedImage.height.toString()}`}
              </small>
            </Tooltip>
          </div>
        </div>
        {this.renderEditor(palette)}
        <div
          className="progress"
          style={
            [0, 1].includes(workerProgress)
              ? {
                  display: "unset",
                  visibility: "hidden",
                }
              : { display: "block" }
          }
        >
          <span className="progressText">{`${Math.floor(workerProgress * 100)}%`}</span>
          <div
            className="progressDiv"
            style={{
              width: `${Math.floor(workerProgress * 100)}%`,
            }}
          />
        </div>
      </div>
    );
  }
}

export default MapPreview;
