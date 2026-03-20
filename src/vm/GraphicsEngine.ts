import iconv from 'iconv-lite';

import { SCREEN_WIDTH, SCREEN_HEIGHT, VRAM_OFFSET, GBUF_OFFSET, TEXT_OFFSET, GBUF_OFFSET_LVM } from '../types';

export class GraphicsEngine {
    private fontData: Uint8Array | null = null;
    private fontOffsets: number[] = [];

    // Text buffer state
    public currentLineIndex = 0;
    public currentFontSize = 12; // Default to 12pt font
    private maxLines = 0;
    private charsPerLine = 0;

    public fgColor: number = 15;
    public bgColor: number = 0;
    public palette: Uint8Array = new Uint8Array(256 * 4);

    constructor(private memory: Uint8Array, private onUpdateScreen: (imageData: ImageData) => void) {
        this.updateBufferCapacity();
        this.initializeDefaultPalette();
    }

    private initializeDefaultPalette() {
        // Standard VGA 16 colors
        const vgaColors = [
            0, 0, 0,       // 0: Black
            0, 0, 170,     // 1: Blue
            0, 170, 0,     // 2: Green
            0, 170, 170,   // 3: Cyan
            170, 0, 0,     // 4: Red
            170, 0, 170,   // 5: Magenta
            170, 85, 0,    // 6: Brown
            170, 170, 170, // 7: Light Gray
            85, 85, 85,    // 8: Dark Gray
            85, 85, 255,   // 9: Bright Blue
            85, 255, 85,   // 10: Bright Green
            85, 255, 255,  // 11: Bright Cyan
            255, 85, 85,   // 12: Bright Red
            255, 85, 255,  // 13: Bright Magenta
            255, 255, 85,  // 14: Yellow
            255, 255, 255  // 15: White
        ];

        for (let i = 0; i < 16; i++) {
            this.palette[i * 4] = vgaColors[i * 3];
            this.palette[i * 4 + 1] = vgaColors[i * 3 + 1];
            this.palette[i * 4 + 2] = vgaColors[i * 3 + 2];
            this.palette[i * 4 + 3] = 255;
        }

        // 6x6x6 color cube (indices 16-231)
        const levels = [0, 51, 102, 153, 204, 255];
        let idx = 16;
        for (let r = 0; r < 6; r++) {
            for (let g = 0; g < 6; g++) {
                for (let b = 0; b < 6; b++) {
                    this.palette[idx * 4] = levels[r];
                    this.palette[idx * 4 + 1] = levels[g];
                    this.palette[idx * 4 + 2] = levels[b];
                    this.palette[idx * 4 + 3] = 255;
                    idx++;
                }
            }
        }

        // Grayscale ramp (indices 232-255)
        for (let i = 0; i < 24; i++) {
            const gray = Math.round(i * 255 / 23);
            this.palette[(232 + i) * 4] = gray;
            this.palette[(232 + i) * 4 + 1] = gray;
            this.palette[(232 + i) * 4 + 2] = gray;
            this.palette[(232 + i) * 4 + 3] = 255;
        }
    }

    public cursorX = 0;
    public cursorY = 0;

    public graphMode: number = 1; // 1=2-color, 4=16-color, 8=256-color

    public setInternalFontData(data: Uint8Array) {
        if (data && data.length >= 16) {
            this.fontData = data;
            const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
            this.fontOffsets = [];
            for (let i = 0; i < 4; i++) {
                this.fontOffsets.push(view.getUint32(i * 4, true));
            }
        }
    }

    private getBufferSize(): number {
        if (this.graphMode === 8) return SCREEN_WIDTH * SCREEN_HEIGHT;
        if (this.graphMode === 4) return (SCREEN_WIDTH * SCREEN_HEIGHT) / 2;
        return (SCREEN_WIDTH * SCREEN_HEIGHT) / 8;
    }

    private getVramOffset(): number {
        return VRAM_OFFSET;
    }

    private getGbufOffset(): number {
        // In color modes, GBUF is typically at 0x8000
        return (this.graphMode === 1) ? GBUF_OFFSET : GBUF_OFFSET_LVM;
    }

    private updateBufferCapacity() {
        if (this.currentFontSize === 16) {
            this.maxLines = 5; // 80 / 16
            this.charsPerLine = 20; // 160 / 8
        } else {
            this.maxLines = 6; // 80 / 12 = 6.66 -> 6 lines
            this.charsPerLine = 26; // 160 / 6 = 26.66 -> 26 chars
        }
    }

    private scrollTextBuffer() {
        // Move lines up: row 1->0, 2->1, etc.
        const lineSize = this.charsPerLine;
        const totalSize = this.maxLines * lineSize;
        const textStart = TEXT_OFFSET;

        // Move memory: dest, src, srcEnd
        // We move from line 1 (start + lineSize) to start, length = (maxLines - 1) * lineSize
        this.memory.copyWithin(textStart, textStart + lineSize, textStart + totalSize);

        // Clear last line
        const lastLineStart = textStart + (this.maxLines - 1) * lineSize;
        this.memory.fill(0, lastLineStart, lastLineStart + lineSize);
    }

