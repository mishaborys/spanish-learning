import sharp from "sharp";
import path from "path";

const svg = (size: number) => {
  const r = size * 0.1875; // rounded corners ~6/32 ratio
  const stripeY = size * 0.25;
  const stripeH = size * 0.5;
  const fontSize = size * 0.28;
  const cx = size / 2;
  const cy = size / 2;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  <rect width="${size}" height="${size}" rx="${r}" fill="#AA151B"/>
  <rect y="${stripeY}" width="${size}" height="${stripeH}" fill="#F1BF00"/>
  <text
    x="${cx}" y="${cy}"
    text-anchor="middle"
    dominant-baseline="central"
    font-family="Arial, sans-serif"
    font-weight="800"
    font-size="${fontSize}"
    fill="#AA151B"
  >ES</text>
</svg>`;
};

const icons = [
  { size: 180, file: "public/icon-180.png" },
  { size: 192, file: "public/icon-192.png" },
  { size: 512, file: "public/icon-512.png" },
];

async function main() {
  for (const { size, file } of icons) {
    const dest = path.join(process.cwd(), file);
    await sharp(Buffer.from(svg(size))).png().toFile(dest);
    console.log(`✓ ${file}`);
  }
}

main();
