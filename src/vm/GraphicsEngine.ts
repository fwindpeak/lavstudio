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
            if (mask & (1 << (7 - i))) continue;

            const start = TEXT_OFFSET + i * lineChars;

            // Clear specific line in VRAM
            // Note: In color mode, text might still be drawn as 1-bit or converted.
            // For now, let's keep text rendering 1-bit but clearing handles the mode.
            if (this.graphMode === 1) {
                const pixelsLineToClear = SCREEN_WIDTH * size;
                const bytesLineToClear = Math.ceil(pixelsLineToClear / 8);
                this.memory.fill(0, VRAM_OFFSET + i * bytesLineToClear, VRAM_OFFSET + (i + 1) * bytesLineToClear);
            } else {
                const pixelsLineToClear = SCREEN_WIDTH * size;
                const multiplier = (this.graphMode === 8 ? 1 : 0.5);
                this.memory.fill(0, VRAM_OFFSET + i * pixelsLineToClear * multiplier, VRAM_OFFSET + (i + 1) * pixelsLineToClear * multiplier);
            }

            // Find end of string or end of line (whichever comes first)
            let end = start;
            while (end < start + lineChars && this.memory[end] !== 0) end++;

            const bytes = this.memory.subarray(start, end);
            if (bytes.length > 0) {
                // Direct to VRAM (bit 6 = 0)
                const mode = (size === 16 ? 0x80 : 0) | 0x01;
                this.drawText(0, i * size, bytes, size, mode);
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

    public drawText(x: number, y: number, bytes: Uint8Array, size: number, mode: number) {
        if (!this.fontData) return;
        let curX = x;
        const color = (mode & 0x07) === 1 ? (this.graphMode > 1 ? this.fgColor : 1) :
            ((mode & 0x07) === 0 ? (this.graphMode > 1 ? this.bgColor : 0) : (mode & 0x07));
        let i = 0;
        while (i < bytes.length) {
            const b1 = bytes[i];
            if (b1 < 0x80) {
                this.drawChar(curX, y, b1, size, mode, color);
                curX += (size === 16 ? 8 : 6); i++;
            } else {
                const b2 = bytes[i + 1];
                if (b2) {
                    this.drawChinese(curX, y, b1, b2, size, mode, color);
                    curX += size;
                    i += 2;
                } else i++;
            }
        }
    }

    public drawChar(x: number, y: number, code: number, size: number, mode: number, color: number = 1) {
        const base = this.fontOffsets[size === 16 ? 0 : 1];
        const charIdx = code - 32;
        if (charIdx < 0 || charIdx >= 95) return;
        const width = size === 16 ? 8 : 6;
        const offset = base + charIdx * size;
        for (let r = 0; r < size; r++) {
            const byte = this.fontData![offset + r];
            for (let c = 0; c < width; c++) if ((byte >> (7 - c)) & 1) this.setPixel(x + c, y + r, color, mode);
        }
    }

    public drawChinese(x: number, y: number, b1: number, b2: number, size: number, mode: number, color: number = 1) {
        const base = this.fontOffsets[size === 16 ? 2 : 3];
        const rIdx = b1 - 0xA1, cIdx = b2 - 0xA1;
        if (rIdx < 0 || rIdx >= 94 || cIdx < 0 || cIdx >= 94) return;
        const charBytes = size === 16 ? 32 : 24;
        const offset = base + (rIdx * 94 + cIdx) * charBytes;
        for (let r = 0; r < size; r++) {
            const bL = this.fontData![offset + r * 2], bR = this.fontData![offset + r * 2 + 1];
            for (let b = 0; b < 8; b++) if ((bL >> (7 - b)) & 1) this.setPixel(x + b, y + r, color, mode);
            for (let b = 0; b < size - 8; b++) if ((bR >> (7 - b)) & 1) this.setPixel(x + 8 + b, y + r, color, mode);
        }
    }

    public drawBox(x: number, y: number, w: number, h: number, mode: number = 1) {
        let color = mode & 0x07;
        if (this.graphMode > 1) {
            if (color === 0) color = this.bgColor;
            else if (color === 1) color = this.fgColor;
        }
        // Top and bottom edges (excluding corners)
        for (let i = x + 1; i < x + w - 1; i++) {
            this.setPixel(i, y, color, mode);
            this.setPixel(i, y + h - 1, color, mode);
        }
        // Left and right edges (including corners)
        for (let i = y; i < y + h; i++) {
            this.setPixel(x, i, color, mode);
            this.setPixel(x + w - 1, i, color, mode);
        }
    }

    public drawFillBox(x: number, y: number, w: number, h: number, mode: number = 1) {
        let color = mode & 0x07;
        if (this.graphMode > 1) {
            if (color === 0) color = this.bgColor;
            else if (color === 1) color = this.fgColor;
        }
        for (let i = y; i < y + h; i++) {
            for (let j = x; j < x + w; j++) {
                this.setPixel(j, i, color, mode);
            }
        }
    }

    public drawLine(x1: number, y1: number, x2: number, y2: number, mode: number = 1) {
        let color = mode & 0x07;
        if (this.graphMode > 1) {
            if (color === 0) color = this.bgColor;
            else if (color === 1) color = this.fgColor;
        }
        const dx = Math.abs(x2 - x1), dy = Math.abs(y2 - y1);
        const sx = x1 < x2 ? 1 : -1, sy = y1 < y2 ? 1 : -1;
        let err = dx - dy;
        while (true) {
            this.setPixel(x1, y1, color, mode);
            if (x1 === x2 && y1 === y2) break;
            const e2 = 2 * err;
            if (e2 > -dy) { err -= dy; x1 += sx; }
            if (e2 < dx) { err += dx; y1 += sy; }
        }
    }

    public drawCircle(xc: number, yc: number, r: number, mode: number = 1) {
        let color = mode & 0x07;
        if (this.graphMode > 1) {
            if (color === 0) color = this.bgColor;
            else if (color === 1) color = this.fgColor;
        }
        let x = 0, y = r;
        let d = 3 - 2 * r;
        const drawPoints = (xc: number, yc: number, x: number, y: number) => {
            this.setPixel(xc + x, yc + y, color, mode); this.setPixel(xc - x, yc + y, color, mode);
            this.setPixel(xc + x, yc - y, color, mode); this.setPixel(xc - x, yc - y, color, mode);
            this.setPixel(xc + y, yc + x, color, mode); this.setPixel(xc - y, yc + x, color, mode);
            this.setPixel(xc + y, yc - x, color, mode); this.setPixel(xc - y, yc - x, color, mode);
        };
        drawPoints(xc, yc, x, y);
        while (y >= x) {
            x++;
            if (d > 0) { y--; d = d + 4 * (x - y) + 10; }
            else d = d + 4 * x + 6;
            drawPoints(xc, yc, x, y);
        }
    }

    public drawFillCircle(xc: number, yc: number, r: number, mode: number = 1) {
        for (let i = 0; i <= r; i++) {
            let d = Math.floor(Math.sqrt(r * r - i * i));
            this.drawLine(xc - d, yc + i, xc + d, yc + i, mode | 1);
            this.drawLine(xc - d, yc - i, xc + d, yc - i, mode | 1);
        }
    }

    public drawEllipse(xc: number, yc: number, rx: number, ry: number, fill: boolean, mode: number = 1) {
        if (fill) {
            for (let i = -ry; i <= ry; i++) {
                let dx = Math.floor(rx * Math.sqrt(1 - (i * i) / (ry * ry)));
                this.drawLine(xc - dx, yc + i, xc + dx, yc + i, mode);
            }
        } else {
            let x = 0, y = ry;
            let rx2 = rx * rx, ry2 = ry * ry;
            let tworx2 = 2 * rx2, twory2 = 2 * ry2;
            let px = 0, py = tworx2 * y;
            let p = Math.round(ry2 - (rx2 * ry) + (0.25 * rx2));
            const drawPoints = (xc: number, yc: number, x: number, y: number) => {
                this.setPixel(xc + x, yc + y, 1, mode); this.setPixel(xc - x, yc + y, 1, mode);
                this.setPixel(xc + x, yc - y, 1, mode); this.setPixel(xc - x, yc - y, 1, mode);
            };
            drawPoints(xc, yc, x, y);
            while (px < py) {
                x++; px += twory2;
                if (p < 0) p += ry2 + px;
                else { y--; py -= tworx2; p += ry2 + px - py; }
                drawPoints(xc, yc, x, y);
            }
            p = Math.round(ry2 * (x + 0.5) * (x + 0.5) + rx2 * (y - 1) * (y - 1) - rx2 * ry2);
            while (y > 0) {
                y--; py -= tworx2;
                if (p > 0) p += rx2 - py;
                else { x++; px += twory2; p += rx2 - py + px; }
                drawPoints(xc, yc, x, y);
            }
        }
    }

    public fillArea(x: number, y: number, mode: number) {
        // Basic seed fill (flood fill) implementation
        const targetColor = this.getPixel(x, y);
        const fillColor = 1; // Usually fills with 1
        if (targetColor === fillColor) return;

        const stack = [[x, y]];
        while (stack.length > 0) {
            const [cx, cy] = stack.pop()!;
            if (cx < 0 || cx >= SCREEN_WIDTH || cy < 0 || cy >= SCREEN_HEIGHT) continue;
            if (this.getPixel(cx, cy) === targetColor) {
                this.setPixel(cx, cy, fillColor, mode); // Mode is already settled by handler
                stack.push([cx + 1, cy], [cx - 1, cy], [cx, cy + 1], [cx, cy - 1]);
            }
        }
    }

    public xDraw(mode: number) {
        const width = SCREEN_WIDTH;
        const height = SCREEN_HEIGHT;
        const bufferSize = (width * height) / 8;
        const tempBuf = new Uint8Array(this.memory.buffer, this.memory.byteOffset + GBUF_OFFSET, bufferSize).slice();

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

        this.memory.set(newBuf, GBUF_OFFSET);
    }

    public getBlock(x: number, y: number, w: number, h: number, mode: number, dataAddr: number) {
        if (this.graphMode === 8) {
            for (let r = 0; r < h; r++) {
                for (let c = 0; c < w; c++) {
                    const pixel = this.getPixel(x + c, y + r, mode);
                    this.memory[dataAddr + r * w + c] = pixel;
                }
            }
        } else if (this.graphMode === 4) {
            const bytesPerRow = (w + 1) >> 1;
            for (let r = 0; r < h; r++) {
                const rowOffset = dataAddr + r * bytesPerRow;
                for (let c = 0; c < w; c++) {
                    const pixel = this.getPixel(x + c, y + r, mode) & 0x0F;
                    if (c % 2 === 0) {
                        this.memory[rowOffset + (c >> 1)] = (this.memory[rowOffset + (c >> 1)] & 0x0F) | (pixel << 4);
                    } else {
                        this.memory[rowOffset + (c >> 1)] = (this.memory[rowOffset + (c >> 1)] & 0xF0) | pixel;
                    }
                }
            }
        } else {
            const bytesPerRow = (w + 7) >> 3;
            for (let r = 0; r < h; r++) {
                for (let c = 0; c < w; c++) {
                    const pixel = this.getPixel(x + c, y + r, mode);
                    const byteIdx = dataAddr + r * bytesPerRow + (c >> 3);
                    const bitIdx = 7 - (c & 7);
                    if (pixel) this.memory[byteIdx] |= (1 << bitIdx);
                    else this.memory[byteIdx] &= ~(1 << bitIdx);
                }
            }
        }
    }
}
