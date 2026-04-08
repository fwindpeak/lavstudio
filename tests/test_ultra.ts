
import { LavaXVM } from '../src/vm';
import { GBUF_OFFSET, VRAM_OFFSET, TEXT_OFFSET } from '../src/types';

// Mock everything that might crash
(globalThis as any).ImageData = class { data = new Uint8ClampedArray(160 * 80 * 4); };

async function test() {
    console.log("Memory Test Start");
    const vm = new LavaXVM();

    // 1. Initial State
    vm.push(0);
    // @ts-ignore
    vm.ops[0x85](); // SetScreen

    // 2. Line (Rule A: bit 6=0 -> VRAM)
    console.log("Testing Line (Direct)...");
    vm.push(0); vm.push(0); vm.push(10); vm.push(10); vm.push(1);
    // @ts-ignore
    vm.ops[0x96]();

    let vramBytes = 0;
    for (let i = 0; i < 1600; i++) if (vm.memory[VRAM_OFFSET + i] !== 0) vramBytes++;
    console.log("VRAM bytes set:", vramBytes);

    // 3. Refresh (GBUF -> VRAM)
    console.log("Testing Refresh (should clear VRAM since GBUF is empty)...");
    // @ts-ignore
    vm.ops[0x89]();

    vramBytes = 0;
    for (let i = 0; i < 1600; i++) if (vm.memory[VRAM_OFFSET + i] !== 0) vramBytes++;
    console.log("VRAM bytes after Refresh:", vramBytes);

    // 4. UpdateLCD
    console.log("Testing UpdateLCD...");
    vm.memory[TEXT_OFFSET] = 65; // 'A'
    vm.memory[TEXT_OFFSET + 1] = 0;
    vm.push(0);
    // @ts-ignore
    vm.ops[0x86]();

    vramBytes = 0;
    for (let i = 0; i < 1600; i++) if (vm.memory[VRAM_OFFSET + i] !== 0) vramBytes++;
    console.log("VRAM bytes after UpdateLCD:", vramBytes);

    console.log("Memory Test End");
}

test().catch(e => console.log("ERROR:", e));
