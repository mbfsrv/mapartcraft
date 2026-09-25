// Text used by generate.js for the static HTML fallback, structured data (JSON-LD), llms.txt and llms-full.txt.
// The FAQ below mirrors src/components/faq.js; keep the two in sync when either changes.

const coloursJSON = require("../../src/components/mapart/json/coloursJSON.json");
const ditherMethods = require("../../src/components/mapart/json/ditherMethods.json");
const supportedVersions = require("../../src/components/mapart/json/supportedVersions.json");

const SITE_URL = "https://map-art.made-by-free.com";

const LINKS = {
  github: "https://github.com/mbfsrv/mapartcraft",
  original: "https://github.com/rebane2001/mapartcraft",
  videoTutorial: "https://youtu.be/j-4RXPkJKU8",
  faqVideoTutorial: "https://youtu.be/bJ-wX68WNHM",
  discord: "https://discord.gg/r7Tuerq",
  license: "https://www.gnu.org/licenses/gpl-3.0.html",
};

const versions = Object.values(supportedVersions).map((version) => version.MCVersion);
const versionRange = `${versions[0]}–${versions[versions.length - 1]}`;
const colourCount = Object.keys(coloursJSON).length;
const blockCount = Object.values(coloursJSON).reduce((count, colourSet) => count + Object.keys(colourSet.blocks).length, 0);
const ditherNames = Object.values(ditherMethods)
  .map((ditherMethod) => ditherMethod.name)
  .filter((name) => name !== "None");

const SUMMARY =
  "MapartCraft is a free, open-source Minecraft map art generator that runs in your web browser. " +
  "It converts any image into map art for Minecraft: Java Edition and exports it either as an NBT schematic " +
  "to build block by block in survival (with Litematica, Schematica or a structure block) or as map.dat files " +
  "that can be imported straight into a world.";

const WHAT_IS_MAPART =
  "In Minecraft, a map shows a top-down view of a 128×128 block area, and every block is drawn in a colour that " +
  "depends on the block type and on its height compared to the block north of it. Map art (mapart) is pixel art " +
  "built from blocks so that a map shows a picture. MapartCraft does the conversion for you: it picks the closest " +
  "block for every pixel of your image, and produces the schematic to build, the list of materials to gather, " +
  "or ready-made map.dat files. It is designed to be usable both by server admins and by survival players on " +
  "servers like 2b2t, and is based on rebane2001's original MapartCraft.";

const FEATURES = [
  "Converts any image into Minecraft map art. One map is 128×128 pixels, and artworks can span several maps (for example 2×2 maps = 256×256 pixels).",
  "Exports NBT schematics (.nbt), whole or split into 1×1 maps, for building in survival with Litematica, Schematica, a structure block or Baritone.",
  "Exports map.dat files that can be imported straight into a singleplayer world or a server you own, including the fourth map shade that is unobtainable in survival, and transparency.",
  `Supports Minecraft: Java Edition ${versions.join(", ")}.`,
  `${colourCount} map colours and ${blockCount} blocks to choose from, with block presets that can be saved and shared as a link, custom blocks, and palette export for Paint.NET.`,
  "Staircasing (3D) in Classic and Valley modes for three times as many colours, plus Full-Dark and Full-Light modes.",
  `${ditherNames.length} dithering methods: ${ditherNames.join(", ")}.`,
  "Better colour matching, cropping (centre or manual with zoom), a grid overlay showing 16×16 chunks and 1×1 splits, and image preprocessing (brightness, contrast, saturation and a background colour for transparent images).",
  "Support blocks can be added under important blocks (carpets, sand, pressure plates…) or under every block.",
  'A pixel editor (pen, eyedropper, bucket fill, undo) to touch up the converted map, and "Load .nbt" to reopen an existing map art schematic for editing.',
  "A materials list with block counts (optionally the maximum needed per 1×1 split) and an online 2D/3D viewer for the schematic.",
  "Runs entirely in the browser: no download, installation or account is needed, and images are processed on your own device.",
];

const HOW_TO_STEPS = [
  `Open ${SITE_URL}/ in a desktop browser (Chrome or Firefox recommended).`,
  'Load your image with "Change image", by dragging and dropping it onto the page, or by pasting it from the clipboard.',
  'In "Block selection", tick the blocks you can use or pick a preset such as Carpets or Greyscale.',
  'In "Settings", choose the mode (Schematic (NBT) to build in survival, or Datafile (map.dat) to import into a world), the Minecraft version, the map size, staircasing, dithering and the other options while watching the map preview.',
  "Optionally touch up individual pixels in the map preview with the pixel editor.",
  'Click "DOWNLOAD NBT" (or "DOWNLOAD AS 1x1 SPLIT" for large maps), or "DOWNLOAD MAPDAT" in map.dat mode. Check "Materials" for the blocks to gather and "VIEW ONLINE" to inspect the build in 2D/3D.',
  "Build the schematic with Litematica or Schematica, aligned to the map's 128×128 grid with north up, or replace the map_#.dat files in your world's data folder with the downloaded ones.",
];

