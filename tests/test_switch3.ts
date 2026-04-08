import { LavaXCompiler } from '../src/compiler';
import { LavaXAssembler } from '../src/compiler/LavaXAssembler';
import { LavaXVM } from '../src/vm';
import { LocalStorageDriver } from '../src/vm/VFSStorageDriver';

async function main() {
  // Create a localStorage driver to avoid IndexedDB errors in Node.js
  const vfsDriver = new LocalStorageDriver();
  const compiler = new LavaXCompiler();
  const assembler = new LavaXAssembler();
  const vm = new LavaXVM(vfsDriver);

  // Test switch-case
  const source = `
  void main() {
    int x = 2;
    switch(x) {
      case 1:
        printf("one\\n");
        break;
      case 2:
        printf("two\\n");
        break;
      case 3:
        printf("three\\n");
        break;
      default:
        printf("other\\n");
    }
    printf("done\\n");
  }
  `;

  console.log("=== Testing switch-case ===\n");
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
  let output = "";
  vm.onLog = (msg) => { output += msg; console.log("[LOG]", msg); };
  vm.debug = true;
  vm.load(bin);
  try {
    await vm.run();
  } catch (e: any) {
    console.error("\n[ERROR]", e.message, e.stack);
  }

  console.log("\n--- Verification ---");
  console.log("Final SP:", vm.sp);
  console.log("Output:", output);
}

main().catch(console.error);
