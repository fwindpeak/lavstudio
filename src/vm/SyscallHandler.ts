import iconv from 'iconv-lite';
import { SystemOp, MathOp, MathFrameworkOp, SystemCoreOp, GBUF_OFFSET, TEXT_OFFSET, MEMORY_SIZE, VRAM_OFFSET, GBUF_OFFSET_LVM } from '../types';
import { GraphicsEngine } from './GraphicsEngine';
import { VirtualFileSystem } from './VirtualFileSystem';

export interface ILavaXVM {
    pop(): number;
    push(val: number): void;
    pushFloat(val: number): void;
    popFloat(): number;
    resolveAddress(addr: number): number;
    getStringBytes(handle: number): Uint8Array | null;
    onLog(msg: string): void;
    memory: Uint8Array;
    running: boolean;
    debug: boolean;
    keyBuffer: number[];
    startTime: number;
    vfs: VirtualFileSystem;
    graphics: GraphicsEngine;
    stk: Int32Array;
    sp: number;
    currentKeyDown: number;
    delayUntil: number;
    wakeUp(): void;
}

/**
 * LavaX Syscall Handler (GVM ISA V3.0)
 */
export class SyscallHandler {
    constructor(private vm: ILavaXVM) { }

    public handleSync(op: number): number | null | undefined {
        const vm = this.vm;

        // Async triggers
        if (op === SystemOp.getchar || op === SystemOp.GetWord) {
            if (vm.keyBuffer.length === 0) return undefined;
        }
        if (op === SystemOp.Delay) {
            const now = Date.now();
            if (vm.delayUntil === 0) {
                // Peek the delay duration from stack (it's the top value)
                const duration = vm.stk[vm.sp - 1];
                vm.delayUntil = now + duration;
                setTimeout(() => {
                    vm.wakeUp();
                }, duration);
                return undefined; // Yield
            } else if (now < vm.delayUntil) {
                return undefined; // Still waiting
            } else {
                // Done waiting
                vm.delayUntil = 0;
                vm.pop(); // Actually consume the duration argument
                return null;
            }
        }

        switch (op) {
            case SystemOp.putchar: {
                const char = String.fromCharCode(vm.pop());
                vm.graphics.writeString(char);
                // UpdateLCD(0)
                vm.graphics.repaintFromTextMemory(0);
                vm.graphics.flushScreen();
                return null;
            }

            case SystemOp.printf: {
                const count = vm.pop();
                const startIdx = vm.sp - count;
                const fmtHandle = vm.stk[startIdx];
                const formatBytes = vm.getStringBytes(fmtHandle);
                if (formatBytes) {
                    const str = this.formatVariadicString(formatBytes, count - 1, startIdx + 1);
                    if (vm.debug) vm.onLog(str);
                    vm.graphics.writeString(str);
                    // UpdateLCD(0)
                    vm.graphics.repaintFromTextMemory(0);
                    vm.graphics.flushScreen();
                }
                vm.sp -= count;
                return null;
            }

            case SystemOp.sprintf: {
                const count = vm.pop();
                // Stack layout: [buf, fmt, arg1, arg2...]
                const bufIdx = vm.sp - count;
                const fmtIdx = vm.sp - count + 1;
                const argsIdx = vm.sp - count + 2;

                const destAddr = vm.resolveAddress(vm.stk[bufIdx]);
                const fmtHandle = vm.stk[fmtIdx];
                const formatBytes = vm.getStringBytes(fmtHandle);

                if (formatBytes) {
                    const str = this.formatVariadicString(formatBytes, 0, argsIdx);
                    const bytes = iconv.encode(str, 'gbk');
                    vm.memory.set(bytes, destAddr);
                    vm.memory[destAddr + bytes.length] = 0;
                }
                vm.sp -= count; // pop all args (buf, fmt, varargs)
                return null;
            }

            case SystemOp.strcpy: {
                const srcAddr = vm.pop();
                const destAddr = vm.resolveAddress(vm.pop());
                const bytes = vm.getStringBytes(srcAddr);
                if (bytes) {
                    vm.memory.set(bytes, destAddr);
                    vm.memory[destAddr + bytes.length] = 0;
                }
                return null;
            }

            case SystemOp.strlen: {
                const bytes = vm.getStringBytes(vm.pop());
                return bytes ? bytes.length : 0;
            }

            case SystemOp.SetScreen: {
                const mode = vm.pop();
                vm.graphics.currentFontSize = (mode === 0) ? 16 : 12;
                // Clear all display areas: GBUF, VRAM, text buffer
                // vm.graphics.clearGraphBuffer();
                // vm.graphics.clearVRAM();
                vm.graphics.clearTextBuffer();
                vm.graphics.flushScreen();
                return null;
            }

            case SystemOp.UpdateLCD:
                const mask = vm.pop();
                vm.graphics.repaintFromTextMemory(mask);
                vm.graphics.flushScreen();
                return null;

            case SystemOp.WriteBlock: {
                const addr = vm.resolveAddress(vm.pop());
                const mode = vm.pop(), h = vm.pop(), w = vm.pop(), y = vm.pop(), x = vm.pop();
                const copyMode = (mode & 0x07) === 1;

                if (vm.graphics.graphMode === 8) {
                    for (let r = 0; r < h; r++) {
                        for (let c = 0; c < w; c++) {
                            const color = vm.memory[addr + r * w + c];
                            // Rule B: bit 6=1 is VRAM. Flip it for Engine (1=GBUF).
                            vm.graphics.setPixel(x + c, y + r, color, mode ^ 0x40);
                        }
                    }
                } else if (vm.graphics.graphMode === 4) {
                    const bytesPerRow = (w + 1) >> 1;
                    for (let r = 0; r < h; r++) {
                        const rowOffset = addr + r * bytesPerRow;
                        for (let c = 0; c < w; c++) {
                            const byte = vm.memory[rowOffset + (c >> 1)];
                            const color = (c % 2 === 0) ? (byte >> 4) : (byte & 0x0F);
                            // Rule B: bit 6=1 is VRAM.
                            vm.graphics.setPixel(x + c, y + r, color, mode ^ 0x40);
                        }
                    }
                } else {
                    const bytesPerRow = (w + 7) >> 3;
                    for (let r = 0; r < h; r++) {
                        const rowOffset = addr + r * bytesPerRow;
                        for (let c = 0; c < w; c++) {
                            const bit = (vm.memory[rowOffset + (c >> 3)] >> (7 - (c & 7))) & 1;
                            // Rule B: bit 6=1 is VRAM.
                            if (bit) vm.graphics.setPixel(x + c, y + r, 1, mode ^ 0x40);
                            else if (copyMode) vm.graphics.setPixel(x + c, y + r, 0, mode ^ 0x40);
                        }
                    }
                }
                // Flush if drawing to VRAM (bit 6 set)
                if (mode & 0x40) vm.graphics.flushScreen();
                return null;
            }

            case SystemOp.TextOut: {
                const mode = vm.pop(), strAddr = vm.pop(), y = vm.pop(), x = vm.pop();
                const bytes = vm.getStringBytes(strAddr);
                if (bytes) {
                    // Rule B: bit 6=1 is VRAM. Flip it for Engine.
                    vm.graphics.drawText(x, y, bytes, (mode & 0x80) ? 16 : 12, mode ^ 0x40);
                    if (mode & 0x40) vm.graphics.flushScreen();
                }
                return null;
            }

            case SystemOp.Block:
            case SystemOp.Rectangle: {
                const mode = vm.pop(), y1 = vm.pop(), x1 = vm.pop(), y0 = vm.pop(), x0 = vm.pop();
                // Block/Rectangle always draw to GBUF. (0x40 is GBUF in Engine)
                const engineMode = (mode & 0x07) | 0x40;
                if (op === SystemOp.Block) vm.graphics.drawFillBox(x0, y0, x1 - x0 + 1, y1 - y0 + 1, engineMode);
                else vm.graphics.drawBox(x0, y0, x1 - x0 + 1, y1 - y0 + 1, engineMode);
                // Deferred display: Refresh() will show it.
                return null;
            }

            case SystemOp.Refresh:
            case SystemOp.Refresh2: {
                const gbuf = (vm.graphics.graphMode === 1) ? GBUF_OFFSET : GBUF_OFFSET_LVM;
                const size = (vm.graphics.graphMode === 8) ? 12800 : (vm.graphics.graphMode === 4 ? 6400 : 1600);
                vm.memory.copyWithin(VRAM_OFFSET, gbuf, gbuf + size);
                vm.graphics.flushScreen();
                return null;
            }

            case SystemOp.RefreshIcon: {
                // Refresh top icon bar if applicable, for now same as refresh
                vm.graphics.flushScreen();
                return null;
            }

            case SystemOp.Locate: {
                const x = vm.pop(), y = vm.pop();
                vm.graphics.cursorX = x;
                vm.graphics.cursorY = y;
                vm.graphics.setCurrentLine(y);
                return null;
            }

            case SystemOp.Point: {
                const mode = vm.pop(), y = vm.pop(), x = vm.pop();
                // Rule A: bit 6=1 is GBUF. Matches Engine (1=GBUF).
                vm.graphics.setPixel(x, y, 1, mode);
                // Flush if drawing to VRAM (bit 6 NOT set)
                if (!(mode & 0x40)) vm.graphics.flushScreen();
                return null;
            }

            case SystemOp.GetPoint: {
                const y = vm.pop(), x = vm.pop();
                return vm.graphics.getPixel(x, y);
            }

            case SystemOp.Line: {
                const mode = vm.pop(), y1 = vm.pop(), x1 = vm.pop(), y0 = vm.pop(), x0 = vm.pop();
                // Rule A: bit 6=1 is GBUF.
                vm.graphics.drawLine(x0, y0, x1, y1, mode);
                if (!(mode & 0x40)) vm.graphics.flushScreen();
                return null;
            }

            case SystemOp.Box: {
                const mode = vm.pop(), fill = vm.pop(), y1 = vm.pop(), x1 = vm.pop(), y0 = vm.pop(), x0 = vm.pop();
                // Rule A: bit 6=1 is GBUF.
                if (fill) vm.graphics.drawFillBox(x0, y0, x1 - x0 + 1, y1 - y0 + 1, mode);
                else vm.graphics.drawBox(x0, y0, x1 - x0 + 1, y1 - y0 + 1, mode);
                if (!(mode & 0x40)) vm.graphics.flushScreen();
                return null;
            }

            case SystemOp.Circle: {
                const mode = vm.pop(), fill = vm.pop(), r = vm.pop(), y = vm.pop(), x = vm.pop();
                // Rule A: bit 6=1 is GBUF.
                if (fill) vm.graphics.drawFillCircle(x, y, r, mode);
                else vm.graphics.drawCircle(x, y, r, mode);
                if (!(mode & 0x40)) vm.graphics.flushScreen();
                return null;
            }

            case SystemOp.Ellipse: {
                const mode = vm.pop(), fill = vm.pop(), ry = vm.pop(), rx = vm.pop(), y = vm.pop(), x = vm.pop();
                // Rule A: bit 6=1 is GBUF.
                vm.graphics.drawEllipse(x, y, rx, ry, fill !== 0, mode);
                if (!(mode & 0x40)) vm.graphics.flushScreen();
                return null;
            }

            case SystemOp.Beep: {
                // Not supported in headless, but avoid warning
                return null;
            }

            case SystemOp.XDraw: {
                const mode = vm.pop();
                vm.graphics.xDraw(mode);
                return null;
            }

            case SystemOp.GetBlock: {
                const addr = vm.resolveAddress(vm.pop());
                const mode = vm.pop(), h = vm.pop(), w = vm.pop(), y = vm.pop(), x = vm.pop();

                if (vm.graphics.graphMode === 8) {
                    for (let r = 0; r < h; r++) {
                        for (let c = 0; c < w; c++) {
                            const pixel = vm.graphics.getPixel(x + c, y + r, mode);
                            vm.memory[addr + r * w + c] = pixel;
                        }
                    }
                } else if (vm.graphics.graphMode === 4) {
                    const bytesPerRow = (w + 1) >> 1;
                    for (let r = 0; r < h; r++) {
                        const rowOffset = addr + r * bytesPerRow;
                        for (let c = 0; c < w; c++) {
                            const pixel = vm.graphics.getPixel(x + c, y + r, mode) & 0x0F;
                            if (c % 2 === 0) {
                                vm.memory[rowOffset + (c >> 1)] = (vm.memory[rowOffset + (c >> 1)] & 0x0F) | (pixel << 4);
                            } else {
                                vm.memory[rowOffset + (c >> 1)] = (vm.memory[rowOffset + (c >> 1)] & 0xF0) | pixel;
                            }
                        }
                    }
                } else {
                    const bytesPerRow = (w + 7) >> 3;
                    for (let r = 0; r < h; r++) {
                        const rowOffset = addr + r * bytesPerRow;
                        for (let c = 0; c < w; c++) {
                            // Rule A: bit 6=1 is GBUF. Matches Engine.
                            const pixel = vm.graphics.getPixel(x + c, y + r, mode);
                            if (pixel) {
                                vm.memory[rowOffset + (c >> 3)] |= (1 << (7 - (c & 7)));
                            } else {
                                vm.memory[rowOffset + (c >> 3)] &= ~(1 << (7 - (c & 7)));
                            }
                        }
                    }
                }
                return null;
            }

            case SystemOp.FillArea: {
                const mode = vm.pop(), y = vm.pop(), x = vm.pop();
                // Rule B: bit 6=1 is VRAM. Flip it for Engine.
                vm.graphics.fillArea(x, y, mode ^ 0x40);
                if (mode & 0x40) vm.graphics.flushScreen();
                return null;
            }

            case SystemOp.SetGraphMode: {
                const mode = vm.pop();
                if (mode === 0) return vm.graphics.graphMode;
                if (mode !== 1 && mode !== 4 && mode !== 8) return 0;

                const oldMode = vm.graphics.graphMode;
                vm.graphics.graphMode = mode;
                // Clearing screen on mode change is common
                vm.graphics.clearVRAM();
                vm.graphics.clearGraphBuffer();
                vm.graphics.flushScreen();
                return oldMode;
            }

            case SystemOp.SetPalette: {
                const palAddr = vm.resolveAddress(vm.pop());
                const num = vm.pop();
                const start = vm.pop();
                for (let i = 0; i < num; i++) {
                    if (start + i >= 256) break;
                    vm.graphics.palette[(start + i) * 4] = vm.memory[palAddr + i * 4];
                    vm.graphics.palette[(start + i) * 4 + 1] = vm.memory[palAddr + i * 4 + 1];
                    vm.graphics.palette[(start + i) * 4 + 2] = vm.memory[palAddr + i * 4 + 2];
                    vm.graphics.palette[(start + i) * 4 + 3] = 255;
                }
                return num;
            }
            case SystemOp.SetFgColor: {
                const color = vm.pop();
                const old = vm.graphics.fgColor;
                vm.graphics.fgColor = color;
                return old;
            }
            case SystemOp.SetBgColor: {
                const color = vm.pop();
                const old = vm.graphics.bgColor;
                vm.graphics.bgColor = color;
                return old;
            }
            case SystemOp.exit: vm.pop(); vm.running = false; return 0;
            case SystemOp.ClearScreen: vm.graphics.clearGraphBuffer(); return null;
            case SystemOp.abs: return Math.abs(vm.pop());
            case SystemOp.rand: return (Math.random() * 0x8000) | 0;
            case SystemOp.srand: vm.pop(); return 0; // Fixed: pop seed
            case SystemOp.getchar: {
                if (vm.keyBuffer.length === 0) return undefined;
                return vm.keyBuffer.shift()!;
            }
            case SystemOp.Inkey: return vm.keyBuffer.length > 0 ? vm.keyBuffer.shift()! : 0;

            case SystemOp.isalnum: return /^[a-z0-9]$/i.test(String.fromCharCode(vm.pop())) ? -1 : 0;
            case SystemOp.isalpha: return /^[a-z]$/i.test(String.fromCharCode(vm.pop())) ? -1 : 0;
            case SystemOp.iscntrl: {
                const c = vm.pop();
                return (c >= 0 && c <= 31) || c === 127 ? -1 : 0;
            }
            case SystemOp.isdigit: return /^[0-9]$/.test(String.fromCharCode(vm.pop())) ? -1 : 0;
            case SystemOp.isgraph: {
                const c = vm.pop();
                return (c >= 33 && c <= 126) ? -1 : 0;
            }
            case SystemOp.islower: return /^[a-z]$/.test(String.fromCharCode(vm.pop())) ? -1 : 0;
            case SystemOp.isprint: {
                const c = vm.pop();
                return (c >= 32 && c <= 126) ? -1 : 0;
            }
            case SystemOp.ispunct: return /^[!"#$%&'()*+,\-./:;<=>?@[\\\]^_`{|}~]$/.test(String.fromCharCode(vm.pop())) ? -1 : 0;
            case SystemOp.isspace: return /^\s$/.test(String.fromCharCode(vm.pop())) ? -1 : 0;
            case SystemOp.isupper: return /^[A-Z]$/.test(String.fromCharCode(vm.pop())) ? -1 : 0;
            case SystemOp.isxdigit: return /^[a-f0-9]$/i.test(String.fromCharCode(vm.pop())) ? -1 : 0;

            case SystemOp.tolower: return String.fromCharCode(vm.pop()).toLowerCase().charCodeAt(0);
            case SystemOp.toupper: return String.fromCharCode(vm.pop()).toUpperCase().charCodeAt(0);

            case SystemOp.strcmp: {
                const s2 = vm.getStringBytes(vm.pop());
                const s1 = vm.getStringBytes(vm.pop());
                if (!s1 || !s2) return 0;
                const str1 = new TextDecoder('gbk').decode(s1);
                const str2 = new TextDecoder('gbk').decode(s2);
                if (str1 < str2) return -1;
                if (str1 > str2) return 1;
                return 0;
            }
            case SystemOp.strcat: {
                const src = vm.getStringBytes(vm.pop());
                const destHandle = vm.pop();
                const destAddr = vm.resolveAddress(destHandle);
                const destBytes = vm.getStringBytes(destHandle);
                if (destBytes && src) {
                    vm.memory.set(src, destAddr + destBytes.length);
                    vm.memory[destAddr + destBytes.length + src.length] = 0;
                }
                return null;
            }
            case SystemOp.strchr: {
                const char = vm.pop();
                const strHandle = vm.pop();
                const bytes = vm.getStringBytes(strHandle);
                if (bytes) {
                    const idx = bytes.indexOf(char);
                    if (idx !== -1) return (strHandle & 0xFFFF0000) | ((vm.resolveAddress(strHandle) + idx) & 0xFFFF);
                }
                return 0;
            }
            case SystemOp.strstr: {
                const subHandle = vm.pop();
                const strHandle = vm.pop();
                const sub = vm.getStringBytes(subHandle);
                const str = vm.getStringBytes(strHandle);
                if (str && sub) {
                    const strText = new TextDecoder('gbk').decode(str);
                    const subText = new TextDecoder('gbk').decode(sub);
                    const idx = strText.indexOf(subText);
                    if (idx !== -1) {
                        // We need to find the byte offset, not char offset for GBK
                        // But since we are returning a handle, it's tricky.
                        // Let's find byte index in 'str'
                        let byteIdx = 0;
                        const enc = new TextEncoder(); // This might be UTF-8, but GBK prefix match should be similar in structure for simple ASCII
                        // Actually, let's just use the index on bytes if possible
                        // Simple byte search for now
                        for (let i = 0; i <= str.length - sub.length; i++) {
                            let match = true;
                            for (let j = 0; j < sub.length; j++) {
                                if (str[i + j] !== sub[j]) { match = false; break; }
                            }
                            if (match) return (strHandle & 0xFFFF0000) | ((vm.resolveAddress(strHandle) + i) & 0xFFFF);
                        }
                    }
                }
                return 0;
            }


            case SystemOp.memset: {
                const count = vm.pop(), val = vm.pop(), addr = vm.resolveAddress(vm.pop());
                vm.memory.fill(val, addr, addr + count);
                return null;
            }

            case SystemOp.memcpy: {
                const count = vm.pop(), src = vm.resolveAddress(vm.pop()), dest = vm.resolveAddress(vm.pop());
                vm.memory.set(vm.memory.subarray(src, src + count), dest);
                return null;
            }

            case SystemOp.fopen: {
                const m = vm.getStringBytes(vm.pop()), p = vm.getStringBytes(vm.pop());
                const dec = new TextDecoder('gbk');
                return vm.vfs.openFile(dec.decode(p!), dec.decode(m!));
            }
            case SystemOp.fclose: {
                vm.vfs.closeFile(vm.pop());
                return null;
            }
            case SystemOp.fread: {
                const fp = vm.pop(), count = vm.pop(), size = vm.pop(), buf = vm.resolveAddress(vm.pop());
                const h = vm.vfs.getHandle(fp);
                if (!h) return 0;
                const toRead = Math.min(count * size, h.data.length - h.pos);
                if (toRead > 0) {
                    vm.memory.set(h.data.subarray(h.pos, h.pos + toRead), buf);
                    h.pos += toRead;
                }
                return (toRead / size) | 0;
            }
            case SystemOp.fwrite: {
                const fp = vm.pop(), count = vm.pop(), size = vm.pop(), buf = vm.resolveAddress(vm.pop());
                const h = vm.vfs.getHandle(fp);
                if (!h) return 0;
                const toWrite = count * size;
                const data = vm.memory.subarray(buf, buf + toWrite);
                vm.vfs.writeHandleData(fp, data, h.pos);
                return count;
            }
            case SystemOp.fseek: {
                const whence = vm.pop(), offset = vm.pop(), fp = vm.pop();
                const h = vm.vfs.getHandle(fp);
                if (!h) return -1;
                if (whence === 0) h.pos = offset;
                else if (whence === 1) h.pos += offset;
                else if (whence === 2) h.pos = h.data.length + offset;
                return 0;
            }
            case SystemOp.ftell: {
                const h = vm.vfs.getHandle(vm.pop());
                return h ? h.pos : -1;
            }
            case SystemOp.feof: {
                const h = vm.vfs.getHandle(vm.pop());
                return h ? (h.pos >= h.data.length ? -1 : 0) : -1;
            }
            case SystemOp.rewind: {
                const h = vm.vfs.getHandle(vm.pop());
                if (h) h.pos = 0;
                return null;
            }
            case SystemOp.getc: {
                const h = vm.vfs.getHandle(vm.pop());
                return (h && h.pos < h.data.length) ? h.data[h.pos++] : -1;
            }
            case SystemOp.putc: {
                const fp = vm.pop(), char = vm.pop();
                const h = vm.vfs.getHandle(fp);
                if (h) {
                    vm.vfs.writeHandleData(fp, new Uint8Array([char]), h.pos);
                }
                return char;
            }
            case SystemOp.MakeDir: {
                const path = vm.getStringBytes(vm.pop());
                if (path) {
                    const dec = new TextDecoder('gbk');
                    return vm.vfs.mkdir(dec.decode(path)) ? -1 : 0;
                }
                return 0;
            }
            case SystemOp.ChDir: {
                const path = vm.getStringBytes(vm.pop());
                if (path) {
                    const dec = new TextDecoder('gbk');
                    return vm.vfs.chdir(dec.decode(path)) ? -1 : 0;
                }
                return 0;
            }
            case SystemOp.FileList: {
                const ptr = vm.resolveAddress(vm.pop());
                const entries = vm.vfs.getFiles();
                if (entries.length > 0) {
                    // Mock: just pick the first file for now
                    const name = entries[0].path.split('/').pop() || "";
                    const bytes = iconv.encode(name, 'gbk');
                    vm.memory.set(bytes, ptr);
                    vm.memory[ptr + bytes.length] = 0;
                    return -1;
                }
                return 0;
            }

            case SystemOp.opendir: {
                const path = vm.getStringBytes(vm.pop());
                if (path) {
                    const dec = new TextDecoder('gbk');
                    return vm.vfs.opendir(dec.decode(path));
                }
                return 0;
            }
            // readdir is 0xD3, shared with System
            case SystemOp.closedir: {
                vm.vfs.closedir(vm.pop());
                return 0;
            }

            case SystemOp.Getms: return Date.now() - vm.startTime;
            case SystemOp.CheckKey: {
                vm.pop(); // Consume key argument, but not from keyBuffer
                const keyToCheck = vm.stk[vm.sp]; // the popped value
                let hold = 0;
                if (keyToCheck < 128) {
                    hold = (vm.currentKeyDown === keyToCheck) ? keyToCheck : 0;
                } else {
                    hold = (vm.currentKeyDown !== 0) ? vm.currentKeyDown : 0;
                }

                // If checking key failed, yielding slightly allows JS to process UI events in tight loops
                if (!hold && !vm.keyBuffer.length) {
                    // Setting delayUntil = 0 with resolveKeySignal enforces a small yield to next tick
                    if (!vm['resolveKeySignal']) {
                        let resolver: () => void;
                        const promise = new Promise<void>(resolve => { resolver = resolve; });
                        vm['resolveKeySignal'] = resolver!;
                        setTimeout(() => vm.wakeUp(), 0);
                    }
                }
                return hold ? -1 : 0; // The LavaX spec for CheckKey(key<128) says it returns non-zero. For key>=128 it returns the key.
            }
            case SystemOp.memmove: {
                const count = vm.pop(), src = vm.resolveAddress(vm.pop()), dest = vm.resolveAddress(vm.pop());
                vm.memory.copyWithin(dest, src, src + count);
                return null;
            }
            case SystemOp.Crc16: {
                const count = vm.pop(), addr = vm.resolveAddress(vm.pop());
                let crc = 0xFFFF;
                for (let i = 0; i < count; i++) {
                    crc ^= vm.memory[addr + i];
                    for (let j = 0; j < 8; j++) {
                        if (crc & 1) crc = (crc >>> 1) ^ 0xA001;
                        else crc >>>= 1;
                    }
                }
                return crc & 0xFFFF;
            }
            case SystemOp.GetTime: {
                const addr = vm.resolveAddress(vm.pop());
                const now = new Date();
                const view = new DataView(vm.memory.buffer);
                view.setUint16(addr, now.getFullYear(), true);
                view.setUint8(addr + 2, (now.getMonth() + 1) & 0xFF);
                view.setUint8(addr + 3, now.getDate() & 0xFF);
                view.setUint8(addr + 4, now.getHours() & 0xFF);
                view.setUint8(addr + 5, now.getMinutes() & 0xFF);
                view.setUint8(addr + 6, now.getSeconds() & 0xFF);
                view.setUint8(addr + 7, now.getDay() & 0xFF);
                return null;
            }
            case SystemOp.SetTime: {
                vm.pop(); // Not supported in mock environment
                return null;
            }
            case SystemOp.GetWord: {
                // Returns key code if available, else undefined to block
                if (vm.keyBuffer.length === 0) return undefined;
                vm.pop(); // Consume mode argument
                return vm.keyBuffer.shift();
            }
            case SystemOp.Sin: {
                const v = vm.pop();
                return (Math.sin(v * Math.PI / 180) * 0x8000) | 0; // Fix point for legacy GVM
            }
            case SystemOp.Cos: {
                const v = vm.pop();
                return (Math.cos(v * Math.PI / 180) * 0x8000) | 0;
            }
            case SystemOp.PutKey: {
                vm.keyBuffer.push(vm.pop());
                return 0;
            }
            case SystemOp.Secret: {
                vm.pop(); vm.pop(); vm.pop();
                return null;
            }
            case SystemOp.PlayStops:
                return null;
            case SystemOp.SetVolume:
                vm.pop();
                return null;
            case SystemOp.PlaySleep:
                return null;
            case SystemOp.ReleaseKey:
                vm.pop();
                return null;

            case SystemOp.System: { // 0xD3
                const sub = vm.pop();
                // Check if it's readdir(h) based on the sub-value being a valid dir handle
                // (This is a heuristic as opcodes overlap in some specifications)
                // If it's not a known SystemCoreOp, or if we want to prioritize readdir
                if (sub > 0 && sub < 100) { // readdir handle range
                    const name = vm.vfs.readdir(sub);
                    if (name) {
                        const bytes = iconv.encode(name, 'gbk');
                        const addr = 0x7500; // Use a dedicated area for readdir results
                        vm.memory.set(bytes, addr);
                        vm.memory[addr + bytes.length] = 0;
                        return addr;
                    } else if (sub > 0x1C) { // Definitely not a known SystemCoreOp
                        return 0; // NULL for readdir end
                    }
                }

                if (vm.debug) vm.onLog(`System Core Dispatch: 0x${sub.toString(16)}`);
                switch (sub) {
                    case SystemCoreOp.GetPID: return 100;
                    case SystemCoreOp.GetBrightness: return 100;
                    case SystemCoreOp.GetVersion: return 0x0300; // V3.0
                    case SystemCoreOp.Idle: return;
                }
                return 0;
            }

            case SystemOp.Math: { // 0xD4
                const sub = vm.pop();
                // Sub-opcodes 0x02 - 0x11 are MathFrameworkOp
                if (sub >= 0x02 && sub <= 0x11) {
                    switch (sub) {
                        case MathFrameworkOp.fadd: return this.floatOp((a, b) => a + b);
                        case MathFrameworkOp.fsub: return this.floatOp((a, b) => a - b);
                        case MathFrameworkOp.fmul: return this.floatOp((a, b) => a * b);
                        case MathFrameworkOp.fdiv: return this.floatOp((a, b) => a / b);
                        case MathFrameworkOp.sqrt: return this.floatUnary(Math.sqrt);
                        case MathFrameworkOp.f2i: return (vm.popFloat() | 0);
                        case MathFrameworkOp.sin: return this.floatUnary(Math.sin);
                        case MathFrameworkOp.cos: return this.floatUnary(Math.cos);
                        case MathFrameworkOp.tan: return this.floatUnary(Math.tan);
                        case MathFrameworkOp.asin: return this.floatUnary(Math.asin);
                        case MathFrameworkOp.acos: return this.floatUnary(Math.acos);
                        case MathFrameworkOp.atan: return this.floatUnary(Math.atan);
                        case MathFrameworkOp.exp: return this.floatUnary(Math.exp);
                        case MathFrameworkOp.log: return this.floatUnary(Math.log);
                        case MathFrameworkOp.str2f: {
                            const s = vm.getStringBytes(vm.pop());
                            const text = s ? new TextDecoder('gbk').decode(s) : "0";
                            const f = parseFloat(text);
                            const b = new ArrayBuffer(4);
                            new Float32Array(b)[0] = f;
                            return new Int32Array(b)[0];
                        }
                        case MathFrameworkOp.f2str: {
                            const f = vm.popFloat();
                            const addr = vm.resolveAddress(vm.pop());
                            const str = f.toFixed(6);
                            const bytes = iconv.encode(str, 'gbk');
                            vm.memory.set(bytes, addr);
                            vm.memory[addr + bytes.length] = 0;
                            return addr;
                        }
                    }
                } else {
                    // Assume rewinddir(h) where sub is handle
                    vm.vfs.rewinddir(sub);
                    return null;
                }
                return 0; // Return 0 for unknown sub-ops instead of undefined to avoid yield
            }
            default:
                vm.onLog(`[VM Warning] Unhandled Syscall 0x${op.toString(16)}`);
                return 0;
        }
    }

    private floatOp(fn: (a: number, b: number) => number): number {
        const b = this.vm.popFloat(), a = this.vm.popFloat();
        const buf = new ArrayBuffer(4);
        new Float32Array(buf)[0] = fn(a, b);
        return new Int32Array(buf)[0];
    }

    private floatUnary(fn: (v: number) => number): number {
        const v = this.vm.popFloat();
        const buf = new ArrayBuffer(4);
        new Float32Array(buf)[0] = fn(v);
        return new Int32Array(buf)[0];
    }

    private formatVariadicString(formatBytes: Uint8Array, count: number, startIdx: number): string {
        const format = new TextDecoder('gbk').decode(formatBytes);
        let result = "";
        let argIdx = 0;
        const fBuf = new ArrayBuffer(4);
        const fView = new Float32Array(fBuf);
        const iView = new Int32Array(fBuf);

        for (let i = 0; i < format.length; i++) {
            if (format[i] === '%' && i + 1 < format.length) {
                const spec = format[++i];
                if (spec === '%') { result += "%"; continue; }
                const val = this.vm.stk[startIdx + argIdx++];
                switch (spec) {
                    case 'c': result += String.fromCharCode(val); break;
                    case 'd': case 'i': result += (val | 0).toString(); break;
                    case 'u': result += (val >>> 0).toString(); break;
                    case 'x': result += (val >>> 0).toString(16); break;
                    case 'X': result += (val >>> 0).toString(16).toUpperCase(); break;
                    case 's': {
                        const s = this.vm.getStringBytes(val);
                        if (s) result += new TextDecoder('gbk').decode(s);
                        break;
                    }
                    case 'f': {
                        iView[0] = val;
                        result += fView[0].toFixed(6);
                        break;
                    }
                    default: result += "%" + spec;
                }
            } else {
                result += format[i];
            }
        }
        return result;
    }
}