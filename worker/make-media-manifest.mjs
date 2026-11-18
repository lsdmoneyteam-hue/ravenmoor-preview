// Writes worker/media.json: the byte size of every video in a/.
// The Worker needs each file's size to answer byte-range requests.
// Run after adding or replacing a video:  node worker/make-media-manifest.mjs
import { readdirSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const dir = join(here, '..', 'a');
const sizes = {};
for (const name of readdirSync(dir).sort()) {
  if (name.endsWith('.mp4')) sizes[name] = statSync(join(dir, name)).size;
}
writeFileSync(join(here, 'media.json'), JSON.stringify(sizes, null, 1) + '\n');
console.log('media.json: ' + Object.keys(sizes).length + ' videos');
