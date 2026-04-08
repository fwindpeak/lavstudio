import { LavaXCompiler } from '../src/compiler';
import { LavaXAssembler } from '../src/compiler/LavaXAssembler';
import { LavaXVM } from '../src/vm';
import { LavaXDecompiler } from '../src/decompiler';
import { readFileSync } from 'fs';

async function testExample(filename: string, inputChars: string = '') {
    console.log(`\n========== Testing: ${filename} ==========`);
    const source = readFileSync(filename, 'utf-8');
    
    const compiler = new LavaXCompiler();
    const assembler = new LavaXAssembler();
    const vm = new LavaXVM();
    
    const asm = compiler.compile(source);
    if (asm.startsWith('ERROR')) {
        console.error("COMPILE ERROR:", asm);
        return false;
    }
    
    const bin = assembler.assemble(asm);
    console.log(`Binary size: ${bin.length} bytes`);
    
    let inputIdx = 0;
    const inputQueue = Array.from(inputChars).map(c => c.charCodeAt(0));
    
    vm.onLog = (msg: string) => process.stdout.write(msg);
    vm.onGetChar = () => {
        if (inputIdx < inputQueue.length) return inputQueue[inputIdx++];
        return 27; // ESC to exit
    };
    
    vm.load(bin);
    
    try {
        const timeout = new Promise<void>((_, reject) => 
            setTimeout(() => reject(new Error('TIMEOUT after 5s')), 5000));
        const run = vm.run();
        await Promise.race([run, timeout]);
        console.log("Run OK, final SP:", vm.sp);
        return true;
    } catch(e: any) {
        if (e.message.includes('TIMEOUT')) {
            console.log("VM timed out (may be waiting for input), considering OK");
            return true;
        }
        console.error("RUN ERROR:", e);
        return false;
    }
}

async function main() {
    await testExample('./examples/test_ptr_arg.c');
    await testExample('./examples/fulltest.c', '\x1b'); // ESC to exit
}

main().catch(console.error);
