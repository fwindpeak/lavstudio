import {
  MEMORY_SIZE, Op, SystemOp,
  VRAM_OFFSET, GBUF_OFFSET, TEXT_OFFSET, HEAP_OFFSET,
  STRBUF_START, STRBUF_END, GBUF_OFFSET_LVM,
  HANDLE_TYPE_BYTE, HANDLE_TYPE_WORD, HANDLE_TYPE_DWORD, HANDLE_BASE_EBP
} from './types';
import { VirtualFileSystem } from './vm/VirtualFileSystem';
import { VFSStorageDriver } from './vm/VFSStorageDriver';
import { GraphicsEngine } from './vm/GraphicsEngine';
import { SyscallHandler } from './vm/SyscallHandler';

type OpHandler = () => void;

export class LavaXVM {
  private pc: number = 0;
  public sp: number = 0;
  private base: number = 0;
  private base2: number = 0;
  private strBufPtr: number = STRBUF_START;
  private strMask: number = 0; // V3.0 String Mask
  private lastValue: number = 0; // GVM Result Register (RR)
  public delayUntil: number = 0; 

  public memory = new Uint8Array(MEMORY_SIZE);
  private memView: DataView;
  public stk = new Int32Array(4096);
  private regBuf = new Int32Array(32);

  private fd = new Uint8Array(0) as Uint8Array;
  private fdView: DataView = new DataView(new ArrayBuffer(0));
  private codeLength = 0;

  public running = false;
  private resolveKeySignal: (() => void) | null = null;
  public debug = false;
  public startTime = Date.now();
  public keyBuffer: number[] = [];
  public currentKeyDown: number = 0;

  public vfs: VirtualFileSystem;
  public graphics: GraphicsEngine;
  public syscall: SyscallHandler;

  private ops: OpHandler[] = new Array(256).fill(() => {
    throw new Error(`Unknown opcode 0x${this.fd[this.pc - 1]?.toString(16)} at PC: ${this.pc - 1}`);
  });

  public onUpdateScreen: (imageData: ImageData) => void = () => { };
  public onLog: (msg: string) => void = () => { };
  public onFinished: () => void = () => { };

  constructor(vfsDriver?: VFSStorageDriver) {
    this.vfs = new VirtualFileSystem(vfsDriver);
    this.graphics = new GraphicsEngine(this.memory, (img) => this.onUpdateScreen(img));
    this.syscall = new SyscallHandler(this);
    this.memView = new DataView(this.memory.buffer);
    this.initOps();
  }