    private newLine() {
        this.currentLineIndex++;
        if (this.currentLineIndex >= this.maxLines) {
            this.scrollTextBuffer();
            this.currentLineIndex = this.maxLines - 1;
        }
        this.cursorX = 0;
    }

    /**
     * Clear the text buffer only.
     */
    public clearTextBuffer() {
        // Clear TEXT memory region
        // Max usage is roughly 26*6 = 156 bytes. TEXT_OFFSET is 0xC80.
        // Let's clear enough space. Safe upper bound 512 bytes.
        this.memory.fill(0, TEXT_OFFSET, TEXT_OFFSET + 512);
        this.currentLineIndex = 0;
        this.cursorX = 0;
        this.cursorY = 0;
    }

    /**
     * Clear the graphics buffer (GBUF) only.
     * This is what ClearScreen() does in the reference implementation.
     */
    public clearGraphBuffer() {
        const bufferSize = this.getBufferSize();
        const offset = this.getGbufOffset();
        this.memory.fill(0, offset, offset + bufferSize);
    }

    /**
     * Clear the VRAM (visible screen buffer) only.
     */
    public clearVRAM() {
        const bufferSize = this.getBufferSize();
        const offset = this.getVramOffset();
        this.memory.fill(0, offset, offset + bufferSize);
    }

    /**
     * Full reset: clear VRAM, GBUF, TEXT area, text buffer, cursor, and flush blank screen.
     * Used when loading/running a new program.
     */
    public fullReset() {
        this.graphMode = 1; // Default to 2-color
        this.initializeDefaultPalette();
        this.fgColor = 1; // In 2-color mode, 1 is often preferred as default
        this.bgColor = 0;
        this.clearVRAM();
        this.clearGraphBuffer();
        this.clearTextBuffer();
        this.flushScreen();
    }

    public setCurrentLine(lineIndex: number) {
        // Set the current line index for Locate functionality
        if (lineIndex >= 0 && lineIndex < this.maxLines) {
            this.currentLineIndex = lineIndex;
        }
    }

    private repaintTextBuffer() {
        // Clear text area in VRAM
        this.clearVRAM();
        // Let's just use repaintFromTextMemory with mask=0 (update all)
        this.repaintFromTextMemory(0);
    }

    public repaintFromTextMemory(mask: number = 0) {
        const size = this.currentFontSize;
        const lineCount = this.maxLines;
        const lineChars = this.charsPerLine;

        for (let i = 0; i < lineCount; i++) {
            // mode bit i control line i. 0: update, 1: no update.
            // bit 7 is line 0, bit 6 is line 1...
            if ((mask & (1 << (7 - i))) !== 0) continue;

            const start = TEXT_OFFSET + i * lineChars;

            // Clear specific line in VRAM
            if (this.graphMode === 8) {
                const pixelsLineToClear = SCREEN_WIDTH * size;
                this.memory.fill(this.bgColor, VRAM_OFFSET + i * pixelsLineToClear, VRAM_OFFSET + (i + 1) * pixelsLineToClear);
            } else if (this.graphMode === 4) {
                const pixelsLineToClear = SCREEN_WIDTH * size;
                const fillVal = (this.bgColor & 0x0F) | ((this.bgColor & 0x0F) << 4);
                this.memory.fill(fillVal, VRAM_OFFSET + i * pixelsLineToClear * 0.5, VRAM_OFFSET + (i + 1) * pixelsLineToClear * 0.5);
            } else {
                const bytesLineToClear = Math.ceil((SCREEN_WIDTH * size) / 8);
                this.memory.fill(0, VRAM_OFFSET + i * bytesLineToClear, VRAM_OFFSET + (i + 1) * bytesLineToClear);
            }

            // Find end of string or end of line (whichever comes first)
            let end = start;
            while (end < start + lineChars && this.memory[end] !== 0) end++;

            const bytes = this.memory.subarray(start, end);
            if (bytes.length > 0) {
                // To TextOut via VRAM: bit 7 = (size===16?1:0), bit 6 = 1 (VRAM), bit 2-0 = 1 (copy)
                const type = (size === 16 ? 0x80 : 0) | 0x40 | 0x01;
                this.TextOut(0, i * size, bytes, type);
            }
        }
    }


    public writeString(text: string, mode: number = 1) {
        const size = (mode & 0x80) ? 16 : 12;

        if (this.currentFontSize !== size) {
            this.currentFontSize = size;
            this.updateBufferCapacity();
        }

        const encoded = iconv.encode(text, 'gbk'); // GBK encoded bytes

        for (let i = 0; i < encoded.length; i++) {
            const charCode = encoded[i];

            if (charCode === 10) { // \n
                this.newLine();
            } else if (charCode === 13) { // \r
                this.cursorX = 0;
            } else {
                // Write char to memory
                if (this.cursorX >= this.charsPerLine) {
                    this.newLine();
                }

                const addr = TEXT_OFFSET + (this.currentLineIndex * this.charsPerLine) + this.cursorX;
                this.memory[addr] = charCode;
                this.cursorX++;
            }
        }

        // Repaint the entire buffer
        this.repaintTextBuffer();

        if (mode & 0x40) this.flushScreen();
    }


