import { LavaXVM } from '../src/vm';
import { Op, SystemOp } from '../src/types';

class MockStorageDriver {
    name = 'mock';
    ready = Promise.resolve();
    async getAll() { return new Map(); }
    async persist() { }
    async remove() { }
}

async function test() {
    const vm = new LavaXVM(new MockStorageDriver() as any);
    // Header + Refresh (0x89) + EXIT (0x40)
    const bytecode = new Uint8Array([
        0x4C, 0x41, 0x56, 18, 0, 0x00, 0, 0, 0x10, 0, 0, 0, 0, 0, 0, 0,
        SystemOp.Refresh,
        Op.EXIT
    ]);
    vm.load(bytecode);
    console.log("Running Refresh test...");
    // Test push/pop operations
    if (vm.sp !== 0) throw new Error("Stack should be 0");
    vm.push(10);
    if (vm.sp !== 1) throw new Error("Stack should be 1");
    vm.pop();
    if (vm.sp !== 0) throw new Error("Stack should be 0");

    await vm.run();
    console.log("SP after Refresh:", vm.sp);
    if (vm.sp !== 0) {
        console.error("FAIL: Stack not balanced after Refresh!");
        process.exit(1);
    } else {
        console.log("PASS: Stack balanced.");
    }

    // Test a non-void syscall like strlen
    // PUSH_STR "abc" (0x0D 'a' 'b' 'c' 0)
    // strlen
    // EXIT
    const bytecode2 = new Uint8Array([
        0x4C, 0x41, 0x56, 18, 0, 0x00, 0, 0, 0x10, 0, 0, 0, 0, 0, 0, 0,
        Op.PUSH_STR, 0x61, 0x62, 0x63, 0x00,
        SystemOp.strlen,
        Op.EXIT
    ]);
    vm.load(bytecode2);
    console.log("Running strlen test...");
    await vm.run();
    console.log("SP after strlen (should be 1):", vm.sp);
    // Note: strlen returns 3, so stack should have [result]
    if (vm.sp !== 1) {
        console.error("FAIL: Stack should have 1 item after strlen!");
        process.exit(1);
    }
    console.log("PASS: strlen returned result.");
}


async function runRepro() {
    const vm = new LavaXVM(new MockStorageDriver() as any);
    vm.onLog = (msg) => console.log(msg);

    console.log("\n--- Repro Test 1: Refresh (returns 0) + POP ---");
    const code1 = new Uint8Array([
        0x4C, 0x41, 0x56, 18, 0, 0x00, 0, 0, 0x10, 0, 0, 0, 0, 0, 0, 0,
        SystemOp.Refresh,
        Op.POP,
        Op.EXIT
    ]);
    vm.load(code1);
    await vm.run();
    console.log("SP (expected 0):", vm.sp);

    console.log("\n--- Repro Test 2: sprintf Corruption ---");
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
    console.log("SP (expected 0):", vm.sp);
}

test()
    .then(() => runRepro())
    .catch(console.error);
