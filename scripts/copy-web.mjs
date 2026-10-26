import { cp, mkdir, rm } from 'node:fs/promises';

const files = [
  'index.html',
  'manifest.webmanifest',
  'sw.js',
  'icon.svg',
  'box.svg',
  'icon-192.png',
  'icon-512.png',
  'apple-touch-icon.png',
  'assets'
];

await rm('www', { recursive: true, force: true });
await mkdir('www', { recursive: true });
for (const file of files) {
  await cp(file, `www/${file}`, { recursive: true });
}
console.log('Web app copied to www/');
