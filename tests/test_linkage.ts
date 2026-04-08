
import { LavaXCompiler } from '../src/compiler';
import { LavaXAssembler } from '../src/compiler/LavaXAssembler';
import { LavaXVM } from '../src/vm';

async function testRecursion() {
    const source = `
    int factorial(int n) {
        if (n <= 1) return 1;
        return n * factorial(n - 1);
    }
    void main() {
        int res;
        res = factorial(5);
    }
    `;

    const compiler = new LavaXCompiler();
    const assembler = new LavaXAssembler();

    console.log("Compiling...");
    const asm = compiler.compile(source);
    if (asm.startsWith('ERROR:')) {
        console.error(asm);
        return;
    }
    console.log("Assembling...");
    const bin = assembler.assemble(asm);

    const vm = new LavaXVM();
    vm.debug = true;
    vm.onLog = (msg) => {
        if (msg.includes('EBP:')) console.log(msg);
        else if (msg.includes('FATAL')) console.error(msg);
    };

    console.log("Starting VM...");
    vm.load(bin);
    await vm.run();
    console.log("Finished. Final SP:", vm.sp);
}

testRecursion().catch(e => console.error(e));
