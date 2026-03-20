
import { Op, SystemOp } from '../types';
import iconv from 'iconv-lite';

function encodeToGBK(str: string): number[] {
    try {
        const buf = iconv.encode(str, 'gbk');
        return Array.from(buf);
    } catch (e) {
        // return Array.from(str).map(c => c.charCodeAt(0) & 0xFF);
    }
    return Array.from(str).map(c => c.charCodeAt(0) & 0xFF);
}

function unescapeString(str: string): string {
    return str.replace(/\\n/g, '\n')
        .replace(/\\r/g, '\r')
        .replace(/\\t/g, '\t')
        .replace(/\\"/g, '"')
        .replace(/\\\\/g, '\\');
}

export class LavaXAssembler {
    assemble(asmSource: string): Uint8Array {
        const lines = asmSource.split('\n').map(l => l.trim()).filter(l => l && !l.startsWith(';'));
        const code: number[] = [];
        const labels: Map<string, number> = new Map();
        const fixups: { pos: number, label: string, size: 2 | 3 | 4 }[] = [];

        let currentPos = 0;
        for (const line of lines) {
            if (line.endsWith(':')) { labels.set(line.slice(0, -1), currentPos); continue; }
            const parts = line.split(/\s+/);
            const opcodeStr = parts[0].toUpperCase();
            const op = (Op as any)[opcodeStr];
            const sysOp = (SystemOp as any)[parts[0]];

            if (op !== undefined) {
                currentPos += 1;
                if ([Op.PUSH_B, Op.MASK].includes(op)) currentPos += 1;
                else if ([Op.PUSH_W, Op.LD_G_B, Op.LD_G_W, Op.LD_G_D,
                Op.LD_G_O_B, Op.LD_G_O_W, Op.LD_G_O_D,
                Op.LEA_G_B, Op.LEA_G_W, Op.LEA_G_D, Op.LD_L_B, Op.LD_L_W, Op.LD_L_D,
                Op.LD_L_O_B, Op.LD_L_O_W, Op.LD_L_O_D,
                Op.LEA_L_B, Op.LEA_L_W, Op.LEA_L_D, Op.LEA_OFT, Op.LEA_L_PH, Op.LEA_ABS,
                Op.SPACE].includes(op)) currentPos += 2;
                else if ([Op.JZ, Op.JNZ, Op.JMP, Op.CALL].includes(op)) currentPos += 3;
                else if ([Op.PUSH_D].includes(op)) currentPos += 4;
                else if (op === Op.FUNC) {
                    currentPos += 3; // u24: 1B params + 2B space
                } else if (op === Op.PUSH_STR) {
                    const start = line.indexOf('"');
                    const end = line.lastIndexOf('"');
                    let str = (start !== -1 && end !== -1) ? line.substring(start + 1, end) : "";
                    str = unescapeString(str);
                    currentPos += encodeToGBK(str).length + 1;
                } else if (op === Op.INIT) {
                    // INIT addr len data...
                    const len = parseInt(parts[2]);
                    currentPos += 4 + len;
                }
            } else if (sysOp !== undefined) {
                currentPos += 1;
            }
        }

        for (const line of lines) {
            if (line.endsWith(':')) continue;
            const parts = line.split(/\s+/);
            const opcodeStr = parts[0].toUpperCase();
            const op = (Op as any)[opcodeStr];
            const sysOp = (SystemOp as any)[parts[0]];

            if (op !== undefined) {
                code.push(op);
                const arg = parts[1];
                if ([Op.PUSH_B, Op.MASK].includes(op)) {
                    code.push(parseInt(arg) & 0xFF);
                } else if ([Op.PUSH_W, Op.LD_G_B, Op.LD_G_W, Op.LD_G_D,
                Op.LD_G_O_B, Op.LD_G_O_W, Op.LD_G_O_D,
                Op.LEA_G_B, Op.LEA_G_W, Op.LEA_G_D, Op.LD_L_B, Op.LD_L_W, Op.LD_L_D,
                Op.LD_L_O_B, Op.LD_L_O_W, Op.LD_L_O_D,
                Op.LEA_L_B, Op.LEA_L_W, Op.LEA_L_D, Op.LEA_OFT, Op.LEA_L_PH, Op.LEA_ABS,
                Op.SPACE].includes(op)) {
                    this.pushInt16(code, parseInt(arg));
                } else if (op === Op.INIT) {
                    this.pushInt16(code, parseInt(parts[1]));
                    const len = parseInt(parts[2]);
                    this.pushInt16(code, len);
                    const data = parts.slice(3).map(x => parseInt(x));
                    for (let i = 0; i < len; i++) {
                        code.push((data[i] || 0) & 0xFF);
                    }
                } else if ([Op.PUSH_D].includes(op)) {
                    this.pushInt32(code, parseInt(arg));
                }
                else if (op === Op.FUNC) {
                    // FUNC format: #NUM1(2B) = local_vars + 5, #NUM2(1B) = param_count
                    this.pushInt16(code, parseInt(parts[1])); // space (local_vars + 5)
                    code.push(parseInt(parts[2]) & 0xFF); // params
                } else if ([Op.JMP, Op.JZ, Op.JNZ, Op.CALL].includes(op)) {
                    fixups.push({ pos: code.length, label: arg, size: 3 });
                    this.pushInt24(code, 0);
                } else if (op === Op.PUSH_STR) {
                    let str = line.substring(line.indexOf('"') + 1, line.lastIndexOf('"'));
                    str = unescapeString(str);
                    const bytes = encodeToGBK(str);
                    bytes.forEach(b => code.push(b));
                    code.push(0);
                }
            } else if (sysOp !== undefined) {
                code.push(sysOp);
            }
        }

        for (const fix of fixups) {
            const addr = (labels.get(fix.label) ?? 0) + 16;
            if (fix.size === 3) {
                code[fix.pos] = addr & 0xFF;
                code[fix.pos + 1] = (addr >> 8) & 0xFF;
                code[fix.pos + 2] = (addr >> 16) & 0xFF;
            }
        }

        const binary = new Uint8Array(16 + code.length);
        // Header (16 bytes)
        // 0x00-0x02: 'LAV'
        binary.set([0x4C, 0x41, 0x56], 0);
        // 0x03: Version (v18)
        binary[3] = 0x12;
        // 0x04: Reserved
        binary[4] = 0x00;
        // 0x05: strMask (0 for default)
        binary[5] = 0x00;
        // 0x06-0x07: loadall Size (0 for now)
        binary[6] = 0x00;
        binary[7] = 0x00;
        // 0x08-0x0A: jp_var (Entry Point) - 24 bits
        const entryPoint = 16; // SPACE at 16
        binary[8] = entryPoint & 0xFF;
        binary[9] = (entryPoint >> 8) & 0xFF;
        binary[10] = (entryPoint >> 16) & 0xFF;
        // 0x0B-0x0F: Reserved/Padding
        binary.fill(0, 11, 16);

        binary.set(new Uint8Array(code), 16);
        return binary;
    }

    private pushInt16(ops: number[], val: number) {
        ops.push(val & 0xFF, (val >> 8) & 0xFF);
    }
    private pushInt24(ops: number[], val: number) {
        ops.push(val & 0xFF, (val >> 8) & 0xFF, (val >> 16) & 0xFF);
    }
    private pushInt32(ops: number[], val: number) {
        ops.push(val & 0xFF, (val >> 8) & 0xFF, (val >> 16) & 0xFF, (val >> 24) & 0xFF);
    }
}
