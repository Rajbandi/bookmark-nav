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
      .then(() => console.log('已生成 icon-' + size + '.png'));
  });

  await Promise.all(tasks);
  console.log('所有图标生成完成');
}

generateIcons().catch((e) => {
  console.error('生成失败:', e.message);
  process.exit(1);
});
