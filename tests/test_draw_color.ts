import { LavaXCompiler } from '../src/compiler';
import { LavaXAssembler } from '../src/compiler/LavaXAssembler';
import { LavaXVM } from '../src/vm';

const source = `char palette[] = {255,0,0,0,0,0,255,0};

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
}`;

const compiler = new LavaXCompiler();
const asm = compiler.compile(source);
console.log("=== Compiled ASM ===");
console.log(asm);

// Also try to run and see what happens
const assembler = new LavaXAssembler();
const bin = assembler.assemble(asm);

const vm = new LavaXVM();
vm.debug = true;
vm.onLog = (msg) => process.stdout.write(msg);
vm.keyBuffer.push(27); // ESC

vm.load(bin);
vm.run().then(() => {
    console.log("SP:", vm.sp);
}).catch(e => {
    console.error("VM error:", e.message);
});
