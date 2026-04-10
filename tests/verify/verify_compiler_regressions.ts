import { LavaXCompiler } from '../../src/compiler';

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

function compile(source: string): string {
  const compiler = new LavaXCompiler();
  const asm = compiler.compile(source);
  assert(!asm.startsWith('ERROR:'), asm);
  return asm;
}

function countMatches(text: string, pattern: RegExp): number {
  return [...text.matchAll(pattern)].length;
}

function verifyLocalCharArrayStringInit() {
  const asm = compile(`
    void main() {
      char name[20] = "Kai";
      char s[128];
      sprintf(s, "hello %s", name);
    }
  `);

  assert(!asm.includes('PUSH_STR "Kai"'), 'local char array initializer still compiled as string pointer');
  assert(asm.includes('PUSH_B 75'), 'missing bytewise init for K');
  assert(asm.includes('PUSH_B 97'), 'missing bytewise init for a');
  assert(asm.includes('PUSH_B 105'), 'missing bytewise init for i');
  assert(asm.includes('PUSH_STR "hello %s"'), 'format string missing from output');
}

function verifyIntArrayStride() {
  const asm = compile(`
    void main() {
      int a[2];
      int x;
      a[1] = 7;
      x = a[1];
    }
  `);

  const strideCount = countMatches(asm, /PUSH_B 2\nMUL/g);
  assert(strideCount >= 2, `expected int array accesses to use 2-byte stride, got ${strideCount}`);
}

function main() {
  verifyLocalCharArrayStringInit();
  verifyIntArrayStride();
  console.log('compiler regression checks passed');
}

main();
