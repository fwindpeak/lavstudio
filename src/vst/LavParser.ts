// ============================================================================
// LavaX (.lav) File Format Parser (GVM ISA V3.0)
// ============================================================================

/** LavaX 文件头信息结构 */
export interface LavHeader {
    magic: string;             // 0x00: 魔数 'LAV'
    version: number;           // 0x03: 版本号
    strMask: number;           // 0x05: 字符串 XOR 掩码 (0=无掩码)
    arrayInitSpace: number;    // 0x06: LOADALL 数据段大小 (u16)
    entryPoint: number;        // 0x08: 程序入口地址 (u24, 小端序)
}

/** 操作数类型枚举，用于驱动解码器抓取后续字节 */
export enum OperandType {
    NONE,       // 无操作数 (0字节)
    U8,         // 无符号8位整数 (1字节)
    I16,        // 有符号16位整数 (2字节)
    U16,        // 无符号16位整数 (2字节)
    U24,        // 无符号24位整数 (3字节)
    I32,        // 有符号32位整数 (4字节)
    STR_Z,      // 以 \0 结尾的字符串 (变长)
    INIT_DATA   // 特殊: 复合数据初始化 (2B地址 + 2B长度 + N字节数据)
}

/** 指令字典定义 */
export interface OpcodeDef {
    mnemonic: string;
    opType: OperandType;
}

/** 单条解析出的指令 AST 节点 */
export interface LavInstruction {
    offset: number;            // 指令在文件中的绝对物理偏移
    opcode: number;            // 16进制指令码
    mnemonic: string;          // 助记符
    length: number;            // 指令总长度(包括操作码本身和操作数)
    operands?: any;            // 操作数数据(根据 opType 决定结构)
}

/** LavaX 解析结果集合 */
export interface LavProgram {
    header: LavHeader;
    instructions: LavInstruction[];
}

