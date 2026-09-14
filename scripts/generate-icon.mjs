import sharp from 'sharp';
import fs from 'node:fs';
import path from 'node:path';

const sizes = [16, 32, 48, 128];

const srcFile = path.resolve(process.cwd(), 'public/favicon.png');
const outDir = path.resolve(process.cwd(), 'src/extension/public');

if (!fs.existsSync(srcFile)) {
  console.error('源文件 public/favicon.png 不存在');
  process.exit(1);
}

if (!fs.existsSync(outDir)) {
  fs.mkdirSync(outDir, { recursive: true });
}

async function generateIcons() {
  for (const size of sizes) {
    const outPath = path.join(outDir, `icon-${size}.png`);
    await sharp(srcFile).png().resize(size, size).toFile(outPath);
    console.log(`已生成 icon-${size}.png`);
  }
  console.log('插件图标已全部重新生成');
}

generateIcons().catch((e) => {
  console.error('图标生成失败:', e.message);
  process.exit(1);
});
