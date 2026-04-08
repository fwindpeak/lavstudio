import { LavaXCompiler } from '../src/compiler';
import { LavaXAssembler } from '../src/compiler/LavaXAssembler';
import { LavaXVM } from '../src/vm';

async function main() {
  const compiler = new LavaXCompiler();
  const assembler = new LavaXAssembler();
  const vm = new LavaXVM();

  // Test do-while loop
  const source = `
  void main() {
    int i = 0;
    do {
      printf("%d ", i);
      i = i + 1;
    } while (i < 5);
    printf("\\nDone\\n");
  }
  `;

  console.log("=== Testing do-while loop ===\n");
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
  console.log("Bytecode:", Array.from(bin.slice(16)).map(b => "0x" + b.toString(16).padStart(2, "0")).join(", "));

  console.log("\n--- Running ---");
  let output = "";
  vm.onLog = (msg) => { output += msg; process.stdout.write(msg); };
  vm.debug = false;
  vm.load(bin);
  await vm.run();

  console.log("\n--- Verification ---");
  console.log("Final SP:", vm.sp);
  if (vm.sp === 0) {
    console.log("SUCCESS: Stack is balanced.");
  } else {
    console.error(`FAIL: Stack is NOT balanced! SP: ${vm.sp}`);
  }
}

main().catch(console.error);
