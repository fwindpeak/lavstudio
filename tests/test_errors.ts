import { LavaXVM } from '../src/vm';
import { Op, SystemOp } from '../src/types';

class MockStorageDriver {
    name = 'mock';
    ready = Promise.resolve();
    async getAll() { return new Map(); }
    async persist() { }
    async remove() { }
}

async function runTest(name: string, bytecode: Uint8Array) {
    console.log(`\n--- Testing: ${name} ---`);
    const vm = new LavaXVM(new MockStorageDriver() as any);
    vm.onLog = (msg) => console.log(`[VM Log] ${msg}`);
    vm.load(bytecode);
    try {
        await vm.run();
        console.log(`[Test] ${name} finished without throwing (might be expected for some cases)`);
    } catch (e: any) {
        console.log(`[Test] ${name} caught expected error: ${e.message}`);
    }
}

async function main() {
    // 1. Stack Underflow Test
    const underflowBytecode = new Uint8Array([
        0x4C, 0x41, 0x56, 18, 0, 0x00, 0, 0, 0x10, 0, 0, 0, 0, 0, 0, 0,
        Op.POP, // Should underflow
        Op.EXIT
    ]);
    await runTest("Stack Underflow", underflowBytecode);

    // 2. Unknown Opcode Test
    const unknownOpBytecode = new Uint8Array([
        0x4C, 0x41, 0x56, 18, 0, 0x00, 0, 0, 0x10, 0, 0, 0, 0, 0, 0, 0,
        0xFE, // Unknown opcode
        Op.EXIT
    ]);
    await runTest("Unknown Opcode", unknownOpBytecode);

    // 3. Unhandled Syscall Test
    const unknownSyscallBytecode = new Uint8Array([
        0x4C, 0x41, 0x56, 18, 0, 0x00, 0, 0, 0x10, 0, 0, 0, 0, 0, 0, 0,
        0xDF, // RefreshIcon (implemented but let's test a higher range or just check warning)
        0xEE, // Should be unhandled if it was 0x80-0xDF, let's use 0xD0 or similar if unmapped
        Op.EXIT
    ]);
    // Note: My loop handled 0x80-0xDF. Let's try 0xFF if it's considered a syscall? 
    // Actually our loop is 0x80-0xDF. Let's try 0xDC (close_uart) if it hits default in handler.
    const unhandledSyscallBytecode = new Uint8Array([
        0x4C, 0x41, 0x56, 18, 0, 0x00, 0, 0, 0x10, 0, 0, 0, 0, 0, 0, 0,
        0xDC, // close_uart
        Op.EXIT
    ]);
    await runTest("Unhandled Syscall", unhandledSyscallBytecode);

    // 4. Stack Overflow Test
    const overflowBytecode = new Uint8Array([
        0x4C, 0x41, 0x56, 18, 0, 0x00, 0, 0, 0x10, 0, 0, 0, 0, 0, 0, 0,
        // We need many pushes. Let's just do a loop or recursion if possible, 
        // but for a simple bytecode test we can just repeat PUSH_B.
        ...new Array(4097).fill(Op.PUSH_B).flatMap(op => [op, 1]),
        Op.EXIT
    ]);
    await runTest("Stack Overflow", overflowBytecode);
}

main().catch(console.error);
