import { LavaXAssembler } from '../../src/compiler/LavaXAssembler';
import { GraphicsEngine } from '../../src/vm/GraphicsEngine';
import { TEXT_OFFSET } from '../../src/types';
import iconv from 'iconv-lite';

function assert(condition: boolean, message: string) {
    if (!condition) {
        throw new Error(message);
    }
}

function testAssemblerHeader() {
    const assembler = new LavaXAssembler();
    const lav = assembler.assemble('SPACE 8192\nEXIT');

    assert(lav[8] === 0 && lav[9] === 0 && lav[10] === 0, 'header bytes 0x08-0x0A must stay zero for official compatibility');
    console.log('PASS: assembler keeps official-compatible header bytes at 0x08-0x0A.');
}

function testWriteBlockMirrorAndInvertModes() {
    const memory = new Uint8Array(1024 * 1024);
    const graphics = new GraphicsEngine(memory, () => { });

    memory[0x2000] = 0b10000000;
    graphics.WriteBlock(0, 0, 8, 1, 0x41, 0x2000);
    assert(memory[0] === 0b10000000, 'plain WriteBlock copy should preserve source bit order');

    memory.fill(0);
    memory[0x2000] = 0b10000000;
    graphics.WriteBlock(0, 0, 8, 1, 0x61, 0x2000);
    assert(memory[0] === 0b00000001, 'type bit 0x20 should mirror monochrome WriteBlock data');

    memory.fill(0);
    memory[0x2000] = 0b10000000;
    graphics.WriteBlock(0, 0, 8, 1, 0x49, 0x2000);
    assert(memory[0] === 0b01111111, 'command bit 0x08 should invert the copied source pattern');

    console.log('PASS: WriteBlock mirrors and inverts source data using official flag semantics.');
}

function testWideCharWrapInTextBuffer() {
    const memory = new Uint8Array(1024 * 1024);
    const graphics = new GraphicsEngine(memory, () => { });
    const text = 'A'.repeat(25) + '中';
    const gbk = iconv.encode('中', 'gbk');

    graphics.writeString(text, 1);

    assert(memory[TEXT_OFFSET + 25] === 0x20, 'wide characters must not start in the last remaining cell of a line');
    assert(memory[TEXT_OFFSET + 26] === gbk[0], 'wide character lead byte should move to the next line');
    assert(memory[TEXT_OFFSET + 27] === gbk[1], 'wide character trail byte should follow on the next line');

    console.log('PASS: GBK wide characters wrap to the next line without splitting at line end.');
}

function run() {
    testAssemblerHeader();
    testWriteBlockMirrorAndInvertModes();
    testWideCharWrapInTextBuffer();
}

run();