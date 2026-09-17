const sharp = require('sharp');

const sizes = [16, 32, 48, 128];
const outDir = './src/extension/public';

async function generateIcons() {
  const tasks = sizes.map((size) => {
    const outPath = outDir + '/icon-' + size + '.png';
    return sharp('./public/favicon.png')
      .png()
      .resize(size, size)
      .toFile(outPath)
      .then(() => console.log('Generated icon-' + size + '.png'));
  });

  await Promise.all(tasks);
  console.log('All icons generated');
}

generateIcons().catch((e) => {
  console.error('Generation failed:', e.message);
  process.exit(1);
});
