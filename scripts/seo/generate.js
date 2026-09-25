// Runs after `npm run build` (the "postbuild" npm script).
//
// The app is a single page, so without this every URL would serve the same English build/index.html, and
// GitHub Pages would answer /ja/, /faq/ etc. with 404.html and a 404 status. This writes a real
// index.html for every route with its own <html lang>, title, description, canonical URL, hreflang links,
// JSON-LD and a <noscript> text fallback for crawlers that do not run JavaScript, then adds sitemap.xml,
// llms.txt and llms-full.txt. Nothing here is rendered for visitors with JavaScript enabled.

const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");

const content = require("./content");

const { SITE_URL, LINKS, FAQ, FAQ_META } = content;

const BUILD_DIR = path.resolve(__dirname, "../../build");
const LOCALE_DIR = path.resolve(__dirname, "../../src/locale");

// ===== locales =====

const locales = {};
for (const code of fs.readdirSync(LOCALE_DIR)) {
  const stringsFile = path.join(LOCALE_DIR, code, "strings.json");
  if (fs.existsSync(stringsFile)) {
    locales[code] = JSON.parse(fs.readFileSync(stringsFile, "utf8"));
  }
}
// en is the default language, served at the root
const localeCodes = ["en", ...Object.keys(locales).filter((code) => code !== "en")];

// same lookup and en fallback as Root.getLocaleString
function getLocaleString(code, stringName) {
  let folder = locales[code];
  for (const stringSegment of stringName.split("/")) {
    folder = folder[stringSegment];
  }
  if (folder === null) {
    if (code !== "en" && stringName.startsWith("HEAD-META-TAGS/")) {
      console.warn(`[seo] ${code}: ${stringName} is not translated, falling back to en`);
    }
    return getLocaleString("en", stringName);
  }
  return folder;
}

function languagePath(code) {
  return code === "en" ? "/" : `/${code}/`;
}

const languageTags = localeCodes.map((code) => getLocaleString(code, "HEAD-META-TAGS/LANGUAGE-TAG"));

// ===== helpers =====