// ============================================================================
// 1. 指令集映射表 (Opcode Dictionary)
// 包含文档中所有指令，严格定义操作数长度
// ============================================================================
const OPCODE_MAP: Record<number, OpcodeDef> = {
    // 数据推送
    0x01: { mnemonic: 'PUSH_B', opType: OperandType.U8 },
    0x02: { mnemonic: 'PUSH_W', opType: OperandType.I16 },
    0x03: { mnemonic: 'PUSH_D', opType: OperandType.I32 },

    // 全局寻址 (u16)
    0x04: { mnemonic: 'LD_G_B', opType: OperandType.U16 },
    0x05: { mnemonic: 'LD_G_W', opType: OperandType.U16 },
    0x06: { mnemonic: 'LD_G_D', opType: OperandType.U16 },
    0x07: { mnemonic: 'LD_G_O_B', opType: OperandType.U16 },
    0x08: { mnemonic: 'LD_G_O_W', opType: OperandType.U16 },
    0x09: { mnemonic: 'LD_G_O_D', opType: OperandType.U16 },
    0x0A: { mnemonic: 'LEA_G_B', opType: OperandType.U16 },
    0x0B: { mnemonic: 'LEA_G_W', opType: OperandType.U16 },
    0x0C: { mnemonic: 'LEA_G_D', opType: OperandType.U16 },

    // 字符串压栈 (变长, null 结尾)
    0x0D: { mnemonic: 'PUSH_STR', opType: OperandType.STR_Z },

    // 局部寻址 (i16)
    0x0E: { mnemonic: 'LD_L_B', opType: OperandType.I16 },
    0x0F: { mnemonic: 'LD_L_W', opType: OperandType.I16 },
    0x10: { mnemonic: 'LD_L_D', opType: OperandType.I16 },
    0x11: { mnemonic: 'LD_L_O_B', opType: OperandType.I16 },
    0x12: { mnemonic: 'LD_L_O_W', opType: OperandType.I16 },
    0x13: { mnemonic: 'LD_L_O_D', opType: OperandType.I16 },
    0x14: { mnemonic: 'LEA_L_B', opType: OperandType.I16 },
    0x15: { mnemonic: 'LEA_L_W', opType: OperandType.I16 },
    0x16: { mnemonic: 'LEA_L_D', opType: OperandType.I16 },

    // 特殊寻址 (u16)
    0x17: { mnemonic: 'LEA_OFT', opType: OperandType.U16 },
    0x18: { mnemonic: 'LEA_L_PH', opType: OperandType.U16 },
    0x19: { mnemonic: 'LEA_ABS', opType: OperandType.U16 },

    // 无操作数指令
    0x1A: { mnemonic: 'LD_TEXT', opType: OperandType.NONE },
    0x1B: { mnemonic: 'LD_GRAP', opType: OperandType.NONE },
    0x1C: { mnemonic: 'NEG', opType: OperandType.NONE },
    0x1D: { mnemonic: 'INC_PRE', opType: OperandType.NONE },
    0x1E: { mnemonic: 'DEC_PRE', opType: OperandType.NONE },
    0x1F: { mnemonic: 'INC_POS', opType: OperandType.NONE },
    0x20: { mnemonic: 'DEC_POS', opType: OperandType.NONE },
    0x21: { mnemonic: 'ADD', opType: OperandType.NONE },
    0x22: { mnemonic: 'SUB', opType: OperandType.NONE },
    0x23: { mnemonic: 'AND', opType: OperandType.NONE },
    0x24: { mnemonic: 'OR', opType: OperandType.NONE },
    0x25: { mnemonic: 'NOT', opType: OperandType.NONE },
    0x26: { mnemonic: 'XOR', opType: OperandType.NONE },
    0x27: { mnemonic: 'L_AND', opType: OperandType.NONE },
    0x28: { mnemonic: 'L_OR', opType: OperandType.NONE },
    0x29: { mnemonic: 'L_NOT', opType: OperandType.NONE },
    0x2A: { mnemonic: 'MUL', opType: OperandType.NONE },
    0x2B: { mnemonic: 'DIV', opType: OperandType.NONE },
    0x2C: { mnemonic: 'MOD', opType: OperandType.NONE },
    0x2D: { mnemonic: 'SHL', opType: OperandType.NONE },
    0x2E: { mnemonic: 'SHR', opType: OperandType.NONE },
    0x2F: { mnemonic: 'EQ', opType: OperandType.NONE },
    0x30: { mnemonic: 'NEQ', opType: OperandType.NONE },
    0x31: { mnemonic: 'LE', opType: OperandType.NONE },
    0x32: { mnemonic: 'GE', opType: OperandType.NONE },
    0x33: { mnemonic: 'GT', opType: OperandType.NONE },
    0x34: { mnemonic: 'LT', opType: OperandType.NONE },
    0x35: { mnemonic: 'STORE', opType: OperandType.NONE },
    0x36: { mnemonic: 'LD_IND', opType: OperandType.NONE },
    0x38: { mnemonic: 'POP', opType: OperandType.NONE },

    // 流程控制与复杂指令
    0x39: { mnemonic: 'JZ', opType: OperandType.U24 },
    0x3B: { mnemonic: 'JMP', opType: OperandType.U24 },
    0x3C: { mnemonic: 'SPACE', opType: OperandType.U16 },
    0x3D: { mnemonic: 'CALL', opType: OperandType.U24 },
    0x3E: { mnemonic: 'FUNC', opType: OperandType.U24 }, // u16 offset + u8 arg count = 3 bytes
    0x3F: { mnemonic: 'RET', opType: OperandType.NONE },
    0x40: { mnemonic: 'EXIT', opType: OperandType.NONE },
    0x41: { mnemonic: 'INIT', opType: OperandType.INIT_DATA }, // 变长
    0x42: { mnemonic: 'LD_GBUF', opType: OperandType.NONE },
    0x43: { mnemonic: 'MASK', opType: OperandType.U8 },
    0x44: { mnemonic: 'LOADALL', opType: OperandType.NONE },

    // 立即内联运算 (i16)
    0x45: { mnemonic: 'ADD_C', opType: OperandType.I16 },
    0x46: { mnemonic: 'SUB_C', opType: OperandType.I16 },
    0x47: { mnemonic: 'MUL_C', opType: OperandType.I16 },
    0x48: { mnemonic: 'DIV_C', opType: OperandType.I16 },
    0x49: { mnemonic: 'MOD_C', opType: OperandType.I16 },
    0x4A: { mnemonic: 'SHL_C', opType: OperandType.I16 },
    0x4B: { mnemonic: 'SHR_C', opType: OperandType.I16 },
    0x4C: { mnemonic: 'EQ_C', opType: OperandType.I16 },
    0x4D: { mnemonic: 'NEQ_C', opType: OperandType.I16 },
    0x4E: { mnemonic: 'GT_C', opType: OperandType.I16 },
    0x4F: { mnemonic: 'LT_C', opType: OperandType.I16 },
    0x50: { mnemonic: 'GE_C', opType: OperandType.I16 },
    0x51: { mnemonic: 'LE_C', opType: OperandType.I16 },

    // 占位
    0xAD: { mnemonic: 'F_FLAG_MEMCPY', opType: OperandType.NONE }
};

