
import { LavaXCompiler } from '../src/compiler';
import { LavaXAssembler } from '../src/compiler/LavaXAssembler';
import { LavaXVM } from '../src/vm';

async function main() {
    const compiler = new LavaXCompiler();
    const assembler = new LavaXAssembler();
    const vm = new LavaXVM();

    const source = `
    void main() {
        int i;
        SetScreen(0);
        for (i = 0; i < 3; i++) {
            printf("%d ", i);
        }
    }
    `;

    console.log("Compiling...");
    const asm = compiler.compile(source);
    console.log("Assembling...");
    const bin = assembler.assemble(asm);
    console.log("Running...");
    vm.onLog = (msg) => process.stdout.write(msg);
    vm.load(bin);
    await vm.run();
    console.log("\nFinished. ESP:", vm.esp);
}

main().catch(console.error);
