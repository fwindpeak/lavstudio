import * as fs from 'fs';
import { LavaXVM } from './src/vm';
import { LocalStorageDriver } from './src/vm/VFSStorageDriver';
import iconv from 'iconv-lite';

const lavFile = process.argv[2] || 'docs/ref_prjs/编译器/资料/通过/4.lav';
const buf = fs.readFileSync(lavFile);
const fontData = fs.readFileSync('public/fonts.dat');

const vm = new LavaXVM(new LocalStorageDriver());
vm.setInternalFontData(new Uint8Array(fontData.buffer, fontData.byteOffset, fontData.byteLength));
vm.debug = false;

const origTextOut = vm.graphics.TextOut.bind(vm.graphics);
vm.graphics.TextOut = function(x: number, y: number, bytes: Uint8Array, type: number) {
  const str = iconv.decode(Buffer.from(bytes), 'gbk');
  const hFlip = !!(type & 0x20);
  console.log(`TextOut(x=${x}, y=${y}, type=0x${type.toString(16)}, hFlip=${hFlip}, str="${str}")`);
  return origTextOut(x, y, bytes, type);
};

vm.onLog = (msg) => {
  if (!msg.startsWith('[') && !msg.startsWith('System:') && !msg.startsWith('[VFS]')) process.stdout.write(msg);
};

vm.load(new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength));
setTimeout(() => { vm.keyBuffer.push(27); if ((vm as any).resolveKeySignal) (vm as any).resolveKeySignal(); }, 200);
const timeout = setTimeout(() => vm.stop(), 3000);
vm.run().then(() => clearTimeout(timeout)).catch(e => { clearTimeout(timeout); console.error(e.message); });
