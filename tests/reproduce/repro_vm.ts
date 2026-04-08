
import { LavaXVM } from '../src/vm';
import { Op } from '../src/types';
import { HEAP_OFFSET } from '../src/types';

async function runTest() {
    const vm = new LavaXVM();
    vm.debug = true;
    vm.onLog = (msg) => console.log(msg);

    // Test recursive calls to see if state is maintained
    // main:
    //   CALL func
    //   EXIT
    // func:
    //   FUNC 0, 0
    //   LD_G_B 0 // dummy check
    //   JZ end
    //   DEC_G_B 0
    //   CALL func
    // end:
    //   RET

    const bytecode = new Uint8Array([
        0x4C, 0x41, 0x56, 0x12, 0x00, 0x74, 0x00, 0x00, 0x10, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
        // 0x10:
        Op.CALL, 0x17, 0x00, 0x00, // CALL 0x17
        Op.EXIT,
        // 0x17: func
        Op.FUNC, 0x00, 0x00, 0x00, // argc=0, space=0
        Op.LD_G_B, 0x00, 0x20,     // LD_G_B 0x2000
        Op.JZ, 0x27, 0x00, 0x00,     // JZ end (0x27)
        Op.LD_G_B, 0x00, 0x20,
        Op.PUSH_B, 0x01,
        Op.SUB,
        Op.LEA_G_B, 0x00, 0x20,
        Op.STORE,                  // Store back
        Op.POP,                    // Pop STORE result
        Op.CALL, 0x17, 0x00, 0x00, // Recursive call
        // 0x27: end
        Op.RET,
        0xCF // FINISH
    ]);

    vm.load(bytecode);

    // Set global loop counter at 0x2000
    vm.memory[0x2000] = 3; // depth 3

    console.log("Starting reproduction test...");
    await vm.run();
    console.log("Test finished.");
}

runTest().catch(console.error);