    public flushScreen() {
        if (typeof ImageData === 'undefined') return;
        const img = new ImageData(SCREEN_WIDTH, SCREEN_HEIGHT);
        const vram = VRAM_OFFSET;

        for (let i = 0; i < SCREEN_WIDTH * SCREEN_HEIGHT; i++) {
            const idx = i * 4;
            let pixel = 0;

            if (this.graphMode === 8) {
                pixel = this.memory[vram + i];
                img.data[idx] = this.palette[pixel * 4];
                img.data[idx + 1] = this.palette[pixel * 4 + 1];
                img.data[idx + 2] = this.palette[pixel * 4 + 2];
            } else if (this.graphMode === 4) {
                const byte = this.memory[vram + Math.floor(i / 2)];
                pixel = (i % 2 === 0) ? (byte >> 4) : (byte & 0x0F);
                img.data[idx] = this.palette[pixel * 4];
                img.data[idx + 1] = this.palette[pixel * 4 + 1];
                img.data[idx + 2] = this.palette[pixel * 4 + 2];
            } else {
                pixel = (this.memory[vram + Math.floor(i / 8)] >> (7 - (i % 8))) & 1;
                const c = pixel ? [35, 45, 35] : [148, 161, 135];
                img.data[idx] = c[0]; img.data[idx + 1] = c[1]; img.data[idx + 2] = c[2];
            }
            img.data[idx + 3] = 255;
        }
        this.onUpdateScreen(img);
    }

    public setPixel(x: number, y: number, color: number, mode: number = 0) {
        if (x < 0 || x >= SCREEN_WIDTH || y < 0 || y >= SCREEN_HEIGHT) return;
        const offset = (mode & 0x40) ? this.getGbufOffset() : this.getVramOffset();
        const i = y * SCREEN_WIDTH + x;

        if (this.graphMode === 8) {
            const byteIdx = offset + i;
            const oldPixel = this.memory[byteIdx];
            let source = color;
            const drawMode = mode & 0x07;
            const reverse = !!(mode & 0x08);

            if (reverse) source = 255 - source; // Assume 255 is max color

            let newPixel = source;
            switch (drawMode) {
                case 0: newPixel = 0; break;
                case 1: newPixel = source; break;
                case 2: newPixel = 255 - oldPixel; break;
                case 3: newPixel = oldPixel | source; break;
                case 4: newPixel = oldPixel & source; break;
                case 5: newPixel = oldPixel ^ source; break;
            }
            this.memory[byteIdx] = newPixel;
        } else if (this.graphMode === 4) {
            const byteIdx = offset + Math.floor(i / 2);
            const isLeft = (i % 2 === 0);
            const oldPixel = isLeft ? (this.memory[byteIdx] >> 4) : (this.memory[byteIdx] & 0x0F);

            let source = color & 0x0F;
            const drawMode = mode & 0x07;
            const reverse = !!(mode & 0x08);

            if (reverse) source = 15 - source;

            let newPixel = source;
            switch (drawMode) {
                case 0: newPixel = 0; break;
                case 1: newPixel = source; break;
                case 2: newPixel = 15 - oldPixel; break;
                case 3: newPixel = oldPixel | source; break;
                case 4: newPixel = oldPixel & source; break;
                case 5: newPixel = oldPixel ^ source; break;
            }

            if (isLeft) {
                this.memory[byteIdx] = (this.memory[byteIdx] & 0x0F) | (newPixel << 4);
            } else {
                this.memory[byteIdx] = (this.memory[byteIdx] & 0xF0) | newPixel;
            }
        } else {
            const byteIdx = offset + Math.floor(i / 8);
            const bitIdx = 7 - (i % 8);
            const oldPixel = (this.memory[byteIdx] >> bitIdx) & 1;

            let source = color & 1;
            const drawMode = mode & 0x07;
            const reverse = !!(mode & 0x08);

            if (reverse) source = 1 - source;

            let newPixel = source;
            switch (drawMode) {
                case 0: newPixel = 0; break;
                case 1: newPixel = source; break;
                case 2: newPixel = 1 - oldPixel; break;
                case 3: newPixel = oldPixel | source; break;
                case 4: newPixel = oldPixel & source; break;
                case 5: newPixel = oldPixel ^ source; break;
            }

            if (newPixel) this.memory[byteIdx] |= (1 << bitIdx);
            else this.memory[byteIdx] &= ~(1 << bitIdx);
        }
    }

    public getPixel(x: number, y: number, mode: number = 0): number {
        if (x < 0 || x >= SCREEN_WIDTH || y < 0 || y >= SCREEN_HEIGHT) return 0;
        const offset = (mode & 0x40) ? this.getGbufOffset() : this.getVramOffset();
        const i = y * SCREEN_WIDTH + x;

        if (this.graphMode === 8) {
            return this.memory[offset + i];
        } else if (this.graphMode === 4) {
            const byte = this.memory[offset + Math.floor(i / 2)];
            return (i % 2 === 0) ? (byte >> 4) : (byte & 0x0F);
        } else {
            return (this.memory[offset + Math.floor(i / 8)] >> (7 - (i % 8))) & 1;
        }
    }

