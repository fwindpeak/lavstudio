
import { LavaXCompiler } from '../../src/compiler';
import { LavaXAssembler } from '../../src/compiler/LavaXAssembler';
import fs from 'fs';

const source = fs.readFileSync('./examples/boshi.c', 'utf8');
const compiler = new LavaXCompiler();
const assembler = new LavaXAssembler();

const asm = compiler.compile(source);
const bin = assembler.assemble(asm);

console.log("Binary length:", bin.length);
// Print first 100 bytes of bytecode
let output = "";
for (let i = 0; i < 100 && i < bin.length; i++) {
    output += bin[i].toString(16).padStart(2, '0') + " ";
    if ((i + 1) % 16 === 0) output += "\n";
}
console.log(output);

// Find what's at PC 60 (remember header is 16 bytes)
// PC 60 in VM corresponds to index 60 in the Uint8Array bin.
console.log("At index 60 (PC 60):", bin[60]?.toString(16));
console.log("Instruction leading to 60:");
// We need to trace from start to find which instruction covers index 60.
