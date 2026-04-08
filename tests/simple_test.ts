import { LavaXVM } from '../src/vm';
import { Op, SystemOp } from '../src/types';

async function run() {
    console.log("Starting Minimal Verification...");
    const vm = new LavaXVM();
    vm.onLog = (msg) => console.log(msg);

    // Test 1: Refresh stack balance
    console.log("--- Test 1: Refresh (returns 0) + POP ---");
    const code1 = new Uint8Array([
        0x4C, 0x41, 0x56, 18, 0, 0x00, 0, 0, 0x10, 0, 0, 0, 0, 0, 0, 0,
        SystemOp.Refresh,
        Op.POP,
        Op.EXIT
    ]);
    vm.load(code1);
    await vm.run();
    console.log("Test 1 Result SP:", vm.sp);
    if (vm.sp === 0) console.log("SUCCESS: Test 1 Passed.");
    else console.log("FAILURE: Test 1 failed, SP is", vm.sp);

    // Test 2: sprintf
    console.log("\n--- Test 2: sprintf Corruption ---");
    const code2 = new Uint8Array([
        0x4C, 0x41, 0x56, 18, 0, 0x00, 0, 0, 0x10, 0, 0, 0, 0, 0, 0, 0,
        Op.PUSH_D, 0x00, 0x10, 0x00, 0x00, // dest
        Op.PUSH_D, 0x00, 0x20, 0x00, 0x00, // fmt
        Op.PUSH_D, 123, 0, 0, 0,           // arg
        Op.PUSH_B, 3,                      // count
        SystemOp.sprintf,
        Op.POP,
        Op.EXIT
    ]);
    vm.load(code2);
    vm.memory[0x2000] = 37; // %
    vm.memory[0x2001] = 100; // d
    vm.memory[0x2002] = 0;
    await vm.run();
    console.log("Test 2 Result SP:", vm.sp);
    if (vm.sp === 0) console.log("SUCCESS: Test 2 Passed.");
    else console.log("FAILURE: Test 2 failed, SP is", vm.sp);
}

run().catch(console.error);
