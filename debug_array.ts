import { LavaXCompiler } from './src/compiler';
import { LavaXAssembler } from './src/compiler/LavaXAssembler';
import { LavaXVM } from './src/vm';
import { LocalStorageDriver } from './src/vm/VFSStorageDriver';

async function main() {
  const vfsDriver = new LocalStorageDriver();
  const compiler = new LavaXCompiler();
  const assembler = new LavaXAssembler();
  const vm = new LavaXVM(vfsDriver);

  // Test array access
  const source = `
  void main() {
    int arr[5];
    arr[0] = 10;
    arr[1] = 20;
    arr[2] = 30;
    printf("%d\\n", arr[0]);
    printf("%d\\n", arr[1]);
    printf("%d\\n", arr[2]);
  }
  `;

  console.log("=== Testing array access ===\n");

  const asm = compiler.compile(source);
  if (asm.startsWith('ERROR')) {
    console.error(asm);
    process.exit(1);
  }
  console.log("ASM:\n" + asm);

  const bin = assembler.assemble(asm);
  console.log("Binary size:", bin.length);

  vm.onLog = (msg) => { console.log(msg); };
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