  private initOps() {
    const memory = this.memory;
    const memView = this.memView;
    const stk = this.stk;

    // Control
    this.ops[Op.NOP] = () => { };
    this.ops[Op.EXIT] = () => { this.running = false; };
    this.ops[Op.INIT] = () => {
      const dest = this.fdView.getUint16(this.pc, true);
      const len = this.fdView.getUint16(this.pc + 2, true);
      this.pc += 4;
      memory.set(this.fd.subarray(this.pc, this.pc + len), dest);
      this.pc += len;
    };
    this.ops[Op.LOADALL] = () => { };

    // Push
    this.ops[Op.PUSH_B] = () => { this.push(this.fd[this.pc++]); };
    this.ops[Op.PUSH_W] = () => { this.push(this.fdView.getInt16(this.pc, true)); this.pc += 2; };
    this.ops[Op.PUSH_D] = () => { this.push(this.fdView.getInt32(this.pc, true)); this.pc += 4; };

    // Load Global
    this.ops[Op.LD_G_B] = () => { this.push(memory[this.fdView.getUint16(this.pc, true)]); this.pc += 2; };
    this.ops[Op.LD_G_W] = () => { this.push(memView.getInt16(this.fdView.getUint16(this.pc, true), true)); this.pc += 2; };
    this.ops[Op.LD_G_D] = () => { this.push(memView.getInt32(this.fdView.getUint16(this.pc, true), true)); this.pc += 2; };

    // Load Local (Base Relative)
    const makeLoadLocal = (size: 1 | 2 | 4) => () => {
      const offset = this.fdView.getUint16(this.pc, true);
      const addr = (this.base + offset) & 0xFFFF;
      this.pc += 2;
      if (size === 1) this.push(memory[addr]);
      else if (size === 2) this.push(memView.getInt16(addr, true));
      else this.push(memView.getInt32(addr, true));
    };
    this.ops[Op.LD_L_B] = makeLoadLocal(1);
    this.ops[Op.LD_L_W] = makeLoadLocal(2);
    this.ops[Op.LD_L_D] = makeLoadLocal(4);

    // Load Indirect
    const makeLoadInd = (isGlobal: boolean, size: 1 | 2 | 4) => () => {
      let addr = isGlobal ? 0 : this.base;
      addr = (addr + this.fdView.getUint16(this.pc, true) + stk[this.sp - 1]) & 0xFFFF;
      this.pc += 2;
      if (size === 1) stk[this.sp - 1] = memory[addr];
      else if (size === 2) stk[this.sp - 1] = memView.getInt16(addr, true);
      else stk[this.sp - 1] = memView.getInt32(addr, true);
    };
    this.ops[Op.LD_G_O_B] = makeLoadInd(true, 1);
    this.ops[Op.LD_G_O_W] = makeLoadInd(true, 2);
    this.ops[Op.LD_G_O_D] = makeLoadInd(true, 4);
    this.ops[Op.LD_L_O_B] = makeLoadInd(false, 1);
    this.ops[Op.LD_L_O_W] = makeLoadInd(false, 2);
    this.ops[Op.LD_L_O_D] = makeLoadInd(false, 4);

    // LEA: Fix - Pop index from stack!
    const makeLea = (isGlobal: boolean, op: number) => () => {
      let baseFlags = isGlobal ? 0 : HANDLE_BASE_EBP;
      const offset = this.fdView.getUint16(this.pc, true);
      this.pc += 2;
      // LEA pushes a handle encoding the variable's address and type.
      // The compiler never pushes an index before LEA; the offset in the
      // instruction operand is already the final variable offset.
      const addr = offset & 0xFFFF;
      let type = 0;
      if (op === Op.LEA_G_B || op === Op.LEA_L_B) type = HANDLE_TYPE_BYTE;
      else if (op === Op.LEA_G_W || op === Op.LEA_L_W) type = HANDLE_TYPE_WORD;
      else type = HANDLE_TYPE_DWORD;
      this.push(addr | type | baseFlags);
    };
    this.ops[Op.LEA_G_B] = makeLea(true, Op.LEA_G_B);
    this.ops[Op.LEA_G_W] = makeLea(true, Op.LEA_G_W);
    this.ops[Op.LEA_G_D] = makeLea(true, Op.LEA_G_D);
    this.ops[Op.LEA_L_B] = makeLea(false, Op.LEA_L_B);
    this.ops[Op.LEA_L_W] = makeLea(false, Op.LEA_L_W);
    this.ops[Op.LEA_L_D] = makeLea(false, Op.LEA_L_D);

    this.ops[Op.LEA_OFT] = () => {
      const offset = this.fdView.getUint16(this.pc, true);
      this.pc += 2;
      stk[this.sp - 1] = (offset + stk[this.sp - 1]) & 0xFFFF;
    };
    
    // Fix: 0x18 should push absolute computed address without EBP flags!
    this.ops[Op.LEA_L_PH] = () => {
      const offset = this.fdView.getUint16(this.pc, true);
      this.pc += 2;
      stk[this.sp - 1] = (offset + stk[this.sp - 1] + this.base) & 0xFFFF;
    };
    this.ops[Op.LEA_ABS] = () => {
      const offset = this.fdView.getUint16(this.pc, true);
      this.pc += 2;
      this.push((offset + this.base) & 0xFFFF);
    };

    // Buffers
    this.ops[Op.LD_TEXT] = () => { this.push(TEXT_OFFSET); };
    this.ops[Op.LD_GRAP] = () => { this.push(GBUF_OFFSET); };
    this.ops[Op.LD_GBUF] = () => { this.push(GBUF_OFFSET_LVM); };

    // String
    this.ops[Op.PUSH_STR] = () => {
      const start = this.strBufPtr;
      while (true) {
        let c = this.fd[this.pc++];
        if (this.strMask !== 0) c ^= this.strMask;
        memory[this.strBufPtr++] = c;
        if (this.strBufPtr >= STRBUF_END) this.strBufPtr = STRBUF_START;
        if (c === 0) break;
      }
      this.push(start);
    };

    this.ops[Op.MASK] = () => { this.strMask = this.fd[this.pc++]; };

    // Math/Binary
    const makeBinOp = (fn: (a: number, b: number) => number) => () => {
      const b = stk[--this.sp];
      stk[this.sp - 1] = fn(stk[this.sp - 1], b);
    };
    this.ops[Op.ADD] = makeBinOp((a, b) => (a + b) | 0);
    this.ops[Op.SUB] = makeBinOp((a, b) => (a - b) | 0);
    this.ops[Op.AND] = makeBinOp((a, b) => a & b);
    this.ops[Op.OR] = makeBinOp((a, b) => a | b);
    this.ops[Op.XOR] = makeBinOp((a, b) => a ^ b);
    this.ops[Op.MUL] = makeBinOp((a, b) => Math.imul(a, b));
    this.ops[Op.DIV] = makeBinOp((a, b) => b === 0 ? -1 : (a / b) | 0); // Fix: div by zero gives -1
    this.ops[Op.MOD] = makeBinOp((a, b) => b === 0 ? 0 : a % b);
    this.ops[Op.SHL] = makeBinOp((a, b) => a << b);
    this.ops[Op.SHR] = makeBinOp((a, b) => a >> b); // Fix: Arithmetic right shift (Signed)

    // Logical
    const makeLogOp = (fn: (a: number, b: number) => boolean) => () => {
      const b = stk[--this.sp];
      stk[this.sp - 1] = fn(stk[this.sp - 1], b) ? -1 : 0;
    };
    this.ops[Op.L_AND] = makeLogOp((a, b) => (a !== 0) && (b !== 0));
    this.ops[Op.L_OR] = makeLogOp((a, b) => (a !== 0) || (b !== 0));
    this.ops[Op.EQ] = makeLogOp((a, b) => a === b);
    this.ops[Op.NEQ] = makeLogOp((a, b) => a !== b);
    this.ops[Op.LE] = makeLogOp((a, b) => a <= b);
    this.ops[Op.GE] = makeLogOp((a, b) => a >= b);
    this.ops[Op.GT] = makeLogOp((a, b) => a > b);
    this.ops[Op.LT] = makeLogOp((a, b) => a < b);

    // Unary
    this.ops[Op.NEG] = () => { stk[this.sp - 1] = -stk[this.sp - 1]; };
    this.ops[Op.NOT] = () => { stk[this.sp - 1] = ~stk[this.sp - 1]; };
    this.ops[Op.L_NOT] = () => { stk[this.sp - 1] = stk[this.sp - 1] ? 0 : -1; };

    // Inc/Dec
    this.ops[Op.INC_PRE] = () => this.opIncDec(1, true);
    this.ops[Op.DEC_PRE] = () => this.opIncDec(-1, true);
    this.ops[Op.INC_POS] = () => this.opIncDec(1, false);
    this.ops[Op.DEC_POS] = () => this.opIncDec(-1, false);

    // Stack/Memory
    this.ops[Op.STORE] = () => {
      const val = stk[--this.sp];
      const addrEncoded = stk[this.sp - 1];
      this.setValue(addrEncoded, val);
      stk[this.sp - 1] = val; // Store leaves value on stack
    };
    this.ops[Op.LD_IND] = () => {
      const addrEncoded = stk[this.sp - 1];
      stk[this.sp - 1] = this.readValue(addrEncoded);
    };
    this.ops[Op.LD_IND_W] = () => {
      stk[this.sp - 1] = memView.getInt16(stk[this.sp - 1] & 0xFFFF, true);
    };
    this.ops[Op.LD_IND_D] = () => {
      stk[this.sp - 1] = memView.getInt32(stk[this.sp - 1] & 0xFFFF, true);
    };
    this.ops[Op.CPTR] = () => {
      stk[this.sp - 1] = (stk[this.sp - 1] & 0xFFFF) | HANDLE_TYPE_BYTE;
    };
    this.ops[Op.DUP] = () => {
      this.push(stk[this.sp - 1]);
    };
    this.ops[Op.SWAP] = () => {
      const a = stk[this.sp - 1];
      stk[this.sp - 1] = stk[this.sp - 2];
      stk[this.sp - 2] = a;
    };
    this.ops[Op.POP] = () => {
      this.pop();
    };

    // Flow Control
    // Fix: JZ/JNZ unconditionally check `this.lastValue` (Result Register)
    this.ops[Op.JZ] = () => {
      const addr = this.fd[this.pc] | (this.fd[this.pc + 1] << 8) | (this.fd[this.pc + 2] << 16);
      this.pc += 3;
      if (this.lastValue === 0) this.pc = addr;
    };
    this.ops[Op.JNZ] = () => {
      const addr = this.fd[this.pc] | (this.fd[this.pc + 1] << 8) | (this.fd[this.pc + 2] << 16);
      this.pc += 3;
      if (this.lastValue !== 0) this.pc = addr;
    };
    this.ops[Op.JMP] = () => {
      this.pc = this.fd[this.pc] | (this.fd[this.pc + 1] << 8) | (this.fd[this.pc + 2] << 16);
    };

    // Functions
    this.ops[Op.SPACE] = () => {
      this.base = this.base2 = this.fdView.getUint16(this.pc, true);
      this.pc += 2;
    };
    this.ops[Op.CALL] = () => {
      const addr = this.fd[this.pc] | (this.fd[this.pc + 1] << 8) | (this.fd[this.pc + 2] << 16);
      this.pc += 3;
      memory[this.base2] = this.pc & 0xFF;
      memory[this.base2 + 1] = (this.pc >> 8) & 0xFF;
      memory[this.base2 + 2] = (this.pc >> 16) & 0xFF;
      memView.setUint16(this.base2 + 3, this.base, true);
      this.base = this.base2;
      this.pc = addr;
    };
    this.ops[Op.FUNC] = () => {
      const frameSize = this.fdView.getUint16(this.pc, true);
      this.pc += 2;
      const argCount = this.fd[this.pc++];
      this.base2 = this.base + frameSize;
      if (argCount > 0) {
        this.sp -= argCount;
        for (let k = 0; k < argCount; k++) {
          memView.setInt32(this.base + 5 + (k * 4), stk[this.sp + k], true);
        }
      }
    };
    this.ops[Op.F_FLAG] = () => { /* Function boundary marker */ };
    this.ops[Op.RET] = () => {
      this.base2 = this.base;
      this.pc = memView.getUint32(this.base, true) & 0xFFFFFF; // Mask upper byte perfectly
      this.base = memView.getUint16(this.base + 3, true);
    };

    // Combined Opcodes
    const makeComboMath = (fn: (a: number, b: number) => number) => () => {
      const imm = this.fdView.getInt16(this.pc, true);
      this.pc += 2;
      stk[this.sp - 1] = fn(stk[this.sp - 1], imm);
    };
    this.ops[Op.ADD_C] = makeComboMath((a, b) => (a + b) | 0);
    this.ops[Op.SUB_C] = makeComboMath((a, b) => (a - b) | 0);
    this.ops[Op.MUL_C] = makeComboMath((a, b) => Math.imul(a, b));
    this.ops[Op.DIV_C] = makeComboMath((a, b) => b === 0 ? -1 : (a / b) | 0); // Fix
    this.ops[Op.MOD_C] = makeComboMath((a, b) => b === 0 ? 0 : a % b);
    this.ops[Op.SHL_C] = makeComboMath((a, b) => a << b);
    this.ops[Op.SHR_C] = makeComboMath((a, b) => a >> b); // Fix: Arithmetic right shift (Signed)

    const makeComboCmp = (fn: (a: number, b: number) => boolean) => () => {
      const imm = this.fdView.getInt16(this.pc, true);
      this.pc += 2;
      stk[this.sp - 1] = fn(stk[this.sp - 1], imm) ? -1 : 0;
    };
    this.ops[Op.EQ_C] = makeComboCmp((a, b) => a === b);
    this.ops[Op.NEQ_C] = makeComboCmp((a, b) => a !== b);
    this.ops[Op.GT_C] = makeComboCmp((a, b) => a > b);
    this.ops[Op.LT_C] = makeComboCmp((a, b) => a < b);
    this.ops[Op.GE_C] = makeComboCmp((a, b) => a >= b);
    this.ops[Op.LE_C] = makeComboCmp((a, b) => a <= b);

    // Float Opcodes
    const fBuf = new ArrayBuffer(4);
    const fView = new Float32Array(fBuf);
    const iView = new Int32Array(fBuf);

    this.ops[Op.F_ITOF] = () => {
      fView[0] = stk[this.sp - 1];
      stk[this.sp - 1] = iView[0];
    };
    this.ops[Op.F_FTOI] = () => {
      iView[0] = stk[this.sp - 1];
      stk[this.sp - 1] = fView[0] | 0;
    };
    const makeFloatBin = (fn: (a: number, b: number) => number) => () => {
      const b = this.popFloat();
      const a = this.popFloat();
      this.pushFloat(fn(a, b));
    };
    this.ops[Op.F_ADD] = makeFloatBin((a, b) => a + b);
    this.ops[Op.F_SUB] = makeFloatBin((a, b) => a - b);
    this.ops[Op.F_MUL] = makeFloatBin((a, b) => a * b);
    this.ops[Op.F_DIV] = makeFloatBin((a, b) => a / b);

    const makeFloatCmp = (fn: (a: number, b: number) => boolean) => () => {
      const b = this.popFloat();
      const a = this.popFloat();
      this.push(fn(a, b) ? -1 : 0);
    };
    this.ops[Op.F_LT] = makeFloatCmp((a, b) => a < b);
    this.ops[Op.F_GT] = makeFloatCmp((a, b) => a > b);
    this.ops[Op.F_EQ] = makeFloatCmp((a, b) => a === b);
    this.ops[Op.F_NEQ] = makeFloatCmp((a, b) => a !== b);
    this.ops[Op.F_LE] = makeFloatCmp((a, b) => a <= b);
    this.ops[Op.F_GE] = makeFloatCmp((a, b) => a >= b);

    this.ops[Op.F_NEG] = () => this.pushFloat(-this.popFloat());

    this.ops[Op.F_ADD_FI] = () => {
      const b = this.pop();
      const a = this.popFloat();
      this.pushFloat(a + b);
    };
    this.ops[Op.F_ADD_IF] = () => {
      const b = this.popFloat();
      const a = this.pop();
      this.pushFloat(a + b);
    };
    this.ops[Op.F_SUB_FI] = () => {
      const b = this.pop();
      const a = this.popFloat();
      this.pushFloat(a - b);
    };
    this.ops[Op.F_SUB_IF] = () => {
      const b = this.popFloat();
      const a = this.pop();
      this.pushFloat(a - b);
    };
    this.ops[Op.F_MUL_FI] = () => {
      const b = this.pop();
      const a = this.popFloat();
      this.pushFloat(a * b);
    };
    this.ops[Op.F_MUL_IF] = () => {
      const b = this.popFloat();
      const a = this.pop();
      this.pushFloat(a * b);
    };
    this.ops[Op.F_DIV_FI] = () => {
      const b = this.pop();
      const a = this.popFloat();
      this.pushFloat(b === 0 ? 0 : a / b);
    };
    this.ops[Op.F_DIV_IF] = () => {
      const b = this.popFloat();
      const a = this.pop();
      this.pushFloat(b === 0 ? 0 : a / b);
    };

    // Reference opcodes
    this.ops[Op.F_ABS] = () => {
      stk[this.sp - 1] = stk[this.sp - 1] & 0x7FFFFFFF;
    };
    this.ops[Op.CIPTR] = () => {
      stk[this.sp - 1] = (stk[this.sp - 1] & 0xFFFF) | HANDLE_TYPE_WORD;
    };
    this.ops[Op.CLPTR] = () => {
      stk[this.sp - 1] = (stk[this.sp - 1] & 0xFFFF) | HANDLE_TYPE_DWORD;
    };
    this.ops[Op.L2C] = () => {
      stk[this.sp - 1] = stk[this.sp - 1] & 0xFF;
    };
    this.ops[Op.L2I] = () => {
      let v = stk[this.sp - 1] & 0xFFFF;
      if (v & 0x8000) v |= ~0xFFFF; // Sign extend properly
      stk[this.sp - 1] = v;
    };
    this.ops[Op.STORE_EXT] = () => {
      const val = stk[--this.sp];
      let addr = stk[this.sp - 1];
      const typeByte = this.fd[this.pc++];
      if (typeByte & 0x80) addr = (addr + this.base) & 0xFFFF;
      else addr = addr & 0xFFFF;
      const t = typeByte & 0x7F;
      if (t === 1) memory[addr] = val & 0xFF;
      else if (t === 2) memView.setInt16(addr, val, true);
      else memView.setInt32(addr, val, true);
      stk[this.sp - 1] = val;
    };
    this.ops[Op.PUSH_ADDR] = () => {
      const offset = this.fdView.getUint16(this.pc, true);
      this.pc += 2;
      const idx = stk[this.sp - 1];
      stk[this.sp - 1] = (offset + idx) | 0;
    };
    this.ops[Op.IDX] = () => {
      let addr = stk[--this.sp];
      const ctrl = this.fd[this.pc++];
      if (ctrl & 0x80) addr = (addr + this.base) & 0xFFFF;
      else addr = addr & 0xFFFF;
      const t = ctrl & 0x1F;
      let val: number;
      if (t === 1) val = memory[addr];
      else if (t === 2) val = memView.getInt16(addr, true);
      else val = memView.getInt32(addr, true);
      const mode = (ctrl >> 5) & 3;
      let pushVal: number;
      if (mode === 0) { val++; pushVal = val; }
      else if (mode === 1) { val--; pushVal = val; }
      else if (mode === 2) { pushVal = val; val++; }
      else { pushVal = val; val--; }
      if (t === 1) memory[addr] = val & 0xFF;
      else if (t === 2) memView.setInt16(addr, val, true);
      else memView.setInt32(addr, val, true);
      this.push(pushVal);
    };
    this.ops[Op.PASS] = () => { this.pc++; };
    this.ops[Op.VOID] = () => { };
    this.ops[Op.DBG] = () => { this.pc += 3; };
    this.ops[Op.FUNCID] = () => { this.pc += 3; };

    // Syscalls (0x80 - 0xFF)
    for (let i = 0x80; i <= 0xFF; i++) {
      this.ops[i] = () => {
        try {
          const res = this.syscall.handleSync(i);
          if (res === undefined) {
            this.pc--; // Rollback PC for async yield
            if (!this.resolveKeySignal) {
              let resolver: () => void;
              const promise = new Promise<void>(resolve => { resolver = resolve; });
              this.resolveKeySignal = resolver!;
            }
            return;
          }
          if (res !== null) this.push(res);
        } catch (e: any) {
          this.onLog(`[VM Error] Syscall 0x${i.toString(16)} failed: ${e.message}`);
          throw e;
        }
      };
    }
  }

