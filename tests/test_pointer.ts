import { LavaXCompiler } from '../src/compiler';
import { LavaXAssembler } from '../src/compiler/LavaXAssembler';
import { LavaXVM } from '../src/vm';
import { LocalStorageDriver } from '../src/vm/VFSStorageDriver';

async function main() {
  const vfsDriver = new LocalStorageDriver();
  const compiler = new LavaXCompiler();
  const assembler = new LavaXAssembler();
  const vm = new LavaXVM(vfsDriver);

  // Test pointer dereference
  const source = `
  void main() {
    int a = 42;
    int* p = &a;
    int b = *p;
    printf("%d\\n", b);
  }
  `;

  console.log("=== Testing pointer dereference ===\n");
  console.log("Source:\n" + source);

  console.log("\n--- Compiling ---");
  const asm = compiler.compile(source);
  if (asm.startsWith('ERROR')) {
    console.error(asm);
    process.exit(1);
  }
  console.log("ASM:\n" + asm);

  console.log("\n--- Assembling ---");
  const bin = assembler.assemble(asm);
  console.log(`Binary size: ${bin.length} bytes`);

  console.log("\n--- Running ---");
  vm.onLog = (msg) => { console.log("[LOG]", msg); };
  vm.debug = true;
  vm.load(bin);
  try {
    await vm.run();
  } catch (e: any) {
    console.error("\n[ERROR]", e.message);
  }

  console.log("\n--- Verification ---");
  console.log("Final SP:", vm.sp);
}

main().catch(console.error);