    public TextOut(x: number, y: number, bytes: Uint8Array, type: number) {
        if (!this.fontData) return;

        const isBigFont = (type & 0x80) !== 0; // bit 7 = 1 -> big font (16), 0 -> small font (12)
        const toVram = (type & 0x40) !== 0;    // bit 6 = 1 -> VRAM (screen)
        const hFlip = (type & 0x20) !== 0;     // bit 5 = 1 -> horizontal flip
        const reverseDisplay = (type & 0x08) !== 0; // bit 3 = 1 -> reverse color
        const drawMode = type & 0x07;          // 1:copy 2:not 3:or 4:and 5:xor

        const size = isBigFont ? 16 : 12;
        const offset = toVram ? this.getVramOffset() : this.getGbufOffset();

        // Ensure flip requirement is met? "要求图形宽度和x坐标都必须是8的整数倍"
        // Let's just implement it visually.

        let curX = x;
        let i = 0;

        const drawCharCustom = (cx: number, cy: number, b1: number, b2: number | null) => {
            const isChinese = b2 !== null;
            const w = isChinese ? size : (isBigFont ? 8 : 6);
            if (!this.fontData) return;

            let charBytes = [];
            if (isChinese) {
                const base = this.fontOffsets[isBigFont ? 2 : 3];
                const rIdx = b1 - 0xA1, cIdx = b2 - 0xA1;
                if (rIdx < 0 || rIdx >= 94 || cIdx < 0 || cIdx >= 94) return;
                const byteSize = isBigFont ? 32 : 24;
                const addr = base + (rIdx * 94 + cIdx) * byteSize;
                charBytes = Array.from(this.fontData.subarray(addr, addr + byteSize));
            } else {
                const base = this.fontOffsets[isBigFont ? 0 : 1];
                const charIdx = b1 - 32;
                if (charIdx < 0 || charIdx >= 95) return;
                const addr = base + charIdx * size;
                charBytes = Array.from(this.fontData.subarray(addr, addr + size));
            }

            for (let r = 0; r < size; r++) {
                for (let c = 0; c < w; c++) {
                    let sourceC = hFlip ? (w - 1 - c) : c;
                    let bit = 0;
                    if (isChinese) {
                        const byteIdx = r * 2 + (sourceC > 7 ? 1 : 0);
                        const bIdx = 7 - (sourceC % 8);
                        bit = (charBytes[byteIdx] >> bIdx) & 1;
                    } else {
                        const bIdx = 7 - sourceC;
                        bit = (charBytes[r] >> bIdx) & 1;
                    }

                    if (reverseDisplay) bit = 1 - bit;

                    const screenX = cx + c;
                    const screenY = cy + r;
                    if (screenX < 0 || screenX >= SCREEN_WIDTH || screenY < 0 || screenY >= SCREEN_HEIGHT) continue;

                    const i = screenY * SCREEN_WIDTH + screenX;
                    const byteIdxMemory = offset + (this.graphMode === 8 ? i : (this.graphMode === 4 ? Math.floor(i / 2) : Math.floor(i / 8)));

                    let newPixel = 0;
                    if (this.graphMode === 8) {
                        const oldPixel = this.memory[byteIdxMemory];
                        let sourceColor = bit ? this.fgColor : this.bgColor;
                        switch (drawMode) {
                            case 1: newPixel = sourceColor; break;
                            case 2: newPixel = 255 - sourceColor; break;
                            case 3: newPixel = oldPixel | sourceColor; break;
                            case 4: newPixel = oldPixel & sourceColor; break;
                            case 5: newPixel = oldPixel ^ sourceColor; break;
                            default: continue;
                        }
                        this.memory[byteIdxMemory] = newPixel;
                    } else if (this.graphMode === 4) {
                        const isLeft = (screenX % 2 === 0);
                        const oldPixel = isLeft ? (this.memory[byteIdxMemory] >> 4) : (this.memory[byteIdxMemory] & 0x0F);
                        let sourceColor = bit ? (this.fgColor & 0x0F) : (this.bgColor & 0x0F);
                        switch (drawMode) {
                            case 1: newPixel = sourceColor; break;
                            case 2: newPixel = 15 - sourceColor; break;
                            case 3: newPixel = oldPixel | sourceColor; break;
                            case 4: newPixel = oldPixel & sourceColor; break;
                            case 5: newPixel = oldPixel ^ sourceColor; break;
                            default: continue;
                        }
                        if (isLeft) this.memory[byteIdxMemory] = (this.memory[byteIdxMemory] & 0x0F) | (newPixel << 4);
                        else this.memory[byteIdxMemory] = (this.memory[byteIdxMemory] & 0xF0) | newPixel;
                    } else {
                        const bIdxData = 7 - (screenX % 8);
                        const oldPixel = (this.memory[byteIdxMemory] >> bIdxData) & 1;
                        switch (drawMode) {
                            case 1: newPixel = bit; break;
                            case 2: newPixel = 1 - bit; break;
                            case 3: newPixel = oldPixel | bit; break;
                            case 4: newPixel = oldPixel & bit; break;
                            case 5: newPixel = oldPixel ^ bit; break;
                            default: continue;
                        }
                        if (newPixel) this.memory[byteIdxMemory] |= (1 << bIdxData);
                        else this.memory[byteIdxMemory] &= ~(1 << bIdxData);
                    }
                }
            }
        };

        while (i < bytes.length && bytes[i] !== 0) {
            const b1 = bytes[i];
            if (b1 < 0x80) {
                drawCharCustom(curX, y, b1, null);
                curX += (isBigFont ? 8 : 6);
                i++;
            } else {
                const b2 = bytes[i + 1];
                if (b2) {
                    drawCharCustom(curX, y, b1, b2);
                    curX += size;
                    i += 2;
                } else {
                    i++;
                }
            }
        }

        if (toVram) this.flushScreen();
    }

