import { LavaXVM } from '../src/vm';
import { Op, SystemOp } from '../src/types';

class MockStorageDriver {
    name = 'mock';
    ready = Promise.resolve();
    async getAll() { return new Map(); }
    async persist() { }
    async remove() { }
}

async function runTest() {
    const vm = new LavaXVM(new MockStorageDriver() as any);
    vm.onLog = (msg) => console.log(msg);

    console.log("--- Test 1: Void Syscall + POP ---");
    // Refresh (returns void) + POP (compiler generated) + EXIT
    const bytecode1 = new Uint8Array([
        0x4C, 0x41, 0x56, 18, 0, 0x74, 0, 0, 0x10, 0, 0, 0, 0, 0, 0, 0,
        SystemOp.Refresh,
        Op.POP,
        Op.EXIT
    ]);
    vm.load(bytecode1);
    try {
        await vm.run();
        console.log("Test 1 Finished. SP:", vm.sp);
    } catch (e) {
        console.log("Test 1 Failed as expected:", e.message);
    }

    console.log("\n--- Test 2: sprintf stack corruption ---");
    // sprintf(dest, fmt, arg, count)
    // We'll use dummy handles. 
    // dest=0x1000, fmt=0x2000, arg=123, count=3
    // PUSH_D 0x1000, PUSH_D 0x2000, PUSH_D 123, PUSH_B 3, sprintf, POP, EXIT
    const bytecode2 = new Uint8Array([
        0x4C, 0x41, 0x56, 18, 0, 0x74, 0, 0, 0x10, 0, 0, 0, 0, 0, 0, 0,
        Op.PUSH_D, 0x00, 0x10, 0x00, 0x00,
        Op.PUSH_D, 0x00, 0x20, 0x00, 0x00,
        Op.PUSH_D, 123, 0, 0, 0,
        Op.PUSH_B, 3,
        SystemOp.sprintf,
        Op.POP,
        Op.EXIT
    ]);
    vm.load(bytecode2);
    // Mock memory for fmt string
    vm.memory[0x2000] = 0x25; // %
    vm.memory[0x2001] = 0x64; // d
    vm.memory[0x2002] = 0;

    try {
        await vm.run();
        console.log("Test 2 Finished. SP:", vm.sp);
    } catch (e) {
        console.log("Test 2 Failed:", e.message);
    }
}

console.log("Starting Repro Test...");
runTest().then(() => console.log("Done.")).catch(console.error);
