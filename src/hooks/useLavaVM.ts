
import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { LavaXVM } from '../vm';
import { LavaXCompiler } from '../compiler';
import { LavaXAssembler } from '../compiler/LavaXAssembler';

export function useLavaVM(onLog: (msg: string) => void) {
    const [running, setRunning] = useState(false);
    const [logs, setLogs] = useState<string[]>([]);
    const [screen, setScreen] = useState<ImageData | null>(null);

    const vm = useMemo(() => new LavaXVM(), []);
    const compiler = useMemo(() => new LavaXCompiler(), []);
    const assembler = useMemo(() => new LavaXAssembler(), []);

    const log = useCallback((msg: string) => {
        setLogs(prev => [...prev.slice(-99), msg]);
        if (msg.includes('Error') || msg.includes('FATAL') || msg.includes('Warning')) {
            console.error(msg);
        } else {
            console.log(msg);
        }
        onLog(msg);
    }, [onLog]);

    useEffect(() => {
        vm.onLog = log;
        vm.onUpdateScreen = setScreen;
        vm.onFinished = () => setRunning(false);

        // Initial fonts fetch could be handled here or passed in
        fetch('/fonts.dat')
            .then(r => r.arrayBuffer())
            .then(buf => vm.setInternalFontData(new Uint8Array(buf)))
            .catch(e => log("Error loading fonts: " + e.message));
    }, [vm, log]);

    const compile = useCallback((code: string) => {
        log("Compiling...");
        const asm = compiler.compile(code);
        if (asm.startsWith('ERROR')) {
            log(asm);
            return { asm, bin: null };
        }
        log("Assembling...");
        try {
            const bin = assembler.assemble(asm);
            log(`Success! Binary size: ${bin.length} bytes`);
            return { asm, bin };
        } catch (e: any) {
            log("Assembly Error: " + e.message);
            return { asm, bin: null };
        }
    }, [compiler, assembler, log]);

    const run = useCallback(async (bin: Uint8Array) => {
        setRunning(true);
        vm.load(bin);
        await vm.run();
    }, [vm]);

    const stop = useCallback(() => {
        vm.stop();
        setRunning(false);
    }, [vm]);

    const pushKey = useCallback((code: number) => {
        vm.pushKey(code);
    }, [vm]);

    const releaseKey = useCallback((code: number) => {
        vm.releaseKey(code);
    }, [vm]);

    const clearLogs = useCallback(() => {
        setLogs([]);
    }, []);

    return {
        running,
        logs,
        screen,
        compile,
        run,
        stop,
        pushKey,
        releaseKey,
        vm,
        compiler,
        assembler,
        setLogs,
        clearLogs
    };
}