    private drawPixelStupid(x: number, y: number, type: number, forceGbuf: boolean = false) {
        if (x < 0 || x >= SCREEN_WIDTH || y < 0 || y >= SCREEN_HEIGHT) return;
        const toGbuf = forceGbuf || ((type & 0x40) !== 0);
        const offset = toGbuf ? this.getGbufOffset() : this.getVramOffset();
        const drawMode = type & 0x07;

        const i = y * SCREEN_WIDTH + x;
        if (this.graphMode === 8) {
            const byteIdx = offset + i;
            const oldPixel = this.memory[byteIdx];
            let newPixel = oldPixel;
            if (drawMode === 0) newPixel = this.bgColor;
            else if (drawMode === 1) newPixel = this.fgColor;
            else if (drawMode === 2) newPixel = 255 - oldPixel;
            this.memory[byteIdx] = newPixel;
        } else if (this.graphMode === 4) {
            const byteIdx = offset + Math.floor(i / 2);
            const isLeft = (i % 2 === 0);
            const oldPixel = isLeft ? (this.memory[byteIdx] >> 4) : (this.memory[byteIdx] & 0x0F);
            let newPixel = oldPixel;
            if (drawMode === 0) newPixel = this.bgColor & 0x0F;
            else if (drawMode === 1) newPixel = this.fgColor & 0x0F;
            else if (drawMode === 2) newPixel = 15 - oldPixel;

            if (isLeft) {
                this.memory[byteIdx] = (this.memory[byteIdx] & 0x0F) | (newPixel << 4);
            } else {
                this.memory[byteIdx] = (this.memory[byteIdx] & 0xF0) | newPixel;
            }
        } else {
            const byteIdx = offset + Math.floor(i / 8);
            const bitIdx = 7 - (i % 8);
            const oldPixel = (this.memory[byteIdx] >> bitIdx) & 1;
            let newPixel = oldPixel;
            if (drawMode === 0) newPixel = 0;
            else if (drawMode === 1) newPixel = 1;
            else if (drawMode === 2) newPixel = 1 - oldPixel;

            if (newPixel) this.memory[byteIdx] |= (1 << bitIdx);
            else this.memory[byteIdx] &= ~(1 << bitIdx);
        }
    }

    public Point(x: number, y: number, type: number) {
        this.drawPixelStupid(x, y, type, false);
        if ((type & 0x40) === 0) this.flushScreen();
    }

    public Line(x0: number, y0: number, x1: number, y1: number, type: number) {
        const dx = Math.abs(x1 - x0), dy = Math.abs(y1 - y0);
        const sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
        let err = dx - dy;
        let cx = x0, cy = y0;
        while (true) {
            this.drawPixelStupid(cx, cy, type, false);
            if (cx === x1 && cy === y1) break;
            const e2 = 2 * err;
            if (e2 > -dy) { err -= dy; cx += sx; }
            if (e2 < dx) { err += dx; cy += sy; }
        }
        if ((type & 0x40) === 0) this.flushScreen();
    }

    public Box(x0: number, y0: number, x1: number, y1: number, fill: number, type: number) {
        const minX = Math.min(x0, x1);
        const maxX = Math.max(x0, x1);
        const minY = Math.min(y0, y1);
        const maxY = Math.max(y0, y1);

        if (fill) {
            for (let y = minY; y <= maxY; y++) {
                for (let x = minX; x <= maxX; x++) {
                    this.drawPixelStupid(x, y, type, false);
                }
            }
        } else {
            for (let x = minX; x <= maxX; x++) {
                this.drawPixelStupid(x, minY, type, false);
                this.drawPixelStupid(x, maxY, type, false);
            }
            for (let y = minY; y <= maxY; y++) {
                this.drawPixelStupid(minX, y, type, false);
                this.drawPixelStupid(maxX, y, type, false);
            }
        }
        if ((type & 0x40) === 0) this.flushScreen();
    }

    public Block(x0: number, y0: number, x1: number, y1: number, type: number) {
        const minX = Math.min(x0, x1);
        const maxX = Math.max(x0, x1);
        const minY = Math.min(y0, y1);
        const maxY = Math.max(y0, y1);

        for (let y = minY; y <= maxY; y++) {
            for (let x = minX; x <= maxX; x++) {
                this.drawPixelStupid(x, y, type, true);
            }
        }
    }

    public Rectangle(x0: number, y0: number, x1: number, y1: number, type: number) {
        const minX = Math.min(x0, x1);
        const maxX = Math.max(x0, x1);
        const minY = Math.min(y0, y1);
        const maxY = Math.max(y0, y1);

        for (let x = minX; x <= maxX; x++) {
            this.drawPixelStupid(x, minY, type, true);
            this.drawPixelStupid(x, maxY, type, true);
        }
        for (let y = minY; y <= maxY; y++) {
            this.drawPixelStupid(minX, y, type, true);
            this.drawPixelStupid(maxX, y, type, true);
        }
    }

