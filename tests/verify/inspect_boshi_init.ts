import fs from 'fs';
import { LavaXCompiler } from '../../src/compiler';

const src = fs.readFileSync('docs/ref_prjs/boshi/boshi.c', 'utf8');
const c = new LavaXCompiler();
const asm = c.compile(src);
const lines = asm.split('\n');

for (const l of lines) {
  if (l.startsWith('INIT') || l.startsWith('SPACE') || l.includes('MapData') || l.includes('GraphicData') || l.includes('g_saMainManualItems')) {
    console.log(l);
  }
}

// Print a small slice around where INIT 8192 appears
for (let i = 0; i < lines.length; i++) {
  if (lines[i].startsWith('SPACE')) {
    const idx = i;
    console.log('--- around SPACE index', idx, '---');
    for (let j = Math.max(0, idx - 5); j < Math.min(lines.length, idx + 10); j++) console.log(lines[j]);
    break;
  }
}
