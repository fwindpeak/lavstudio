/**
 * Test Chinese rendering by outputting PNG
 */
import * as fs from 'fs';
import * as path from 'path';
import { GraphicsEngine } from './src/vm/GraphicsEngine';
import { MEMORY_SIZE, VRAM_OFFSET, SCREEN_WIDTH, SCREEN_HEIGHT } from './src/types';

// Create mock memory
const memory = new Uint8Array(MEMORY_SIZE);
let lastImage: any = null;

const graphics = new GraphicsEngine(memory, (img) => {
  lastImage = img;
});

// Load font
const fontData = fs.readFileSync('public/fonts.dat');
graphics.setInternalFontData(new Uint8Array(fontData.buffer, fontData.byteOffset, fontData.byteLength));

// Test 1: Write "中文" via writeString (printf path)
graphics.writeString("中文测试 ABC", 1);
graphics.flushScreen();

// Output as PGM (grayscale)
const outputPGM = (img: any, filename: string) => {
  // Extract grayscale from VRAM (2-color mode uses bit-per-pixel)
  const rows: string[] = [];
  for (let y = 0; y < SCREEN_HEIGHT; y++) {
    let row = '';
    for (let x = 0; x < SCREEN_WIDTH; x++) {
      const i = y * SCREEN_WIDTH + x;
      const byteIdx = VRAM_OFFSET + Math.floor(i / 8);
      const bitIdx = 7 - (i % 8);
      const pixel = (memory[byteIdx] >> bitIdx) & 1;
      row += pixel ? '#' : '.';
    }
    rows.push(row);
  }
  fs.writeFileSync(filename, rows.join('\n'));
};

outputPGM(lastImage, '/tmp/test_chinese.txt');
console.log('Chinese rendering test saved to /tmp/test_chinese.txt');
console.log('First few rows:');
const content = fs.readFileSync('/tmp/test_chinese.txt', 'utf-8');
content.split('\n').slice(0, 15).forEach(r => console.log(r));

// Test 2: Direct TextOut with Chinese
memory.fill(0, VRAM_OFFSET, VRAM_OFFSET + 2000);
const testStr = Buffer.from([0xD6, 0xD0, 0xCE, 0xC4]); // 中文 in GBK
graphics.TextOut(0, 0, testStr, 0x41); // toVram=1, copy
graphics.flushScreen();
outputPGM(lastImage, '/tmp/test_textout.txt');
console.log('\nDirect TextOut test:');
const content2 = fs.readFileSync('/tmp/test_textout.txt', 'utf-8');
content2.split('\n').slice(0, 20).forEach(r => console.log(r));