function escapeHTML(text) {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

// replaces exactly one match, so a changed public/index.html fails the build instead of silently dropping tags
function replaceOnce(html, pattern, replacement) {
  const matches = html.match(new RegExp(pattern.source, "g"));
  if (matches === null || matches.length !== 1) {
    throw new Error(`[seo] expected exactly one match for ${pattern} in build/index.html, found ${matches === null ? 0 : matches.length}`);
  }
  return html.replace(pattern, replacement);
}

function setMetaContent(html, key, value) {
  return replaceOnce(html, new RegExp(`(<meta ${key} content=")[^"]*(")`), `$1${escapeHTML(value)}$2`);
}

function jsonLDScript(graph) {
  // < keeps "</script>" inside a string from closing the tag
  const json = JSON.stringify({ "@context": "https://schema.org", "@graph": graph }).replace(/</g, "\\u003c");
  return `<script type="application/ld+json">${json}</script>`;
}

function getLastModified() {
  try {
    return execSync("git log -1 --format=%cs", { cwd: __dirname, stdio: ["ignore", "pipe", "ignore"] })
      .toString()
      .trim();
  } catch (e) {
    return null;
  }
}

// ===== structured data =====

const IMAGE_URL = `${SITE_URL}/images/preview.png`;

const websiteNode = {
  "@type": "WebSite",
  "@id": `${SITE_URL}/#website`,
  url: `${SITE_URL}/`,
  name: "MapartCraft",
  description: content.SUMMARY,
  inLanguage: languageTags,
};

const applicationNode = {
  "@type": "WebApplication",
  "@id": `${SITE_URL}/#app`,
  name: "MapartCraft",
  url: `${SITE_URL}/`,
  description: content.SUMMARY,
  applicationCategory: "DesignApplication",
  applicationSubCategory: "Minecraft map art generator",
  operatingSystem: "Any",
  browserRequirements: "Requires JavaScript. Chrome or Firefox recommended.",
  isAccessibleForFree: true,
  offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
  featureList: content.FEATURES,
  image: IMAGE_URL,
  screenshot: IMAGE_URL,
  inLanguage: languageTags,
  license: LINKS.license,
  softwareHelp: { "@type": "WebPage", url: `${SITE_URL}/faq/` },
  sameAs: [LINKS.github],
  isBasedOn: LINKS.original,
  author: { "@type": "Person", name: "rebane2001", url: "https://github.com/rebane2001" },
  contributor: [
    { "@type": "Person", name: "SelfAdjointOperator", url: "https://github.com/SelfAdjointOperator" },
    { "@type": "Person", name: "yamak493" },
  ],
  keywords: "Minecraft map art, mapart, map art generator, schematic, NBT, map.dat, Litematica, Schematica, staircasing, dithering, 2b2t",
};

function pageNode(type, url, title, description, languageTag, extra = {}) {
  return {
    "@type": type,
    "@id": `${url}#webpage`,
    url,
    name: title,
    description,
    inLanguage: languageTag,
    isPartOf: { "@id": websiteNode["@id"] },
    about: { "@id": applicationNode["@id"] },
    primaryImageOfPage: { "@type": "ImageObject", url: IMAGE_URL },
    ...extra,
  };
}

// ===== <noscript> fallbacks =====

function listHTML(tag, items) {
  return `<${tag}>${items.map((item) => `<li>${escapeHTML(item)}</li>`).join("")}</${tag}>`;
}

function mainNoscriptHTML(code) {
  const s = (stringName) => getLocaleString(code, stringName);
  const intro =
    `${escapeHTML(s("DESCRIPTION/1"))}<a href="https://www.reddit.com/r/2b2t/">2b2t</a>${escapeHTML(s("DESCRIPTION/2"))} ` +
    `${escapeHTML(s("DESCRIPTION/3"))}<a href="https://redd.it/2yck3f">${escapeHTML(s("DESCRIPTION/4"))}</a>${escapeHTML(s("DESCRIPTION/5"))}`;
  const faqPath = code === "en" ? "/faq/" : `/${code}/faq/`;
  // the feature list and how-to only exist in English, so they are only added to the English page
  const englishDetails =
    code === "en"
      ? `<h2>Features</h2>${listHTML("ul", content.FEATURES)}<h2>How to make Minecraft map art</h2>${listHTML("ol", content.HOW_TO_STEPS)}`
      : "";
  return (
    "<noscript>You need to enable JavaScript to run this app." +
    `<main><h1>MapartCraft</h1><p>${escapeHTML(s("HEAD-META-TAGS/DESCRIPTION"))}</p><p>${intro}</p>${englishDetails}` +
    `<ul><li><a href="${faqPath}">${escapeHTML(s("FAQ/FAQ"))}</a></li>` +
    `<li><a href="${LINKS.videoTutorial}">${escapeHTML(s("FAQ/VIDEO-TUTORIAL"))}</a></li>` +
    `<li><a href="${LINKS.github}">GitHub</a></li></ul></main></noscript>`
  );
}

function faqNoscriptHTML() {
  const sections = FAQ.map(
    ({ section, items }) =>
      `<h2>${escapeHTML(section)}</h2>` + items.map(({ question, answer }) => `<h3>${escapeHTML(question)}</h3><p>${escapeHTML(answer)}</p>`).join("")
  ).join("");
  return (
    "<noscript>You need to enable JavaScript to run this app." +
    `<main><h1>FAQ</h1><p>${escapeHTML(FAQ_META.description)}</p>${sections}<p><a href="/">MapartCraft</a></p></main></noscript>`
  );
}

// ===== pages =====

function renderPage(template, { languageTag, ogLocale, title, description, canonicalURL, headExtra, noscript }) {
  let html = template;
  html = replaceOnce(html, /<html lang="[^"]*"/, `<html lang="${escapeHTML(languageTag)}"`);
  html = replaceOnce(html, /<title>[^<]*<\/title>/, `<title>${escapeHTML(title)}</title>`);
  html = setMetaContent(html, 'name="description"', description);
  html = replaceOnce(html, /(<link rel="canonical" href=")[^"]*(")/, `$1${canonicalURL}$2`);
  html = setMetaContent(html, 'property="og:title"', title);
  html = setMetaContent(html, 'property="og:url"', canonicalURL);
  html = setMetaContent(html, 'property="og:description"', description);
  html = setMetaContent(html, 'property="og:locale"', ogLocale);
  html = setMetaContent(html, 'name="twitter:title"', title);
  html = setMetaContent(html, 'name="twitter:description"', description);
  html = replaceOnce(html, /<\/head>/, `${headExtra}</head>`);
  html = replaceOnce(html, /<noscript>[\s\S]*?<\/noscript>/, noscript);
  return html;
}

function writePage(urlPath, html) {
  const directory = path.join(BUILD_DIR, ...urlPath.split("/").filter(Boolean));
  fs.mkdirSync(directory, { recursive: true });
  fs.writeFileSync(path.join(directory, "index.html"), html);
}

const template = fs.readFileSync(path.join(BUILD_DIR, "index.html"), "utf8");
if (template.includes("application/ld+json")) {
  throw new Error("[seo] build/index.html has already been processed; run `npm run build` again instead");
}

const hreflangLinks =
  localeCodes
    .map((code, index) => `<link rel="alternate" hreflang="${languageTags[index]}" href="${SITE_URL}${languagePath(code)}">`)
    .join("") + `<link rel="alternate" hreflang="x-default" href="${SITE_URL}/">`;

localeCodes.forEach((code, index) => {
  const url = `${SITE_URL}${languagePath(code)}`;
  const title = getLocaleString(code, "HEAD-META-TAGS/TITLE");
  const description = getLocaleString(code, "HEAD-META-TAGS/DESCRIPTION");
  writePage(
    languagePath(code),
    renderPage(template, {
      languageTag: languageTags[index],
      ogLocale: getLocaleString(code, "HEAD-META-TAGS/OG-LOCALE"),
      title,
      description,
      canonicalURL: url,
      headExtra: hreflangLinks + jsonLDScript([websiteNode, applicationNode, pageNode("WebPage", url, title, description, languageTags[index])]),
      noscript: mainNoscriptHTML(code),
    })
  );
});

// the FAQ is English only, so every /<code>/faq/ is a copy of /faq/ and points its canonical URL there
const faqURL = `${SITE_URL}/faq/`;
const faqPage = renderPage(template, {
  languageTag: "en",
  ogLocale: "en_US",
  title: FAQ_META.title,
  description: FAQ_META.description,
  canonicalURL: faqURL,
  headExtra: jsonLDScript([
    websiteNode,
    applicationNode,
    pageNode("FAQPage", faqURL, FAQ_META.title, FAQ_META.description, "en", {
      mainEntity: FAQ.flatMap(({ items }) =>
        items.map(({ question, answer }) => ({
          "@type": "Question",
          name: question,
          acceptedAnswer: { "@type": "Answer", text: answer },
        }))
      ),
    }),
  ]),
  noscript: faqNoscriptHTML(),
});
for (const code of localeCodes) {
  writePage(code === "en" ? "/faq/" : `/${code}/faq/`, faqPage);
}

// ===== sitemap.xml =====

const lastModified = getLastModified();
const lastModifiedXML = lastModified ? `<lastmod>${lastModified}</lastmod>` : "";
const alternateLinksXML =
  localeCodes.map((code, index) => `    <xhtml:link rel="alternate" hreflang="${languageTags[index]}" href="${SITE_URL}${languagePath(code)}"/>\n`).join("") +
  `    <xhtml:link rel="alternate" hreflang="x-default" href="${SITE_URL}/"/>\n`;
const sitemapEntries = [
  ...localeCodes.map((code) => `  <url>\n    <loc>${SITE_URL}${languagePath(code)}</loc>${lastModifiedXML}\n${alternateLinksXML}  </url>\n`),
  `  <url>\n    <loc>${faqURL}</loc>${lastModifiedXML}\n  </url>\n`,
];
fs.writeFileSync(
  path.join(BUILD_DIR, "sitemap.xml"),
  '<?xml version="1.0" encoding="UTF-8"?>\n' +
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">\n' +
    sitemapEntries.join("") +
    "</urlset>\n"
);

// ===== llms.txt / llms-full.txt (https://llmstxt.org/) =====

const languageNames = new Intl.DisplayNames(["en"], { type: "language" });
const languageLinksMarkdown = localeCodes
  .map((code, index) => {
    const tag = languageTags[index];
    const englishName = languageNames.of(tag);
    const nativeName = new Intl.DisplayNames([tag], { type: "language" }).of(tag);
    const name = nativeName.toLowerCase() === englishName.toLowerCase() ? englishName : `${englishName} (${nativeName})`;
    return `- [${name}](${SITE_URL}${languagePath(code)})`;
  })
  .join("\n");

const keyFacts = [
  `Web app: ${SITE_URL}/ (free, no installation or account; images are processed locally in the browser)`,
  "Exports: NBT schematic (.nbt) for Litematica / Schematica / structure blocks, or map.dat files for direct import into a world",
  `Minecraft: Java Edition ${content.versionRange}; ${content.colourCount} map colours, ${content.blockCount} blocks, ${content.ditherNames.length} dithering methods, 3D staircasing (Classic / Valley)`,
  `Interface languages: ${localeCodes.length}`,
  `Open source (GPL-3.0), based on rebane2001's MapartCraft: ${LINKS.github}`,
];

const llmsTxt = `# MapartCraft

> ${content.SUMMARY}

${keyFacts.map((fact) => `- ${fact}`).join("\n")}

## Docs

- [Full guide](${SITE_URL}/llms-full.txt): what map art is, all features, step-by-step instructions and the complete FAQ in one Markdown file
- [FAQ](${faqURL}): using NBT schematics and map.dat files, staircasing, dithering, presets and aligning maps
- [Video tutorial](${LINKS.videoTutorial}): how to make map art with MapartCraft

## Languages

${languageLinksMarkdown}

## Optional

- [Source code on GitHub](${LINKS.github}): GPL-3.0; bug reports and feature requests go to the issue tracker
- [Original MapartCraft by rebane2001](${LINKS.original})
- [2b2t Mapart Discord](${LINKS.discord}): community for map art builders
`;

const faqMarkdown = FAQ.map(
  ({ section, items }) => `### ${section}\n\n` + items.map(({ question, answer }) => `#### ${question}\n\n${answer}`).join("\n\n")
).join("\n\n");

const llmsFullTxt = `# MapartCraft

> ${content.SUMMARY}

## What is Minecraft map art?

${content.WHAT_IS_MAPART}

## Features

${content.FEATURES.map((feature) => `- ${feature}`).join("\n")}

## How to make Minecraft map art with MapartCraft

${content.HOW_TO_STEPS.map((step, index) => `${index + 1}. ${step}`).join("\n")}

## FAQ

${faqMarkdown}

## Languages

${languageLinksMarkdown}

## Links

- Web app: ${SITE_URL}/
- FAQ: ${faqURL}
- Video tutorial: ${LINKS.videoTutorial}
- Source code (GPL-3.0): ${LINKS.github}
- Original MapartCraft by rebane2001: ${LINKS.original}
- 2b2t Mapart Discord: ${LINKS.discord}
`;

fs.writeFileSync(path.join(BUILD_DIR, "llms.txt"), llmsTxt);
fs.writeFileSync(path.join(BUILD_DIR, "llms-full.txt"), llmsFullTxt);

console.log(`[seo] wrote ${localeCodes.length} language pages, ${localeCodes.length} FAQ pages, sitemap.xml, llms.txt and llms-full.txt`);
