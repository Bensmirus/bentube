const sharp = require('sharp');
const fs = require('fs');
const path = require('path');

// Dark golden/brownish colors for rich aesthetic
const darkBrown = '#1a1610';
const richGold = '#d4a574';
const deepGold = '#c4956a';
const darkGold = '#9d7550';

// Create SVG for the upward triangle icon
const createPlayButtonSVG = (size) => {
  const padding = size * 0.15;
  const centerX = size / 2;
  const centerY = size / 2;

  // Upward pointing triangle dimensions
  const triangleWidth = size * 0.45;
  const triangleHeight = size * 0.5;

  // Triangle points (pointing UP)
  const topX = centerX;
  const topY = centerY - triangleHeight * 0.4;
  const leftX = centerX - triangleWidth / 2;
  const leftY = centerY + triangleHeight * 0.6;
  const rightX = centerX + triangleWidth / 2;
  const rightY = centerY + triangleHeight * 0.6;

  return `
    <svg width="${size}" height="${size}" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="darkGoldGradient" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" style="stop-color:${richGold};stop-opacity:1" />
          <stop offset="50%" style="stop-color:${deepGold};stop-opacity:1" />
          <stop offset="100%" style="stop-color:${darkGold};stop-opacity:1" />
        </linearGradient>
        <radialGradient id="bgGradient" cx="50%" cy="50%" r="50%">
          <stop offset="0%" style="stop-color:#2a2218;stop-opacity:1" />
          <stop offset="100%" style="stop-color:${darkBrown};stop-opacity:1" />
        </radialGradient>
      </defs>
      <rect width="${size}" height="${size}" fill="url(#bgGradient)" rx="${size * 0.18}"/>
      <polygon
        points="${topX},${topY} ${leftX},${leftY} ${rightX},${rightY}"
        fill="url(#darkGoldGradient)"
      />
    </svg>
  `.trim();
};

async function generateIcons() {
  const publicDir = path.join(__dirname, '..', 'public');
  const appDir = path.join(__dirname, '..', 'src', 'app');

  // Ensure directories exist
  if (!fs.existsSync(publicDir)) {
    fs.mkdirSync(publicDir, { recursive: true });
  }

  console.log('Generating icons...');

  // Generate apple-touch-icon (180x180)
  const appleTouchSVG = Buffer.from(createPlayButtonSVG(180));
  await sharp(appleTouchSVG)
    .png()
    .toFile(path.join(publicDir, 'apple-touch-icon.png'));
  console.log('✓ Created apple-touch-icon.png');

  // Generate favicon.ico (64x64 for better quality)
  const faviconSVG = Buffer.from(createPlayButtonSVG(64));
  const faviconPNG = await sharp(faviconSVG)
    .png()
    .toBuffer();

  // Save high-res favicon
  await sharp(faviconPNG)
    .toFile(path.join(publicDir, 'favicon.png'));
  console.log('✓ Created favicon.png');

  // Create 32x32 favicon.ico for browser tabs
  await sharp(faviconPNG)
    .resize(32, 32)
    .toFile(path.join(appDir, 'favicon.ico'));
  console.log('✓ Created favicon.ico');

  // Generate 192x192 for PWA
  const pwa192SVG = Buffer.from(createPlayButtonSVG(192));
  await sharp(pwa192SVG)
    .png()
    .toFile(path.join(publicDir, 'icon-192.png'));
  console.log('✓ Created icon-192.png');

  // Generate 512x512 for PWA
  const pwa512SVG = Buffer.from(createPlayButtonSVG(512));
  await sharp(pwa512SVG)
    .png()
    .toFile(path.join(publicDir, 'icon-512.png'));
  console.log('✓ Created icon-512.png');

  console.log('\n✨ All icons generated successfully!');
}

generateIcons().catch(console.error);
