
import { LavaXVM } from '../src/vm';
import { GBUF_OFFSET, VRAM_OFFSET } from '../src/types';

async function test() {
    const vm = new LavaXVM();

    // Simulate: SetScreen(0); Line(0, 0, 159, 79, 1); Circle(80, 40, 30, 0, 1); Refresh();

    // 1. SetScreen(0)
    vm.push(0);
    vm.syscall.handleSync(0x85); // SetScreen

    console.log("After SetScreen(0):");
    console.log("VRAM non-zero count:", vm.memory.subarray(VRAM_OFFSET, VRAM_OFFSET + 1600).filter(b => b !== 0).length);
    console.log("GBUF non-zero count:", vm.memory.subarray(GBUF_OFFSET, GBUF_OFFSET + 1600).filter(b => b !== 0).length);

    // 2. Line(0, 0, 159, 79, 1)
    vm.push(0); // x0
    vm.push(0); // y0
    vm.push(159); // x1
    vm.push(79); // y1
    vm.push(1); // mode
    vm.syscall.handleSync(0x96); // Line

    console.log("\nAfter Line(0, 0, 159, 79, 1):");
    console.log("VRAM non-zero count:", vm.memory.subarray(VRAM_OFFSET, VRAM_OFFSET + 1600).filter(b => b !== 0).length);
    console.log("GBUF non-zero count:", vm.memory.subarray(GBUF_OFFSET, GBUF_OFFSET + 1600).filter(b => b !== 0).length);

    // 3. Circle(80, 40, 30, 0, 1)
    vm.push(80); // x
    vm.push(40); // y
    vm.push(30); // r
    vm.push(0); // fill
    vm.push(1); // mode
    vm.syscall.handleSync(0x98); // Circle

    console.log("\nAfter Circle(80, 40, 30, 0, 1):");
    console.log("VRAM non-zero count:", vm.memory.subarray(VRAM_OFFSET, VRAM_OFFSET + 1600).filter(b => b !== 0).length);
    console.log("GBUF non-zero count:", vm.memory.subarray(GBUF_OFFSET, GBUF_OFFSET + 1600).filter(b => b !== 0).length);

    // 4. Refresh()
    vm.syscall.handleSync(0x89); // Refresh

    console.log("\nAfter Refresh():");
    console.log("VRAM non-zero count:", vm.memory.subarray(VRAM_OFFSET, VRAM_OFFSET + 1600).filter(b => b !== 0).length);
    console.log("GBUF non-zero count:", vm.memory.subarray(GBUF_OFFSET, GBUF_OFFSET + 1600).filter(b => b !== 0).length);
}

test().catch(console.error);
