import { LavaXCompiler } from './src/compiler';
import { LavaXAssembler } from './src/compiler/LavaXAssembler';
import { LavaXVM } from './src/vm';
import { LocalStorageDriver } from './src/vm/VFSStorageDriver';

// Patch STORE to add debug
const originalVm = require('./src/vm').LavaXVM;

async function main() {
  const vfsDriver = new LocalStorageDriver();
  const compiler = new LavaXCompiler();
  const assembler = new LavaXAssembler();
  const vm = new LavaXVM(vfsDriver);

  const source = `
  void main() {
    int a = 42;
    int* p = &a;
    printf("a=%d\\n", a);
    printf("*p=%d\\n", *p);
  }
  `;

  const asm = compiler.compile(source);
  if (asm.startsWith('ERROR')) {
    console.error(asm);
    process.exit(1);
  }
  console.log("ASM:\n" + asm);

  const bin = assembler.assemble(asm);
  vm.load(bin);

  // Override STORE to debug
  const origStore = (vm as any).ops[0x35];
  (vm as any).ops[0x35] = function() {
    const sp = (vm as any).sp;
    const stk = (vm as any).stk;
    const val = stk[--sp];
    const addrEnc = stk[sp - 1];
    console.log(`[STORE] val=${val} (0x${val.toString(16)}), addrEnc=${addrEnc} (0x${addrEnc.toString(16)})`);
    console.log(`[STORE] type bits: ${(addrEnc & 0x70000).toString(16)}`);
    console.log(`[STORE] resolved addr: ${(addrEnc & 0xFFFF).toString(16)}`);
    // Call original
    const ops = (vm as any).ops;
    ops[0x35] = origStore;
    ops[0x35].call(vm);
    ops[0x35] = function() { console.log("[STORE] - already called"); };
  };

  vm.onLog = (msg) => console.log(msg);
  await vm.run();

  console.log("\n=== Memory ===");
  const view = new DataView(vm.memory.buffer);
  console.log("a at 0x2005:", view.getInt32(0x2005, true));
  console.log("p at 0x2009:", view.getInt32(0x2009, true));
}

main().catch(console.error);