const FAQ = [
  {
    section: "Getting started",
    items: [
      {
        question: "How do I get started with MapartCraft?",
        answer: `Watch the video tutorial: ${LINKS.faqVideoTutorial}`,
      },
    ],
  },
  {
    section: "General",
    items: [
      {
        question: "Why does the output change with the same image and settings?",
        answer:
          "The JPEG decoding and scaling algorithms vary between browsers and get changed all the time. If you wish to be 100% sure your image stays the same, right click on the Map preview and choose Save image as... Next time you can upload the image you saved.",
      },
    ],
  },
  {
    section: "Schematic (.nbt)",
    items: [
      {
        question: "What do I do with the NBT file?",
        answer: "Use it like a .schematic file.",
      },
      {
        question: "How can I use the NBT file?",
        answer:
          "You can use it with programs like cubical.xyz, MCEdit and mods like Schematica / Litematica. You can also import them into your game directly with a structure block - although it might require a redstone power source. It might be a better idea to use a datafile instead - it's easier and gives more colors.",
      },
      {
        question: "How do I get a .schematic file instead of .nbt?",
        answer:
          'Import it into cubical.xyz or MCEdit and export as .schematic. Note that if you\'re using MCEdit or Cubical, you must export the map as 1.12.2. You do not need a .schematic file for use with Baritone; use Schematica and the "#schematica" command.',
      },
      {
        question: "What if MCEdit doesn't work?",
        answer:
          "Make sure you're using MCEdit Unified and importing the NBT as a schematic, NOT loading it as a world. Alternatively, use Cubical.",
      },
      {
        question: "Why is there a row of extra blocks?",
        answer:
          "The shade a block shows up as on the map is decided by the block North of it; if the Northern block is higher then a darker tone shows, else if the Northern block is lower then a lighter tone shows, else a normal tone shows. Thus an extra row of blocks (colloquially known as a noobline) exists at the top of a map to shade the top row properly.",
      },
      {
        question: "How do I align the map?",
        answer:
          "When you have found a suitable place to build your map (eg above an ocean) make sure to open the map first and find the bottom left corner for aligning your schematic. Maps in Minecraft align to a fixed 128x128 grid. North is always the up-direction on maps and you shouldn't need to rotate the schematic.",
      },
    ],
  },
  {
    section: "Datafile (.dat)",
    items: [
      {
        question: "What is a map.dat file?",
        answer:
          "'.dat' is the native format Minecraft stores map data in, meaning you can use it to import maps into your worlds without needing to build a physical structure. It also enables you to use a fourth extra shade of color not accessible in survival.",
      },
      {
        question: "What do I do with the map.dat file?",
        answer:
          "You can use the map.dat file in singleplayer or a server you own. Create a new map in-game, go to your world's save file, then the data folder and from there you can replace map_xxx.dat files. MapartCraft downloads a .zip file containing all of the 1x1 map.dat files.",
      },
    ],
  },
  {
    section: "Settings",
    items: [
      {
        question: "What does the map size setting do?",
        answer:
          'This will define how many maps you will create for your picture. When creating bigger maps, it\'s recommended to split it into multiple schematics (lest large staircased maps stretch above the world height limit). This can be done with the "DOWNLOAD AS 1X1 SPLIT" button which downloads all the 1x1 NBTs in a .zip file.',
      },
      {
        question: "Why is my image stretched?",
        answer: "Change your map size, enable the crop option, or edit your image with an image editor.",
      },
      {
        question: "What is staircasing?",
        answer:
          "This will make your map 3D. Doing so will give you 3 times the colors, often producing a much richer mapart, but it will also make the map a lot harder to build, as it is not flat. 3D 'Classic' and 'Valley' modes produce the exact same resulting map image, however they are built differently; 'Valley' mode allows the map to be built without any downwards staircases, which may be easier in survival. More staircasing modes can be enabled from the Extras settings tab.",
      },
      {
        question: "What does the Better color setting do?",
        answer:
          "This setting will give you more natural colors. Disabling this will make the website faster and give you slightly worse colors. It is recommended to keep this enabled.",
      },
      {
        question: "What does dithering do?",
        answer:
          "This will add grain to your image to make it look a lot smoother. Floyd-Steinberg dithering is the most accurate, but the Ordered/Bayer dithering will usually have less artifacts and gives the image an unique style. It is usually recommended to disable dithering for flat-colored artwork.",
      },
      {
        question: 'What do "Add blocks under" and "Block to add" do?',
        answer:
          "Here you can pick the block that will be put under either important blocks (eg carpets, sand, pressure plates) or all blocks. This block will also be used for the noobline, which cannot be disabled.",
      },
      {
        question: "How do presets work?",
        answer:
          'You can use presets to save and load block configurations. Pick your blocks and click "Save" to save them as a preset, pick a preset to load it and click "Delete" to delete the loaded preset. It is also possible to share a link for your preset with others.',
      },
    ],
  },
  {
    section: "Custom Blocks",
    items: [
      {
        question: "How do I add custom blocks?",
        answer:
          "Custom blocks can be added from the bottom of the blocks selection pane. Different versions of a block can be added for the same block name, eg for 1.12.2 and 1.13.2+. Some examples are provided in the 'examples' section. NBT tags / block states can be found on the Minecraft Wiki. To edit an existing custom block, select it, edit the tags / versions etc, and then click the 'add' button to overwrite. Note that presets URLs do not support custom blocks.",
      },
    ],
  },
];

module.exports = {
  SITE_URL,
  LINKS,
  versionRange,
  colourCount,
  blockCount,
  ditherNames,
  SUMMARY,
  WHAT_IS_MAPART,
  FEATURES,
  HOW_TO_STEPS,
  FAQ,
  FAQ_META: {
    title: "MapartCraft FAQ – Minecraft Map Art Schematics, map.dat & Staircasing",
    description:
      "Answers to common MapartCraft questions: using NBT schematics with Litematica or Schematica, importing map.dat files, staircasing, dithering and aligning Minecraft map art.",
  },
};
