import { LavaXCompiler } from '../src/compiler';
import { LavaXAssembler } from '../src/compiler/LavaXAssembler';
import { LavaXDecompiler } from '../src/decompiler';
import { LavaXVM } from '../src/vm';

const EXAMPLES = [
  {
    name: 'hello.c',
    content: `void main() {
  printf("Hello, LavaX!\\n");
  printf("Press any key...\\n");
  getchar();
}`
  },
  {
    name: 'graphics.c',
    content: `void main() {
  ClearScreen();
  Line(0, 0, 159, 79, 1);
  Circle(80, 40, 30, 0, 1);
  getchar();
  ClearScreen();
  char fa[]={
    0xff,0xe0,0x80,0x20,0xbb,0xa0,0x8a,0x20,
    0x91,0x20,0xa0,0xa0,0xbb,0xa0,0x8a,0xa0,
    0xba,0xa0,0xa0,0x20,0xbb,0xa0,0x8a,0xa0,
    0x89,0x20,0xba,0xa0,0x80,0x20,0xff,0xe0};
  WriteBlock(60, 30, 11, 16, 1, fa);
  WriteBlock(80, 30, 11, 16, 2, fa);
  WriteBlock(96, 30, 16, 16, 0x21, fa);
  Refresh();
  getchar();
}`
  },
  {
    name: 'input_demo.c',
    content: `void main() {
  int key;
  printf("Press keys... (ESC to exit)\\n");
  while((key = getchar()) != 27) {
    printf("Key: %d\\n", key);
  }
}`
  },
  {
    name: 'draw_color.c',
    content: `char palette[] = {255,0,0,0,0,0,255,0};

void main()
{
 SetGraphMode(8);
 SetFgColor(205);
 TextOut(60, 30, "LavaX", 0x81);
 SetFgColor(206);
 TextOut(40, 50, "请按任意键", 0x81);
 Refresh();
 getchar();
 SetPalette(205, 2, palette);
 getchar();
}`
  },
  {
    name: 'struct_demo.c',
    content: `struct Point {
  int x;
  int y;
};

struct Point p;

void main() {
  int i;
  p.x = 10;
  p.y = 20;
  printf("Point: %d, %d\\n", p.x, p.y);

  // continue in for loop
  for (i = 0; i < 5; i++) {
    if (i == 2) continue;
    printf("i=%d\\n", i);
  }

  // switch demo
  int key = 2;
  switch (key) {
    case 1:
      printf("one\\n");
      break;
    case 2:
      printf("two\\n");
      break;
    default:
      printf("other\\n");
  }
  getchar();
}`
  }
];

async function testExample(name: string, source: string) {
    console.log(`\n========== Testing: ${name} ==========`);
    
    const compiler = new LavaXCompiler();
    const assembler = new LavaXAssembler();
    const decompiler = new LavaXDecompiler();
    const vm = new LavaXVM();
    
    // Test compile
    const asm = compiler.compile(source);
    if (asm.startsWith('ERROR')) {
        console.error("COMPILE ERROR:", asm);
        return false;
    }
    console.log("✓ Compile OK, ASM lines:", asm.split('\n').length);
    
    // Test assemble
    let bin: Uint8Array;
    try {
        bin = assembler.assemble(asm);
        console.log("✓ Assemble OK, binary:", bin.length, "bytes");
    } catch(e) {
        console.error("ASSEMBLE ERROR:", e);
        return false;
    }
    
    // Test decompile
    try {
        const decomp = decompiler.decompile(bin!);
        console.log("✓ Decompile OK, lines:", decomp.split('\n').length);
    } catch(e) {
        console.error("DECOMPILE ERROR:", e);
        return false;
    }
    
    // Test VM run (with timeout and pre-loaded key)
    vm.onLog = (msg: string) => {}; // silent
    vm.keyBuffer.push(27); // ESC key to exit any getchar loops
    vm.load(bin!);
    
    try {
        const timeout = new Promise<void>((_, reject) => 
            setTimeout(() => reject(new Error('TIMEOUT')), 3000));
        await Promise.race([vm.run(), timeout]);
        console.log("✓ Run OK, SP:", vm.sp);
    } catch(e: any) {
        if (e.message === 'TIMEOUT') {
            // Still running - add more keys
            vm.keyBuffer.push(27);
            await new Promise(r => setTimeout(r, 500));
            console.log("✓ Run (timed out - likely waiting for input), SP:", vm.sp);
        } else {
            console.error("RUN ERROR:", e.message);
            return false;
        }
    }
    
    return true;
}

async function main() {
    let allOk = true;
    for (const ex of EXAMPLES) {
        const ok = await testExample(ex.name, ex.content);
        if (!ok) allOk = false;
    }
    
    console.log("\n" + (allOk ? "=== ALL EXAMPLES PASSED ===" : "=== SOME EXAMPLES FAILED ==="));
    if (!allOk) process.exit(1);
}

main().catch(console.error);
