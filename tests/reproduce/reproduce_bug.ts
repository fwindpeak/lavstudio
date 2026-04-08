
import { LavaXCompiler } from '../../src/compiler';

const compiler = new LavaXCompiler();
const source = `
void main() {
  SetScreen(0);
  Line(0, 0, 159, 79, 1);
  Circle(80, 40, 30, 0, 1);
  //Refresh();

  TextOut(20,20,"显示中文测试"); // Should fail but passes
  getchar();

  Refresh();
  getchar();
}
`;

console.log("Compiling...");
const result = compiler.compile(source);
if (typeof result === "string" && result.startsWith("ERROR:")) {
  console.log("Compilation failed as expected (FIXED):");
  console.log(result);
} else {
  console.error("Compilation succeeded (STILL BUGGY):");
  console.log(result.split('\n').filter(line => line.includes('TextOut')).join('\n'));
}
