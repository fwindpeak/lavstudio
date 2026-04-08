import { LavaXCompiler } from '../../src/compiler';
import { LavaXAssembler } from '../../src/compiler/LavaXAssembler';
import { LavaXVM } from '../../src/vm';
import { LocalStorageDriver } from '../../src/vm/VFSStorageDriver';

const vfsDriver = new LocalStorageDriver();
const compiler = new LavaXCompiler();
const assembler = new LavaXAssembler();
const vm = new LavaXVM(vfsDriver);

// Simpler test - just 2 iterations
const source = `
void main() {
  int i = 0;
  do {
    printf("%d ", i);
    i = i + 1;
  } while (i < 2);
  printf("Done");
}
`;

console.log("=== Testing do-while loop (2 iterations) ===\n");

const asm = compiler.compile(source);
console.log("ASM:\n" + asm);

const bin = assembler.assemble(asm);
console.log("Binary size:", bin.length);

let output = "";
vm.onLog = (msg) => { 
  output += msg + "\n"; 
  console.log(msg);
};
vm.debug = true;
vm.load(bin);

// Execute manually using stepSync
let iterCount = 0;
const maxIter = 200;

// Access private stepSync
(vm as any).running = true;
while ((vm as any).running && iterCount < maxIter) {
  (vm as any).stepSync();
  iterCount++;
}

console.log("\n--- Info ---");
console.log("Iterations:", iterCount);
console.log("PC:", vm.pc.toString(16));
console.log("SP:", vm.sp);
console.log("Running:", (vm as any).running);
