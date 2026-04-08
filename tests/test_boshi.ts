import { LavaXCompiler } from '../src/compiler';
import { LavaXAssembler } from '../src/compiler/LavaXAssembler';
import { LavaXDecompiler } from '../src/decompiler';
import { readFileSync } from 'fs';

async function main() {
    console.log("========== Testing: boshi.c ==========");
    const source = readFileSync('./examples/boshi.c', 'utf-8');
    
    const compiler = new LavaXCompiler();
    
    console.log("--- Compiling ---");
    const asm = compiler.compile(source);
    if (asm.startsWith('ERROR')) {
        console.error("COMPILE ERROR:", asm);
        process.exit(1);
    }
    console.log("Compilation OK, ASM lines:", asm.split('\n').length);
    
    const assembler = new LavaXAssembler();
    console.log("--- Assembling ---");
    const bin = assembler.assemble(asm);
    console.log(`Binary size: ${bin.length} bytes`);
    
    console.log("--- Decompiling ---");
    const decompiler = new LavaXDecompiler();
    const decomp = decompiler.decompile(bin);
    console.log("Decompile OK, lines:", decomp.split('\n').length);
    
    console.log("=== boshi.c OK ===");
}

main().catch(console.error);