  public setInternalFontData(data: Uint8Array) {
    this.graphics.setInternalFontData(data);
  }

  load(lav: Uint8Array) {
    if (lav.length < 16) {
      this.onLog(`VM Error: File too small (${lav.length} bytes)`);
      return;
    }
    if (lav[0] !== 0x4C || lav[1] !== 0x41 || lav[2] !== 0x56) {
      this.onLog(`VM Error: Invalid magic ${lav[0]},${lav[1]},${lav[2]}`);
      return;
    }
    this.fd = lav;
    this.fdView = new DataView(lav.buffer, lav.byteOffset, lav.byteLength);
    this.codeLength = lav.length;
    this.reset();
    
    this.strMask = lav[5];
    const jpVar = lav[8] | (lav[9] << 8) | (lav[10] << 16);
    this.pc = jpVar > 0 ? jpVar : 0x10;
  }

  public reset() {
    this.pc = 0;
    this.sp = 0;
    this.base = 0;
    this.base2 = 0;
    this.strBufPtr = STRBUF_START;
    this.strMask = 0;
    this.lastValue = 0;
    this.memory.fill(0);
    this.stk.fill(0);
    this.regBuf.fill(0);

    this.keyBuffer = [];
    this.currentKeyDown = 0;
    this.startTime = Date.now();
    this.resolveKeySignal = null;
    this.graphics.fullReset();
    this.vfs.clearHandles();
  }

