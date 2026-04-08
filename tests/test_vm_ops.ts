
import { LavaXVM } from '../src/vm';
import { Op } from '../src/types';

async function testOps() {
    const vm = new LavaXVM();
    vm.onLog = (msg) => console.log(msg);

    // Manual bytecode for testing:
    // Op.LEA_ABS (0x19) + 4-byte 1234
    // Op.PUSH_B (0x01) + 1-byte 42
    // Op.ADD (0x21)
    // Op.EXIT (0x40)
    const code = new Uint8Array([
        0x4C, 0x41, 0x56, 0x12, 0x00, 0x80, 0x00, 0x00, 0x10, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
        0x19, 0x34, 0x12, 0x00, 0x00, // LEA_ABS 0x1234 (4 bytes)
        0x01, 0x2A,                   // PUSH_B 42
        0x21,                         // ADD
        0x40                          // EXIT
    ]);

    vm.load(code);
    await vm.run();

    console.log("SP:", vm.sp);
    if (vm.sp > 0) {
        const result = vm.pop();
        console.log("Result (0x1234 + 42 = 4704):", result);
        if (result === 4660 + 42) {
            console.log("TEST PASSED: LEA_ABS 4-byte operand handled correctly.");
        } else {
            console.log("TEST FAILED: result is", result);
        }
    } else {
        console.log("TEST FAILED: Stack is empty.");
    }
}


import { SystemOp } from '../src/types';

async function testUnderflow() {
    const vm = new LavaXVM();
    vm.onLog = (msg) => console.log(msg);

    console.log("\n--- Test 1: Void Syscall + POP ---");
    // Refresh (0x89) + POP (0x38) + EXIT (0x40)
    // Now Refresh returns 0, so POP should be safe.
    const bytecode1 = new Uint8Array([
        0x4C, 0x41, 0x56, 18, 0, 0x00, 0, 0, 0x10, 0, 0, 0, 0, 0, 0, 0,
        SystemOp.Refresh,
        Op.POP,
        Op.EXIT
    ]);
    vm.load(bytecode1);
    try {
        await vm.run();
        console.log("Test 1 Finished. SP:", vm.sp);
    } catch (e: any) {
        console.log("Test 1 Failed:", e.message);
    }

    console.log("\n--- Test 2: sprintf stack corruption ---");
    // sprintf(dest, fmt, arg, count)
    const bytecode2 = new Uint8Array([
        0x4C, 0x41, 0x56, 18, 0, 0x00, 0, 0, 0x10, 0, 0, 0, 0, 0, 0, 0,
        Op.PUSH_D, 0x00, 0x10, 0x00, 0x00, // dest
        Op.PUSH_D, 0x00, 0x20, 0x00, 0x00, // fmt
        Op.PUSH_D, 123, 0, 0, 0,           // arg
        Op.PUSH_B, 3,                      // count
        SystemOp.sprintf,
        Op.POP,
        Op.EXIT
    ]);
    vm.load(bytecode2);
    vm.memory[0x2000] = 0x25; // %
    vm.memory[0x2001] = 0x64; // d
    vm.memory[0x2002] = 0;

    try {
        await vm.run();
        console.log("Test 2 Finished. SP:", vm.sp);
    } catch (e: any) {
        console.log("Test 2 Failed:", e.message);
    }
}

testOps()
    .then(() => testUnderflow())
    .catch(e => console.error(e));
