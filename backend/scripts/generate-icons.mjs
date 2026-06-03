import { chromium } from 'playwright';
import { readFileSync, writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const svgPath = join(__dirname, '../../frontend/public/logo.svg');
const svgContent = readFileSync(svgPath, 'utf8');

const sizes = [192, 512];

const browser = await chromium.launch();
const page = await browser.newPage();

for (const size of sizes) {
  await page.setViewportSize({ width: size, height: size });
  await page.setContent(`<!DOCTYPE html>
<html>
<head>
<style>
* { margin:0; padding:0; box-sizing:border-box; }
body { width:${size}px; height:${size}px; overflow:hidden; background:transparent; }
img { width:${size}px; height:${size}px; display:block; }
</style>
</head>
<body>
<img src="data:image/svg+xml;base64,${Buffer.from(svgContent).toString('base64')}" width="${size}" height="${size}"/>
</body>
</html>`);

  await page.waitForLoadState('networkidle');

  const buffer = await page.screenshot({
    type: 'png',
    clip: { x: 0, y: 0, width: size, height: size },
    omitBackground: false,
  });

  const outPath = join(__dirname, `../../frontend/public/icon-${size}.png`);
  writeFileSync(outPath, buffer);
  console.log(`✓ Generated icon-${size}.png (${buffer.length} bytes)`);
}

await browser.close();
console.log('Done.');