  // Refactored for MAX performance: time-slicing vs fixed batch ops
  async run() {
    if (this.codeLength === 0) return;
    this.running = true;
    this.onLog("System: VM Started");
    try {
      while (this.running && this.pc < this.codeLength) {
        const batchStart = Date.now();
        let batchOps = 0;

        while (this.running && this.pc < this.codeLength) {
          this.stepSync();
          batchOps++;

          // Break to yield if an async syscall suspended the VM
          if (this.resolveKeySignal) {
            break;
          }

          // Check time periodically to prevent locking the browser UI
          if (batchOps % 500 === 0) {
            if (Date.now() - batchStart >= 14) { // Target ~60FPS yield
              break;
            }
          }
        }

        if (this.resolveKeySignal) {
          await new Promise<void>(resolve => {
            const originalResolve = this.resolveKeySignal!;
            this.resolveKeySignal = () => {
              originalResolve();
              resolve();
            };
          });
          this.resolveKeySignal = null;
        } else {
          // Hand control back to event loop immediately
          await new Promise(resolve => setTimeout(resolve, 0));
        }
      }
    } catch (e: any) {
      this.onLog(`\n[VM FATAL ERROR] ${e.message}`);
      this.dumpState();
      this.running = false;
    }

    this.onLog("System: VM Stopped");
    this.graphics.flushScreen();
    this.running = false;
    this.onFinished();
  }

