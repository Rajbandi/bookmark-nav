import sharp from 'sharp';
import fs from 'node:fs';
import path from 'node:path';

const sizes = [16, 32, 48, 128];

const srcFile = path.resolve(process.cwd(), 'public/favicon.png');
const outDir = path.resolve(process.cwd(), 'src/extension/public');

if (!fs.existsSync(srcFile)) {
  console.error('Source file public/favicon.png does not exist');
  process.exit(1);
}

if (!fs.existsSync(outDir)) {
  fs.mkdirSync(outDir, { recursive: true });
}

async function generateIcons() {
  for (const size of sizes) {
    const outPath = path.join(outDir, `icon-${size}.png`);
    await sharp(srcFile).png().resize(size, size).toFile(outPath);
    console.log(`Generated icon-${size}.png`);
  }
  console.log('All extension icons have been regenerated');
}

generateIcons().catch((e) => {
  console.error('Icon generation failed:', e.message);
  process.exit(1);
});
