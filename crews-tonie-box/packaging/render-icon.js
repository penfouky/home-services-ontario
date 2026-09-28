// Renders the app icon SVG to PNG files with a transparent background, using Playwright's Chromium.
//   node render-icon.js <icon.svg> <out folder> 16 32 64 ...
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

(async () => {
  const [svgFile, outDir, ...sizes] = process.argv.slice(2);
  const svg = fs.readFileSync(svgFile, 'utf8');
  fs.mkdirSync(outDir, { recursive: true });
  const browser = await chromium.launch();
  for (const size of sizes.map(Number)) {
    const page = await browser.newPage({ viewport: { width: size, height: size } });
    await page.setContent(`<body style="margin:0;background:transparent">${svg.replace('<svg ', `<svg style="display:block;width:${size}px;height:${size}px" `)}</body>`);
    await page.screenshot({ path: path.join(outDir, `icon_${size}.png`), omitBackground: true });
    await page.close();
  }
  await browser.close();
})().catch(error => {
  console.error(error);
  process.exit(1);
});