  stop() {
    this.running = false;
    if (this.resolveKeySignal) {
      this.resolveKeySignal();
      this.resolveKeySignal = null;
    }
  }

  private stepSync() {
    if (this.debug) {
      const pc = this.pc;
      const opcode = this.fd[pc];
      const opName = Op[opcode] || SystemOp[opcode] || `0x${opcode.toString(16)}`;
      this.onLog(`[DEBUG] PC=0x${pc.toString(16)} OP=${opName}(0x${opcode.toString(16)}) SP=${this.sp} BASE=0x${this.base.toString(16)}`);
    }
    const opcode = this.fd[this.pc++];
    this.ops[opcode]();
  }

  public push(val: number) {
    if (this.sp >= this.stk.length) {
      throw new Error(`Stack Overflow! SP: ${this.sp}`);
    }
    this.stk[this.sp++] = val | 0;
  }
  
  public pop(): number {
    if (this.sp <= 0) {
      return this.lastValue;
    }
    this.lastValue = this.stk[--this.sp];
    return this.lastValue;
  }

  public pushFloat(val: number) {
    const fBuf = new ArrayBuffer(4);
    new Float32Array(fBuf)[0] = val;
    this.push(new Int32Array(fBuf)[0]);
  }

  public popFloat(): number {
    const iVal = this.pop();
    const fBuf = new ArrayBuffer(4);
    new Int32Array(fBuf)[0] = iVal;
    return new Float32Array(fBuf)[0];
  }

