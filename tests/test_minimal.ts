
import { LavaXVM } from '../src/vm';
import { GBUF_OFFSET, VRAM_OFFSET } from '../src/types';

// Mock ImageData
(globalThis as any).ImageData = class { data = new Uint8ClampedArray(160 * 80 * 4); };

async function test() {
    console.log("Starting minimal test...");
    const vm = new LavaXVM();

    // Clear screen
    vm.push(0);
    // @ts-ignore
    vm.ops[0x85](); // SetScreen

    // Buffered Line
    vm.push(0); vm.push(0); vm.push(10); vm.push(10); vm.push(1);
    // @ts-ignore
    vm.ops[0x96](); // Line

    let vramSet = 0;
    for (let i = 0; i < 1600; i++) if (vm.memory[VRAM_OFFSET + i] !== 0) vramSet++;
    console.log("VRAM bytes set before Refresh:", vramSet);

    let gbufSet = 0;
    for (let i = 0; i < 1600; i++) if (vm.memory[GBUF_OFFSET + i] !== 0) gbufSet++;
    console.log("GBUF bytes set before Refresh:", gbufSet);

    if (vramSet === 0 && gbufSet > 0) {
        console.log("PASSED: Drawing is buffered.");
    } else {
        console.log("FAILED: Drawing is not properly buffered.");
    }

    // Refresh
    // @ts-ignore
    vm.ops[0x89]();

    vramSet = 0;
    for (let i = 0; i < 1600; i++) if (vm.memory[VRAM_OFFSET + i] !== 0) vramSet++;
    console.log("VRAM bytes set after Refresh:", vramSet);

    if (vramSet > 0 && vramSet === gbufSet) {
        console.log("PASSED: Refresh works.");
    } else {
        console.log("FAILED: Refresh did not sync VRAM.");
    }
}

test().catch(e => console.error(e));
