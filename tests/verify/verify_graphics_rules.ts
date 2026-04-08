
import { LavaXVM } from '../../src/vm';
import { GBUF_OFFSET, VRAM_OFFSET, SystemOp } from '../../src/types';

async function test() {
    const vm = new LavaXVM();

    // Helper to get non-zero counts
    const getCounts = () => ({
        vram: vm.memory.subarray(VRAM_OFFSET, VRAM_OFFSET + 1600).filter(b => b !== 0).length,
        gbuf: vm.memory.subarray(GBUF_OFFSET, GBUF_OFFSET + 1600).filter(b => b !== 0).length
    });

    console.log("Starting Graphics Rule Verification...");

    // 1. Line (Rule A: bit 6=1 -> GBUF, bit 6=0 -> VRAM)
    console.log("\nTesting Line (Rule A):");

    // Line to Screen (bit 6=0)
    vm.push(0); vm.push(0); vm.push(159); vm.push(79); vm.push(1);
    vm.syscall.handleSync(SystemOp.Line);
    let counts = getCounts();
    console.log("Line(1): VRAM=" + counts.vram + ", GBUF=" + counts.gbuf);

    // Reset
    vm.memory.fill(0, VRAM_OFFSET, VRAM_OFFSET + 1600);
    vm.memory.fill(0, GBUF_OFFSET, GBUF_OFFSET + 1600);

    // Line to Buffer (bit 6=1)
    vm.push(0); vm.push(0); vm.push(159); vm.push(79); vm.push(0x41);
    vm.syscall.handleSync(SystemOp.Line);
    counts = getCounts();
    console.log("Line(0x41): VRAM=" + counts.vram + ", GBUF=" + counts.gbuf);

    // 2. TextOut (Rule B: bit 6=1 -> VRAM, bit 6=0 -> GBUF)
    console.log("\nTesting TextOut (Rule B):");

    // Text to Buffer (bit 6=0)
    const strAddr = 0x5000;
    const str = "Test";
    for (let i = 0; i < str.length; i++) vm.memory[strAddr + i] = str.charCodeAt(i);
    vm.memory[strAddr + str.length] = 0;

    vm.memory.fill(0, VRAM_OFFSET, VRAM_OFFSET + 1600);
    vm.memory.fill(0, GBUF_OFFSET, GBUF_OFFSET + 1600);

    vm.push(20); vm.push(20); vm.push(strAddr); vm.push(1); // bit 6=0
    vm.syscall.handleSync(SystemOp.TextOut);
    counts = getCounts();
    console.log("TextOut(1): VRAM=" + counts.vram + ", GBUF=" + counts.gbuf);

    // Text to Screen (bit 6=1)
    vm.memory.fill(0, VRAM_OFFSET, VRAM_OFFSET + 1600);
    vm.memory.fill(0, GBUF_OFFSET, GBUF_OFFSET + 1600);

    vm.push(20); vm.push(20); vm.push(strAddr); vm.push(0x41); // bit 6=1
    vm.syscall.handleSync(SystemOp.TextOut);
    counts = getCounts();
    console.log("TextOut(0x41): VRAM=" + counts.vram + ", GBUF=" + counts.gbuf);

    // 3. Block (Rule A)
    console.log("\nTesting Block (Rule A):");
    vm.memory.fill(0, VRAM_OFFSET, VRAM_OFFSET + 1600);
    vm.memory.fill(0, GBUF_OFFSET, GBUF_OFFSET + 1600);
    vm.push(10); vm.push(10); vm.push(20); vm.push(20); vm.push(0x41); // bit 6=1 -> GBUF
    vm.syscall.handleSync(SystemOp.Block);
    counts = getCounts();
    console.log("Block(0x41): VRAM=" + counts.vram + ", GBUF=" + counts.gbuf);
}

test().catch(console.error);
