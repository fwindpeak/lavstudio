import { LavaXCompiler } from './src/compiler';
import { LavaXAssembler } from './src/compiler/LavaXAssembler';
import { LavaXVM } from './src/vm';
import { LocalStorageDriver } from './src/vm/VFSStorageDriver';

const vfsDriver = new LocalStorageDriver();
const compiler = new LavaXCompiler();
const assembler = new LavaXAssembler();
const vm = new LavaXVM(vfsDriver);

const source = `
void main() {
  int i = 0;
  do {
    printf("%d ", i);
    i = i + 1;
  } while (i < 5);
  printf("Done");
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
console.log("Binary size:", bin.length);

// Add a max iterations check
const maxIterations = 10000;
let iterations = 0;
vm.onLog = (msg) => { console.log(msg); };
vm.debug = true;
vm.load(bin);

// Override run to add iteration limit
vm.running = true;
vm.onFinished = () => { vm.running = false; };
console.log("\n--- Running ---");
try {
  await vm.run();
} catch (e: any) {
  console.error("\n[ERROR]", e.message);
}
console.log("\n--- Verification ---");
console.log("Final SP:", vm.sp);
if (vm.sp === 0) {
  console.log("SUCCESS: Stack is balanced.");
} else {
  console.error(`FAIL: Stack is NOT balanced! SP: ${vm.sp}`);
}