// 注入系统调用 0x80 - 0xDF (全是无内联操作数，参数存在栈里)
const SYSCALLS = [
    "putchar", "getchar", "printf", "strcpy", "strlen", "SetScreen", "UpdateLCD",
    "Delay", "WriteBlock", "Refresh", "TextOut", "Block", "Rectangle", "exit",
    "ClearScreen", "abs", "rand", "srand", "Locate", "Inkey", "Point", "GetPoint",
    "Line", "Box", "Circle", "Ellipse", "Beep", "isalnum", "isalpha", "iscntrl",
    "isdigit", "isgraph", "islower", "isprint", "ispunct", "isspace", "isupper",
    "isxdigit", "strcat", "strchr", "strcmp", "strstr", "tolower", "toupper",
    "memset", "memcpy", "fopen", "fclose", "fread", "fwrite", "fseek", "ftell",
    "feof", "rewind", "getc", "putc", "sprintf", "MakeDir", "DeleteFile", "Getms",
    "CheckKey", "memmove", "Crc16", "Secret", "ChDir", "FileList", "GetTime",
    "SetTime", "GetWord", "XDraw", "ReleaseKey", "GetBlock", "Sin", "Cos",
    "FillArea", "PutKey", "FindWord", "PlayInit", "PlayFile", "PlayStops",
    "SetVolume", "PlaySleep", "opendir", "readdir", "rewinddir", "closedir",
    "Refresh2", "open_key", "close_key", "PlayWordVoice", "sysexecset",
    "open_uart", "close_uart", "write_uart", "read_uart", "RefreshIcon"
];

SYSCALLS.forEach((name, idx) => {
    const hex = 0x80 + idx;
    // 0xAD 会被复写为 memcpy (运行时实际效果)，这符合预期
    OPCODE_MAP[hex] = { mnemonic: `SYS_${name}`, opType: OperandType.NONE };
});

// ============================================================================
// 2. 字节流读取工具类 (Binary Reader)
// 支持 Little-Endian 小端序读取
// ============================================================================
class BinaryReader {
    private dataView: DataView;
    private buffer: Uint8Array;
    private ptr: number = 0;

    constructor(buffer: ArrayBuffer | Uint8Array) {
        this.buffer = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
        this.dataView = new DataView(this.buffer.buffer, this.buffer.byteOffset, this.buffer.byteLength);
    }

    public getOffset(): number { return this.ptr; }
    public isEOF(): boolean { return this.ptr >= this.buffer.length; }
    public skip(bytes: number) { this.ptr += bytes; }

    public readU8(): number {
        return this.dataView.getUint8(this.ptr++);
    }

    public readI16(): number {
        const val = this.dataView.getInt16(this.ptr, true); // true = Little Endian
        this.ptr += 2;
        return val;
    }

    public readU16(): number {
        const val = this.dataView.getUint16(this.ptr, true);
        this.ptr += 2;
        return val;
    }

    // GVM 的 3 字节数值为小端序: Low, Mid, High
    public readU24(): number {
        const low = this.readU8();
        const mid = this.readU8();
        const high = this.readU8();
        return low | (mid << 8) | (high << 16);
    }