    public Circle(xc: number, yc: number, r: number, fill: number, type: number) {
        if (fill) {
            for (let y = -r; y <= r; y++) {
                let dx = Math.floor(Math.sqrt(Math.max(0, r * r - y * y)));
                for (let x = -dx; x <= dx; x++) {
                    this.drawPixelStupid(xc + x, yc + y, type, false);
                }
            }
        } else {
            let x = 0, y = r;
            let d = 3 - 2 * r;
            const drawP = (cx: number, cy: number, px: number, py: number) => {
                this.drawPixelStupid(cx + px, cy + py, type, false);
                this.drawPixelStupid(cx - px, cy + py, type, false);
                this.drawPixelStupid(cx + px, cy - py, type, false);
                this.drawPixelStupid(cx - px, cy - py, type, false);
                this.drawPixelStupid(cx + py, cy + px, type, false);
                this.drawPixelStupid(cx - py, cy + px, type, false);
                this.drawPixelStupid(cx + py, cy - px, type, false);
                this.drawPixelStupid(cx - py, cy - px, type, false);
            };
            drawP(xc, yc, x, y);
            while (y >= x) {
                x++;
                if (d > 0) { y--; d = d + 4 * (x - y) + 10; }
                else d = d + 4 * x + 6;
                drawP(xc, yc, x, y);
            }
        }
        if ((type & 0x40) === 0) this.flushScreen();
    }

    public Ellipse(xc: number, yc: number, a: number, b: number, fill: number, type: number) {
        if (a === 0 || b === 0) return;
        if (fill) {
            for (let y = -b; y <= b; y++) {
                let dx = Math.floor(a * Math.sqrt(Math.max(0, 1 - (y * y) / (b * b))));
                for (let x = -dx; x <= dx; x++) {
                    this.drawPixelStupid(xc + x, yc + y, type, false);
                }
            }
        } else {
            let x = 0, y = b;
            let a2 = a * a, b2 = b * b;
            let d1 = b2 - a2 * b + 0.25 * a2;
            let dx = 2 * b2 * x, dy = 2 * a2 * y;

            const drawP = (cx: number, cy: number, px: number, py: number) => {
                this.drawPixelStupid(cx + px, cy + py, type, false);
                this.drawPixelStupid(cx - px, cy + py, type, false);
                this.drawPixelStupid(cx + px, cy - py, type, false);
                this.drawPixelStupid(cx - px, cy - py, type, false);
            };

            while (dx < dy) {
                drawP(xc, yc, x, y);
                if (d1 < 0) {
                    x++; dx += 2 * b2; d1 += dx + b2;
                } else {
                    x++; y--; dx += 2 * b2; dy -= 2 * a2; d1 += dx - dy + b2;
                }
            }

            let d2 = b2 * (x + 0.5) * (x + 0.5) + a2 * (y - 1) * (y - 1) - a2 * b2;
            while (y >= 0) {
                drawP(xc, yc, x, y);
                if (d2 > 0) {
                    y--; dy -= 2 * a2; d2 += a2 - dy;
                } else {
                    y--; x++; dy -= 2 * a2; dx += 2 * b2; d2 += dx - dy + a2;
                }
            }
        }
        if ((type & 0x40) === 0) this.flushScreen();
    }