  public getStringBytes(lp: number): Uint8Array | null {
    const addr = this.resolveAddress(lp);
    if (addr < 0 || addr >= MEMORY_SIZE) return null;
    let end = addr;
    while (end < MEMORY_SIZE && this.memory[end] !== 0) end++;
    return this.memory.subarray(addr, end);
  }

  public resolveAddress(lp: number): number {
    return (lp & HANDLE_BASE_EBP) ? ((lp & 0xFFFF) + this.base) & 0xFFFF : (lp & 0xFFFF);
  }

  private setValue(lp: number, n: number) {
    const addr = this.resolveAddress(lp);
    const type = lp & 0x70000;
    if (type === HANDLE_TYPE_BYTE) this.memory[addr] = n & 0xFF;
    else if (type === HANDLE_TYPE_WORD) this.memView.setInt16(addr, n, true);
    else this.memView.setInt32(addr, n, true);
  }

  private readValue(lp: number): number {
    const addr = this.resolveAddress(lp);
    const type = lp & 0x70000;
    if (type === HANDLE_TYPE_BYTE) return this.memory[addr];
    if (type === HANDLE_TYPE_WORD) return this.memView.getInt16(addr, true);
    return this.memView.getInt32(addr, true);
  }

  private opIncDec(delta: number, isPrefix: boolean) {
    const addrEncoded = this.stk[this.sp - 1];
    const addr = this.resolveAddress(addrEncoded);
    const typeMask = addrEncoded & 0x70000;

    let val = 0;
    if (typeMask === HANDLE_TYPE_BYTE) val = this.memory[addr];
    else if (typeMask === HANDLE_TYPE_WORD) val = this.memView.getInt16(addr, true);
    else val = this.memView.getInt32(addr, true);

    const newVal = val + delta;

    if (typeMask === HANDLE_TYPE_BYTE) this.memory[addr] = newVal & 0xFF;
    else if (typeMask === HANDLE_TYPE_WORD) this.memView.setInt16(addr, newVal, true);
    else this.memView.setInt32(addr, newVal, true);

    this.stk[this.sp - 1] = isPrefix ? newVal : val;
  }

  private dumpState() {
    this.onLog(`State Dump - PC: 0x${(this.pc - 1).toString(16)}, SP: ${this.sp}, BASE: 0x${this.base.toString(16)}`);
    if (this.sp > 0) {
      const top = Math.max(0, this.sp - 4);
      const elements = Array.from(this.stk.subarray(top, this.sp)).reverse();
      this.onLog(`Stack Top: [${elements.join(', ')}]`);
    }
  }
  
  public wakeUp() {
    if (this.resolveKeySignal) {
      this.resolveKeySignal();
      this.resolveKeySignal = null;
    }
  }

  pushKey(code: number) {
    if (code) {
      this.keyBuffer.push(code);
      this.currentKeyDown = code;
      this.wakeUp();
    }
  }

  releaseKey(code: number) {
    if (this.currentKeyDown === code || code >= 128) {
      this.currentKeyDown = 0;
    }
  }
}