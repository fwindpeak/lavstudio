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
    printf("a=%d\\n", a);
    printf("*p=%d\\n", *p);
  }
  `;

  console.log("=== Testing pointer dereference ===\n");
  const asm = compiler.compile(source);
  if (asm.startsWith('ERROR')) {
    console.error(asm);
    process.exit(1);
  }
  console.log("ASM:\n" + asm);

  const bin = assembler.assemble(asm);
  vm.load(bin);
  vm.onLog = (msg) => console.log(msg);
  vm.debug = true;

  // After loading, check memory
  console.log("\n=== Memory state before run ===");
  console.log("a at 0x2005:", vm.memory[0x2005], vm.memory[0x2006], vm.memory[0x2007], vm.memory[0x2008]);
  // Read as int32
  const view = new DataView(vm.memory.buffer);
  console.log("a at 0x2005 (int32):", view.getInt32(0x2005, true));
  console.log("p at 0x2009 (int32):", view.getInt32(0x2009, true));

  await vm.run();

  console.log("\n=== Memory state after run ===");
  console.log("a at 0x2005 (int32):", view.getInt32(0x2005, true));
  console.log("p at 0x2009 (int32):", view.getInt32(0x2009, true));
}

main().catch(console.error);
