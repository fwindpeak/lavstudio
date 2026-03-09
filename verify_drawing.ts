
import { GraphicsEngine } from './src/vm/GraphicsEngine';
import { GBUF_OFFSET, VRAM_OFFSET, SCREEN_WIDTH, SCREEN_HEIGHT } from './src/types';

function test() {
    const memory = new Uint8Array(1024 * 1024);
    const engine = new GraphicsEngine(memory, () => { });

    console.log("Testing Correct Syscall Mapping Schemes...");

    // 1. Line (Category A: 1=GBUF) 
    // Syscall Line(..., 1) -> SyscallHandler passes 1 -> bit 6=0 -> VRAM.
    // Syscall Line(..., 0x41) -> SyscallHandler passes 0x41 -> bit 6=1 -> GBUF.

    // Testing immediate VRAM draw (Line mode 1)
    engine.drawLine(0, 0, 10, 10, 1);
    let vramCount = memory.subarray(VRAM_OFFSET, VRAM_OFFSET + 1600).filter(b => b !== 0).length;
    console.log(`Line(mode=1) to VRAM: ${vramCount > 0 ? "PASSED" : "FAILED"} (count: ${vramCount})`);

    // Testing deferred GBUF draw (Line mode 0x41)
    memory.fill(0);
    engine.drawLine(0, 0, 10, 10, 0x41);
    let gbufCount = memory.subarray(GBUF_OFFSET, GBUF_OFFSET + 1600).filter(b => b !== 0).length;
    console.log(`Line(mode=0x41) to GBUF: ${gbufCount > 0 ? "PASSED" : "FAILED"} (count: ${gbufCount})`);

    // 2. Block (Category C: Always GBUF)
    // Syscall Block(..., 1) -> SyscallHandler forces bit 6=1 -> Engine(0x41) -> GBUF.
    memory.fill(0);
    engine.drawFillBox(10, 10, 5, 5, 0x41);
    gbufCount = memory.subarray(GBUF_OFFSET, GBUF_OFFSET + 1600).filter(b => b !== 0).length;
    vramCount = memory.subarray(VRAM_OFFSET, VRAM_OFFSET + 1600).filter(b => b !== 0).length;
    console.log(`Block(mode=1) to GBUF: ${gbufCount > 0 ? "PASSED" : "FAILED"}, to VRAM: ${vramCount === 0 ? "PASSED" : "FAILED"}`);

    // 3. XOR Test for Block
    memory.fill(0);
    // Draw 1st time
    engine.drawBox(20, 20, 5, 5, 0x41); // Mode 1 -> GBUF
    const count1 = memory.subarray(GBUF_OFFSET, GBUF_OFFSET + 1600).filter(b => b !== 0).length;
    // Draw 2nd time (XOR mode 2) -> Engine(0x42)
    engine.drawBox(20, 20, 5, 5, 0x42);
    const count2 = memory.subarray(GBUF_OFFSET, GBUF_OFFSET + 1600).filter(b => b !== 0).length;
    console.log(`Block XOR Test: Count1: ${count1}, Count2: ${count2} (expected 0) -> ${count2 === 0 ? "PASSED" : "FAILED"}`);
}

test();