    public readI32(): number {
        const val = this.dataView.getInt32(this.ptr, true);
        this.ptr += 4;
        return val;
    }

    // 提取以 \0 结尾的字符串 (作为原字节数组，保持异或特性)
    public readStringZBytes(): Uint8Array {
        const start = this.ptr;
        while (this.ptr < this.buffer.length && this.buffer[this.ptr] !== 0x00) {
            this.ptr++;
        }
        const length = this.ptr - start;
        this.ptr++; // 消费掉 '\0'
        return this.buffer.slice(start, start + length);
    }

    // 读取指定长度的纯字节流
    public readBytes(len: number): Uint8Array {
        const slice = this.buffer.slice(this.ptr, this.ptr + len);
        this.ptr += len;
        return slice;
    }
}

// ============================================================================
// 3. LavaX 主解析器类
// ============================================================================
export class LavParser {

    /**
     * 解析完整的 LavaX 文件
     * @param buffer 包含文件内容的二进制 buffer
     */
    public static parse(buffer: ArrayBuffer | Uint8Array): LavProgram {
        const reader = new BinaryReader(buffer);

        // 1. 解析头部
        const header = this.parseHeader(reader);

        // 2. 解析指令流
        const instructions: LavInstruction[] = [];
        while (!reader.isEOF()) {
            const inst = this.parseNextInstruction(reader);
            if (!inst) break;
            instructions.push(inst);
        }

        return { header, instructions };
    }

    private static parseHeader(reader: BinaryReader): LavHeader {
        // 魔数检查 (3字节)
        const magicBytes = reader.readBytes(3);
        const magic = String.fromCharCode(...magicBytes);
        if (magic !== 'LAV') {
            throw new Error(`Invalid Magic Number: Expected 'LAV', got '${magic}'`);
        }

        const version = reader.readU8();       // 0x03
        reader.skip(1);                        // 0x04 填充
        const strMask = reader.readU8();       // 0x05: 字符串掩码
        const arrayInitSpace = reader.readU16(); // 0x06-0x07
        const entryPoint = reader.readU24();   // 0x08-0x0A: 入口地址 (24位)
        reader.skip(5);                        // 0x0B-0x0F 填充

        return { magic, version, strMask, arrayInitSpace, entryPoint };
    }

    private static parseNextInstruction(reader: BinaryReader): LavInstruction | null {
        if (reader.isEOF()) return null;

        const startOffset = reader.getOffset();
        const opcode = reader.readU8();

        // 获取指令定义
        const def = OPCODE_MAP[opcode] || { mnemonic: `UNKNOWN_0x${opcode.toString(16)}`, opType: OperandType.NONE };

        let operands: any = undefined;

        // 根据操作数类型安全地拉取对应字节
        switch (def.opType) {
            case OperandType.NONE:
                break;
            case OperandType.U8:
                operands = reader.readU8();
                break;
            case OperandType.I16:
                operands = reader.readI16();
                break;
            case OperandType.U16:
                operands = reader.readU16();
                break;
            case OperandType.U24:
                // 用于 JMP, CALL, FUNC。如果是 FUNC，实际是 {offset: u16, args: u8}
                operands = reader.readU24();
                break;
            case OperandType.I32:
                operands = reader.readI32();
                break;
            case OperandType.STR_Z:
                // 由于存在 strMask，直接保存底层 bytes
                operands = reader.readStringZBytes();
                break;
            case OperandType.INIT_DATA:
                // INIT 指令 0x41: 复合初始化 (文档定义: u16地址 + u16长度 + bytes数据)
                const addr = reader.readU16();
                const len = reader.readU16();
                const dataBytes = reader.readBytes(len);
                operands = { targetAddr: addr, dataLength: len, data: dataBytes };
                break;
            default:
                break;
        }

        const length = reader.getOffset() - startOffset;

        return {
            offset: startOffset,
            opcode: opcode,
            mnemonic: def.mnemonic,
            length: length,
            operands: operands
        };
    }
}