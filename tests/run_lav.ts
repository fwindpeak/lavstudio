/**
 * Run a real .lav file and capture debug output
 */
import * as fs from 'fs';
import * as path from 'path';
import { LavaXVM } from '../src/vm';
import { LocalStorageDriver } from '../src/vm/VFSStorageDriver';

const lavFile = process.argv[2] || 'docs/ref_prjs/编译器/资料/通过/1.lav';
const buf = fs.readFileSync(path.join(process.cwd(), lavFile));

// Load font
const fontData = fs.readFileSync(path.join(process.cwd(), 'public/fonts.dat'));

const vfsDriver = new LocalStorageDriver();
const vm = new LavaXVM(vfsDriver);
vm.setInternalFontData(new Uint8Array(fontData.buffer, fontData.byteOffset, fontData.byteLength));

vm.debug = true;
vm.load(new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength));

let lineCount = 0;
const MAX_LINES = 80;

vm.onLog = (msg) => {
  if (lineCount < MAX_LINES) {
    console.log(msg);
    lineCount++;
  }
  if (lineCount === MAX_LINES) {
    console.log('... (truncated)');
    lineCount++;
    vm.debug = false; // Stop debug output
  }
};

vm.onUpdateScreen = () => {
  // Screen updates - ignore
};

console.log(`Running: ${lavFile} (${buf.length} bytes)`);

// Add a key after 100ms to unblock getchar
setTimeout(() => {
  vm.keyBuffer.push(0x1B); // ESC key
  if (vm['resolveKeySignal']) {
    vm['resolveKeySignal']();
  }
}, 100);

// Timeout after 3 seconds
const timeout = setTimeout(() => {
  console.log('\n[TIMEOUT] Stopping VM after 3 seconds');
  vm.stop();
}, 3000);

vm.run().then(() => {
  clearTimeout(timeout);
  console.log('\nVM finished. SP:', vm.sp);
}).catch(e => {
  clearTimeout(timeout);
  console.error('Error:', e.message);
});
