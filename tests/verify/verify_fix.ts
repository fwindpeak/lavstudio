
import { LavaXVM } from '../../src/vm';
import { LavaXCompiler } from '../../src/compiler';
import { LavaXAssembler } from '../../src/compiler/LavaXAssembler';
import { Op, SystemOp } from '../../src/types';

async function testFreadLeak() {
    const vm = new LavaXVM();
    vm.vfs.addFile("test.dat", new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]));

    const fp = vm.vfs.openFile("test.dat", "rb");
    const bufAddr = 0x3000;

    const bytecode = new Uint8Array([
        0x4C, 0x41, 0x56, 18, 0, 0x80, 0, 0, 0x10, 0, 0, 0, 0, 0, 0, 0,
        // fread(size=1, count=1, buf=0x3000, fp=fp) -> pops 4 args
        Op.PUSH_B, 1, Op.PUSH_B, 1, Op.PUSH_D, 0x00, 0x30, 0x00, 0x00, Op.PUSH_W, fp & 0xFF, (fp >> 8) & 0xFF, SystemOp.fread, Op.POP,
        Op.EXIT
    ]);

    vm.load(bytecode);
    console.log("Running fread leak test...");
    await vm.run();

    console.log("ESP after fread:", vm.esp);
    if (vm.esp !== 0) {
        console.error("FAIL: Stack leaked! ESP =", vm.esp);
    } else {
        console.log("PASS: No stack leak in fread.");
    }
}

async function testGeLe() {
    const vm = new LavaXVM();
    // Corrected spec: GE (0x32): 5 >= 3 (1), 3 >= 5 (0)
    // Corrected spec: LE (0x31): 3 <= 5 (1), 5 <= 3 (0)
    const bytecode = new Uint8Array([
        0x4C, 0x41, 0x56, 18, 0, 0x80, 0, 0, 0x10, 0, 0, 0, 0, 0, 0, 0,
        Op.PUSH_B, 5, Op.PUSH_B, 3, Op.GE, // stk[0] = 1
        Op.PUSH_B, 3, Op.PUSH_B, 5, Op.GE, // stk[1] = 0
        Op.PUSH_B, 3, Op.PUSH_B, 5, Op.LE, // stk[2] = 1
        Op.PUSH_B, 5, Op.PUSH_B, 3, Op.LE, // stk[3] = 0
        Op.EXIT
    ]);
    vm.load(bytecode);
    console.log("Running GE/LE test...");
    await vm.run();

    console.log("Stack results (top to bottom):", vm.stk[3], vm.stk[2], vm.stk[1], vm.stk[0]);
    // stk: [1, 0, 1, 0]
    if (vm.stk[3] === 0 && vm.stk[2] === 1 && vm.stk[1] === 0 && vm.stk[0] === 1) {
        console.log("PASS: GE/LE logic is correct.");
    } else {
        console.error("FAIL: GE/LE logic is WRONG!");
    }
}

async function testOperandSizes() {
    const vm = new LavaXVM();
    // Test LEA_ABS (0x19) - restore to 4 bytes
    const bytecode = new Uint8Array([
        0x4C, 0x41, 0x56, 18, 0, 0x80, 0, 0, 0x10, 0, 0, 0, 0, 0, 0, 0,
        Op.LEA_ABS, 0x00, 0x20, 0x00, 0x00, // LEA_ABS 0x2000 (4 bytes)
        Op.EXIT
    ]);
    vm.load(bytecode);
    console.log("Running Operand Size (LEA_ABS) test...");
    await vm.run();

    if (vm.esp === 1 && vm.stk[0] === 0x2000) {
        console.log("PASS: LEA_ABS uses 32-bit operand.");
    } else {
        console.error("FAIL: LEA_ABS operand size/logic wrong. ESP:", vm.esp, "Val:", vm.stk[0]);
    }
}

async function testDemo() {
    const compiler = new LavaXCompiler();
    const assembler = new LavaXAssembler();
    const vm = new LavaXVM();

    const source = `
    void main() {
        int i;
        SetScreen(0);
        for (i = 0; i < 3; i++) {
            printf("%d ", i);
        }
    }
    `;

    console.log("Running Demo test...");
    const asm = compiler.compile(source);
    const bin = assembler.assemble(asm);
    vm.onLog = (msg) => process.stdout.write(msg);
    vm.load(bin);
    await vm.run();
    console.log("\nDemo Finished. ESP:", vm.esp);
    if (vm.esp === 0) {
        console.log("PASS: Demo stack balanced.");
    } else {
        console.error("FAIL: Demo stack NOT balanced!");
    }
}

async function testIncDec() {
    const vm = new LavaXVM();
    // Test i++ and ++i (using global address 0x2000)
    // 0x2000 is initially 5
    vm.memory[0x2000] = 5;

    const bytecode = new Uint8Array([
        0x4C, 0x41, 0x56, 18, 0, 0x80, 0, 0, 0x10, 0, 0, 0, 0, 0, 0, 0,
        // ++(*0x2000) -> handle 0x12000 (char *)
        Op.PUSH_D, 0x00, 0x20, 0x00, 0x00, Op.PUSH_D, 0x00, 0x01, 0x00, 0x00, Op.OR, // handle 0x12000
        Op.INC_PRE, // val=6, mem[0x2000]=6, stk=[6]
        Op.INC_POST, // val=6, mem[0x2000]=7, stk=[6, 6]
        Op.EXIT
    ]);
    vm.load(bytecode);
    console.log("Running INC test...");
    await vm.run();

    console.log("Mem[0x2000]:", vm.memory[0x2000], "Stack:", vm.stk[0], vm.stk[1]);
    if (vm.memory[0x2000] === 7 && vm.stk[0] === 6 && vm.stk[1] === 6) {
        console.log("PASS: INC_PRE/POST works.");
    } else {
        console.error("FAIL: INC logic wrong!");
    }
}

async function runTests() {
    try {
        await testFreadLeak();
        await testGeLe();
        await testOperandSizes();
        await testIncDec();
        // await testDemo(); // Skip if bun permissions are still an issue
    } catch (e) {
        console.error(e);
    }
}

runTests();