    public WriteBlock(x: number, y: number, w: number, h: number, type: number, addr: number) {
        const toVram = (type & 0x40) !== 0; // bit 6 = 1 -> VRAM
        const hFlip = (type & 0x20) !== 0; // bit 5 = 1 -> horizontal flip
        const reverseDisplay = (type & 0x08) !== 0; // bit 3 = 1 -> not
        const drawMode = type & 0x07; // 1:copy 2:not 3:or 4:and 5:xor

        const offset = toVram ? this.getVramOffset() : this.getGbufOffset();

        if (this.graphMode === 8) {
            for (let r = 0; r < h; r++) {
                for (let c = 0; c < w; c++) {
                    let sourcePixel = this.memory[addr + r * w + (hFlip ? (w - 1 - c) : c)];
                    if (reverseDisplay) sourcePixel = 255 - sourcePixel;

                    const screenX = x + c;
                    const screenY = y + r;
                    if (screenX < 0 || screenX >= SCREEN_WIDTH || screenY < 0 || screenY >= SCREEN_HEIGHT) continue;

                    const byteIdx = offset + screenY * SCREEN_WIDTH + screenX;
                    const oldPixel = this.memory[byteIdx];
                    let newPixel = oldPixel;
                    switch (drawMode) {
                        case 1: newPixel = sourcePixel; break;
                        case 2: newPixel = 255 - sourcePixel; break;
                        case 3: newPixel = oldPixel | sourcePixel; break;
                        case 4: newPixel = oldPixel & sourcePixel; break;
                        case 5: newPixel = oldPixel ^ sourcePixel; break;
                    }
                    this.memory[byteIdx] = newPixel;
                }
            }
        } else if (this.graphMode === 4) {
            const bytesPerRow = Math.ceil(w / 2);
            for (let r = 0; r < h; r++) {
                for (let c = 0; c < w; c++) {
                    let sourceC = hFlip ? (w - 1 - c) : c;
                    const sourceByte = this.memory[addr + r * bytesPerRow + Math.floor(sourceC / 2)];
                    let sourcePixel = (sourceC % 2 === 0) ? (sourceByte >> 4) : (sourceByte & 0x0F);
                    if (reverseDisplay) sourcePixel = 15 - sourcePixel;

                    const screenX = x + c;
                    const screenY = y + r;
                    if (screenX < 0 || screenX >= SCREEN_WIDTH || screenY < 0 || screenY >= SCREEN_HEIGHT) continue;

                    const byteIdx = offset + Math.floor((screenY * SCREEN_WIDTH + screenX) / 2);
                    const isLeft = (screenX % 2 === 0);
                    const oldPixel = isLeft ? (this.memory[byteIdx] >> 4) : (this.memory[byteIdx] & 0x0F);
                    let newPixel = oldPixel;
                    switch (drawMode) {
                        case 1: newPixel = sourcePixel; break;
                        case 2: newPixel = 15 - sourcePixel; break;
                        case 3: newPixel = oldPixel | sourcePixel; break;
                        case 4: newPixel = oldPixel & sourcePixel; break;
                        case 5: newPixel = oldPixel ^ sourcePixel; break;
                    }
                    if (isLeft) {
                        this.memory[byteIdx] = (this.memory[byteIdx] & 0x0F) | (newPixel << 4);
                    } else {
                        this.memory[byteIdx] = (this.memory[byteIdx] & 0xF0) | newPixel;
                    }
                }
            }
        } else {
            const bytesPerRow = Math.ceil(w / 8);
            for (let r = 0; r < h; r++) {
                const rowOffset = addr + r * bytesPerRow;
                for (let c = 0; c < w; c++) {
                    let sourceC = hFlip ? (w - 1 - c) : c;
                    let bit = (this.memory[rowOffset + Math.floor(sourceC / 8)] >> (7 - (sourceC % 8))) & 1;
                    if (reverseDisplay) bit = 1 - bit;

                    const screenX = x + c;
                    const screenY = y + r;
                    if (screenX < 0 || screenX >= SCREEN_WIDTH || screenY < 0 || screenY >= SCREEN_HEIGHT) continue;

                    const byteIdx = offset + Math.floor((screenY * SCREEN_WIDTH + screenX) / 8);
                    const bIdx = 7 - ((screenY * SCREEN_WIDTH + screenX) % 8);
                    const oldPixel = (this.memory[byteIdx] >> bIdx) & 1;
                    let newPixel = oldPixel;
                    switch (drawMode) {
                        case 1: newPixel = bit; break;
                        case 2: newPixel = 1 - bit; break;
                        case 3: newPixel = oldPixel | bit; break;
                        case 4: newPixel = oldPixel & bit; break;
                        case 5: newPixel = oldPixel ^ bit; break;
                    }
                    if (newPixel) this.memory[byteIdx] |= (1 << bIdx);
                    else this.memory[byteIdx] &= ~(1 << bIdx);
                }
            }
        }
        if (toVram) this.flushScreen();
    }

    public GetBlock(x: number, y: number, w: number, h: number, type: number, dataAddr: number) {
        const fromVram = (type & 0x40) !== 0;
        const offset = fromVram ? this.getVramOffset() : this.getGbufOffset();

        x = x & ~7;
        w = w & ~7;

        if (this.graphMode === 8) {
            for (let r = 0; r < h; r++) {
                for (let c = 0; c < w; c++) {
                    const screenX = x + c;
                    const screenY = y + r;
                    let pixel = 0;
                    if (screenX >= 0 && screenX < SCREEN_WIDTH && screenY >= 0 && screenY < SCREEN_HEIGHT) {
                        pixel = this.memory[offset + screenY * SCREEN_WIDTH + screenX];
                    }
                    this.memory[dataAddr + r * w + c] = pixel;
                }
            }
        } else if (this.graphMode === 4) {
            const bytesPerRow = Math.ceil(w / 2);
            for (let r = 0; r < h; r++) {
                for (let c = 0; c < w; c++) {
                    const screenX = x + c;
                    const screenY = y + r;
                    let pixel = 0;
                    if (screenX >= 0 && screenX < SCREEN_WIDTH && screenY >= 0 && screenY < SCREEN_HEIGHT) {
                        const sourceByte = this.memory[offset + Math.floor((screenY * SCREEN_WIDTH + screenX) / 2)];
                        pixel = (screenX % 2 === 0) ? (sourceByte >> 4) : (sourceByte & 0x0F);
                    }
                    const bytePos = dataAddr + r * bytesPerRow + Math.floor(c / 2);
                    if (c % 2 === 0) {
                        this.memory[bytePos] = (this.memory[bytePos] & 0x0F) | (pixel << 4);
                    } else {
                        this.memory[bytePos] = (this.memory[bytePos] & 0xF0) | pixel;
                    }
                }
            }
        } else {
            const bytesPerRow = w >> 3;
            for (let r = 0; r < h; r++) {
                const rowOffset = dataAddr + r * bytesPerRow;
                for (let c = 0; c < w; c++) {
                    const screenX = x + c;
                    const screenY = y + r;
                    let pixel = 0;
                    if (screenX >= 0 && screenX < SCREEN_WIDTH && screenY >= 0 && screenY < SCREEN_HEIGHT) {
                        const byteIdx = offset + Math.floor((screenY * SCREEN_WIDTH + screenX) / 8);
                        const bIdx = 7 - (screenX % 8);
                        pixel = (this.memory[byteIdx] >> bIdx) & 1;
                    }
                    const bytePos = rowOffset + (c >> 3);
                    const bIdxData = 7 - (c & 7);
                    if (pixel) this.memory[bytePos] |= (1 << bIdxData);
                    else this.memory[bytePos] &= ~(1 << bIdxData);
                }
            }
        }
    }

