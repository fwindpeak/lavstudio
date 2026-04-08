/**
 * Diagnose real .lav files to understand crash patterns
 */
import * as fs from 'fs';
import * as path from 'path';

const lavDir = path.join(process.cwd(), 'docs/ref_prjs/编译器/资料/通过');

// Read and parse a few lav file headers
const files = fs.readdirSync(lavDir).filter(f => f.endsWith('.lav')).slice(0, 5);

for (const file of files) {
  const buf = fs.readFileSync(path.join(lavDir, file));
  const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  
  const magic = String.fromCharCode(buf[0], buf[1], buf[2]);
  const version = buf[3];
  const strMask = buf[4];
  const memLimit = buf[5];
  const arrayInitSize = dv.getUint16(6, true);
  const jpVar = buf[8] | (buf[9] << 8) | (buf[10] << 16);
  const entryPoint = jpVar > 0 ? jpVar : 0x10;
  
  console.log(`\n=== ${file} (${buf.length} bytes) ===`);
  console.log(`Magic: ${magic}, Version: 0x${version.toString(16)}`);
  console.log(`StrMask: 0x${strMask.toString(16)}, MemLimit: 0x${memLimit.toString(16)}`);
  console.log(`ArrayInitSize: 0x${arrayInitSize.toString(16)}, JpVar: 0x${jpVar.toString(16)}`);
  console.log(`Entry PC: 0x${entryPoint.toString(16)}`);
  
  // Print first bytes from entry point
  console.log(`\nBytes at entry (0x${entryPoint.toString(16)}):`);
  const start = entryPoint;
  const hexBytes = Array.from(buf.slice(start, start + 32)).map(b => b.toString(16).padStart(2, '0')).join(' ');
  console.log(hexBytes);
  
  // Decode first few ops
  let pc = entryPoint;
  console.log('\nFirst opcodes:');
  for (let i = 0; i < 10 && pc < buf.length; i++) {
    const op = buf[pc];
    let desc = `0x${pc.toString(16).padStart(4, '0')}: 0x${op.toString(16).padStart(2, '0')}`;
    
    // Decode common opcodes
    if (op === 0x3C) { // SPACE
      const val = dv.getUint16(pc + 1, true);
      desc += ` SPACE ${val} (0x${val.toString(16)})`;
      pc += 3;
    } else if (op === 0x3D) { // CALL
      const addr = buf[pc+1] | (buf[pc+2] << 8) | (buf[pc+3] << 16);
      desc += ` CALL 0x${addr.toString(16)}`;
      pc += 4;
    } else if (op === 0x3B) { // JMP
      const addr = buf[pc+1] | (buf[pc+2] << 8) | (buf[pc+3] << 16);
      desc += ` JMP 0x${addr.toString(16)}`;
      pc += 4;
    } else if (op === 0x3E) { // FUNC
      const frameSize = dv.getUint16(pc + 1, true);
      const argCount = buf[pc + 3];
      desc += ` FUNC frameSize=${frameSize} argCount=${argCount}`;
      pc += 4;
    } else if (op === 0x01) { // PUSH_B
      desc += ` PUSH_B ${buf[pc+1]}`;
      pc += 2;
    } else if (op === 0x02) { // PUSH_W
      const val = dv.getInt16(pc + 1, true);
      desc += ` PUSH_W ${val}`;
      pc += 3;
    } else if (op === 0x03) { // PUSH_D
      const val = dv.getInt32(pc + 1, true);
      desc += ` PUSH_D ${val} (0x${(val >>> 0).toString(16)})`;
      pc += 5;
    } else if (op === 0x40) { // EXIT
      desc += ` EXIT`;
      pc++;
    } else if (op === 0x0D) { // PUSH_STR
      let strStart = pc + 1;
      let strEnd = strStart;
      while (strEnd < buf.length && buf[strEnd] !== 0) strEnd++;
      const strBytes = buf.slice(strStart, strEnd);
      desc += ` PUSH_STR "${strBytes.toString()}" (${strBytes.length} bytes)`;
      pc = strEnd + 1;
    } else if (op >= 0x80) {
      desc += ` SYSCALL 0x${op.toString(16)}`;
      pc++;
    } else {
      pc++;
    }
    
    console.log(desc);
    if (op === 0x40) break; // EXIT
  }
}
