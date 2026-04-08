import { LavaXCompiler } from '../src/compiler';
import { LavaXAssembler } from '../src/compiler/LavaXAssembler';
import { LavaXVM } from '../src/vm';
import { LavaXDecompiler } from '../src/decompiler';
import { readFileSync } from 'fs';

async function testExample(filename: string) {
    console.log(`\n========== Testing: ${filename} ==========`);
    const source = readFileSync(filename, 'utf-8');
    
    const compiler = new LavaXCompiler();
    const assembler = new LavaXAssembler();
    
    console.log("--- Compiling ---");
    const asm = compiler.compile(source);
    if (asm.startsWith('ERROR')) {
        console.error("COMPILE ERROR:", asm);
        return false;
    }
    console.log("Compilation OK, ASM lines:", asm.split('\n').length);
    
    console.log("--- Assembling ---");
    const bin = assembler.assemble(asm);
    console.log(`Binary size: ${bin.length} bytes`);
    
    console.log("--- Decompiling ---");
    const decompiler = new LavaXDecompiler();
    try {
        const decomp = decompiler.decompile(bin);
        console.log("Decompile OK, lines:", decomp.split('\n').length);
    } catch(e) {
        console.error("DECOMPILE ERROR:", e);
        return false;
    }
    
    return true;
}

async function main() {
    const examples = [
        './examples/test_ptr_arg.c',
        './examples/fulltest.c',
    ];
    
    let allOk = true;
    for (const ex of examples) {
        const ok = await testExample(ex);
        if (!ok) allOk = false;
    }
    
    if (!allOk) process.exit(1);
    console.log("\n=== All examples compiled and decompiled OK ===");
}

main().catch(console.error);
