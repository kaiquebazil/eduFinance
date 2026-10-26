import sharp from 'sharp';

const iconSources = [
  ['assets/icons/android-adaptive-foreground.svg', 'assets/icons/android-adaptive-foreground.png'],
  ['assets/icons/android-adaptive-background.svg', 'assets/icons/android-adaptive-background.png'],
];

for (const [source, output] of iconSources) {
  await sharp(source).resize(512, 512).png().toFile(output);
}

console.log('Android adaptive icon assets generated.');
