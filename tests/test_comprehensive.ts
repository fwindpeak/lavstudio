import { LavaXCompiler } from '../src/compiler';
import { LavaXAssembler } from '../src/compiler/LavaXAssembler';
import { LavaXVM } from '../src/vm';
import { LocalStorageDriver } from '../src/vm/VFSStorageDriver';

const compiler = new LavaXCompiler();
const assembler = new LavaXAssembler();

async function runTest(name: string, source: string, expected: string): Promise<boolean> {
  const vfsDriver = new LocalStorageDriver();
  const vm = new LavaXVM(vfsDriver);

  const asm = compiler.compile(source);
  if (asm.startsWith('ERROR')) {
    console.log(`[FAIL] ${name}: Compile error: ${asm}`);
    return false;
  }

  const bin = assembler.assemble(asm);
  let output = "";
  // debug=true so printf goes through onLog; filter out debug/system messages
  vm.onLog = (msg) => {
    if (!msg.startsWith('[') && !msg.startsWith('System:') && !msg.startsWith('State ') && !msg.startsWith('Stack ')) {
      output += msg;
    }
  };
  vm.debug = true;
  vm.load(bin);

  try {
    await vm.run();
  } catch (e: any) {
    console.log(`[FAIL] ${name}: Runtime error: ${e.message}`);
    return false;
  }

  const pass = output.trim() === expected.trim();
  if (pass) {
    console.log(`[PASS] ${name}: "${output.trim()}"`);
  } else {
    console.log(`[FAIL] ${name}:`);
    console.log(`  Expected: "${expected.trim()}"`);
    console.log(`  Got:      "${output.trim()}"`);
  }
  return pass;
}

async function main() {
  let passed = 0;
  let failed = 0;

  const run = async (name: string, src: string, expected: string) => {
    const ok = await runTest(name, src, expected);
    if (ok) passed++; else failed++;
  };

  console.log("=== LavaX Comprehensive Tests ===\n");

  // ===== switch-case tests =====
  console.log("--- Switch-Case Tests ---");

  await run("switch case 1", `
    void main() {
      int x = 1;
      switch(x) {
        case 1: printf("one\\n"); break;
        case 2: printf("two\\n"); break;
        case 3: printf("three\\n"); break;
        default: printf("other\\n");
      }
      printf("done\\n");
    }
  `, "one\ndone");

  await run("switch case 2", `
    void main() {
      int x = 2;
      switch(x) {
        case 1: printf("one\\n"); break;
        case 2: printf("two\\n"); break;
        case 3: printf("three\\n"); break;
        default: printf("other\\n");
      }
      printf("done\\n");
    }
  `, "two\ndone");

  await run("switch case 3", `
    void main() {
      int x = 3;
      switch(x) {
        case 1: printf("one\\n"); break;
        case 2: printf("two\\n"); break;
        case 3: printf("three\\n"); break;
        default: printf("other\\n");
      }
      printf("done\\n");
    }
  `, "three\ndone");

  await run("switch default", `
    void main() {
      int x = 99;
      switch(x) {
        case 1: printf("one\\n"); break;
        case 2: printf("two\\n"); break;
        default: printf("other\\n");
      }
      printf("done\\n");
    }
  `, "other\ndone");

  await run("switch no default", `
    void main() {
      int x = 99;
      switch(x) {
        case 1: printf("one\\n"); break;
        case 2: printf("two\\n"); break;
      }
      printf("done\\n");
    }
  `, "done");

  // ===== do-while tests =====
  console.log("\n--- Do-While Tests ---");

  await run("do-while basic", `
    void main() {
      int i = 0;
      do {
        printf("%d\\n", i);
        i = i + 1;
      } while (i < 5);
    }
  `, "0\n1\n2\n3\n4");

  await run("do-while executes at least once", `
    void main() {
      int i = 10;
      do {
        printf("hello\\n");
        i = i + 1;
      } while (i < 5);
    }
  `, "hello");

  // ===== pointer tests =====
  console.log("\n--- Pointer Tests ---");

  await run("pointer basic", `
    void main() {
      int a = 42;
      int* p = &a;
      printf("%d\\n", *p);
    }
  `, "42");

  await run("pointer write", `
    void main() {
      int a = 10;
      int* p = &a;
      *p = 99;
      printf("%d\\n", a);
    }
  `, "99");

  // ===== array tests =====
  console.log("\n--- Array Tests ---");

  await run("array read/write", `
    void main() {
      int arr[3];
      arr[0] = 10;
      arr[1] = 20;
      arr[2] = 30;
      printf("%d %d %d\\n", arr[0], arr[1], arr[2]);
    }
  `, "10 20 30");

  await run("array loop", `
    void main() {
      int arr[5];
      int i;
      for (i = 0; i < 5; i = i + 1) {
        arr[i] = i * 10;
      }
      for (i = 0; i < 5; i = i + 1) {
        printf("%d\\n", arr[i]);
      }
    }
  `, "0\n10\n20\n30\n40");

  // ===== while/for/if tests =====
  console.log("\n--- Control Flow Tests ---");

  await run("while loop", `
    void main() {
      int i = 0;
      while (i < 3) {
        printf("%d\\n", i);
        i = i + 1;
      }
    }
  `, "0\n1\n2");

  await run("for loop", `
    void main() {
      int i;
      for (i = 0; i < 3; i = i + 1) {
        printf("%d\\n", i);
      }
    }
  `, "0\n1\n2");

  await run("if-else", `
    void main() {
      int x = 5;
      if (x > 3) {
        printf("big\\n");
      } else {
        printf("small\\n");
      }
    }
  `, "big");

  // ===== arithmetic tests =====
  console.log("\n--- Arithmetic Tests ---");

  await run("arithmetic", `
    void main() {
      int a = 10;
      int b = 3;
      printf("%d\\n", a + b);
      printf("%d\\n", a - b);
      printf("%d\\n", a * b);
      printf("%d\\n", a / b);
      printf("%d\\n", a % b);
    }
  `, "13\n7\n30\n3\n1");

  await run("compound assignment", `
    void main() {
      int x = 10;
      x += 5;
      printf("%d\\n", x);
      x -= 3;
      printf("%d\\n", x);
      x *= 2;
      printf("%d\\n", x);
      x /= 4;
      printf("%d\\n", x);
    }
  `, "15\n12\n24\n6");

  // ===== Summary =====
  console.log(`\n=== Results: ${passed} passed, ${failed} failed ===`);
  if (failed === 0) {
    console.log("ALL TESTS PASSED! ✓");
  } else {
    console.log(`${failed} test(s) FAILED.`);
    process.exit(1);
  }
}

main().catch(console.error);