    public FillArea(x: number, y: number, type: number) {
        if (x < 0 || x >= SCREEN_WIDTH || y < 0 || y >= SCREEN_HEIGHT) return;
        const toVram = (type & 0x40) !== 0;
        const offset = toVram ? this.getVramOffset() : this.getGbufOffset();

        const getP = (cx: number, cy: number) => {
            const i = cy * SCREEN_WIDTH + cx;
            if (this.graphMode === 8) return this.memory[offset + i];
            if (this.graphMode === 4) {
                const b = this.memory[offset + Math.floor(i / 2)];
                return (i % 2 === 0) ? (b >> 4) : (b & 0x0F);
            }
            return (this.memory[offset + Math.floor(i / 8)] >> (7 - (i % 8))) & 1;
        };

        const setP = (cx: number, cy: number, val: number) => {
            const i = cy * SCREEN_WIDTH + cx;
            if (this.graphMode === 8) this.memory[offset + i] = val;
            else if (this.graphMode === 4) {
                const byteIdx = offset + Math.floor(i / 2);
                if (i % 2 === 0) this.memory[byteIdx] = (this.memory[byteIdx] & 0x0F) | (val << 4);
                else this.memory[byteIdx] = (this.memory[byteIdx] & 0xF0) | val;
            } else {
                const byteIdx = offset + Math.floor(i / 8);
                const bitIdx = 7 - (i % 8);
                if (val) this.memory[byteIdx] |= (1 << bitIdx);
                else this.memory[byteIdx] &= ~(1 << bitIdx);
            }
        };

        const targetColor = getP(x, y);
        let fillColor = 1;
        if (this.graphMode > 1) fillColor = this.fgColor;
        if (targetColor === fillColor) return;

        const stack = [[x, y]];
        while (stack.length > 0) {
            const [cx, cy] = stack.pop()!;
            if (cx < 0 || cx >= SCREEN_WIDTH || cy < 0 || cy >= SCREEN_HEIGHT) continue;
            if (getP(cx, cy) === targetColor) {
                setP(cx, cy, fillColor);
                stack.push([cx + 1, cy], [cx - 1, cy], [cx, cy + 1], [cx, cy - 1]);
            }
        }
        if (toVram) this.flushScreen();
    }

    public XDraw(mode: number) {
        const width = SCREEN_WIDTH;
        const height = SCREEN_HEIGHT;
        const bufferSize = (width * height) / 8;
        const tempBuf = new Uint8Array(this.memory.buffer, this.memory.byteOffset + this.getGbufOffset(), bufferSize).slice();

        const getBit = (buf: Uint8Array, x: number, y: number) => {
            const i = y * width + x;
            return (buf[Math.floor(i / 8)] >> (7 - (i % 8))) & 1;
        };

        const setBit = (buf: Uint8Array, x: number, y: number, val: number) => {
            const i = y * width + x;
            const byteIdx = Math.floor(i / 8);
            const bitIdx = 7 - (i % 8);
            if (val) buf[byteIdx] |= (1 << bitIdx);
            else buf[byteIdx] &= ~(1 << bitIdx);
        };

        const newBuf = new Uint8Array(bufferSize);

        if (mode === 0) { // Left shift
            for (let y = 0; y < height; y++) {
                for (let x = 0; x < width - 1; x++) {
                    if (getBit(tempBuf, x + 1, y)) setBit(newBuf, x, y, 1);
                }
            }
        } else if (mode === 1) { // Right shift
            for (let y = 0; y < height; y++) {
                for (let x = 1; x < width; x++) {
                    if (getBit(tempBuf, x - 1, y)) setBit(newBuf, x, y, 1);
                }
            }
        } else if (mode === 4) { // Horizontal flip
            for (let y = 0; y < height; y++) {
                for (let x = 0; x < width; x++) {
                    if (getBit(tempBuf, width - 1 - x, y)) setBit(newBuf, x, y, 1);
                }
            }
        } else if (mode === 5) { // Vertical flip
            for (let y = 0; y < height; y++) {
                for (let x = 0; x < width; x++) {
                    if (getBit(tempBuf, x, height - 1 - y)) setBit(newBuf, x, y, 1);
                }
            }
        } else {
            return;
        }

        this.memory.set(newBuf, this.getGbufOffset());
    }
}
