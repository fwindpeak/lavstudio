
import { Op, SystemOp } from './types';
import iconv from 'iconv-lite';

export class LavaXDecompiler {
  private labelToAddr = new Map<string, number>();
  private addrToLine = new Map<number, number>();

  disassemble(lav: Uint8Array): string {
    if (lav.length < 16) return "// Invalid LAV file";
    const ops = lav.slice(16);
    const lines: string[] = [];
    const jumpTargets = new Set<number>();
    let ip = 0;
    while (ip < ops.length) {
      const op = ops[ip++];
      if ([Op.JMP, Op.JZ, Op.JNZ, Op.CALL].includes(op)) {
        const addr = (ops[ip] | (ops[ip + 1] << 8) | (ops[ip + 2] << 16)) - 16;
        jumpTargets.add(addr);
        ip += 3;
      } else if ([Op.PUSH_B, Op.MASK, Op.PASS, Op.STORE_EXT, Op.IDX].includes(op)) ip += 1;
      else if ([Op.PUSH_W, Op.LD_G_B, Op.LD_G_W, Op.LD_G_D, Op.LEA_G_B, Op.LEA_G_W, Op.LEA_G_D, Op.LD_L_B, Op.LD_L_W, Op.LD_L_D, Op.LEA_L_B, Op.LEA_L_W, Op.LEA_L_D, Op.LEA_OFT, Op.LEA_L_PH, Op.LEA_ABS, Op.PUSH_ADDR, Op.SPACE, Op.INIT, Op.LD_G_O_B, Op.LD_G_O_W, Op.LD_G_O_D, Op.LD_L_O_B, Op.LD_L_O_W, Op.LD_L_O_D].includes(op)) {
        if (op === Op.INIT) { const len = ops[ip + 2] | (ops[ip + 3] << 8); ip += 4 + len; } else ip += 2;
      } else if (op === Op.PUSH_D) ip += 4;
      else if (op === Op.FUNC || op === Op.DBG || op === Op.FUNCID) ip += 3;
      else if (op === Op.PUSH_STR) { while (ops[ip] !== 0 && ip < ops.length) ip++; ip++; }
    }
    ip = 0;
    while (ip < ops.length) {
      const addr = ip;
      if (jumpTargets.has(addr)) lines.push(`L_${addr.toString(16).padStart(4, '0')}:`);
      const op = ops[ip++];
      const name = Op[op] || (op & 0x80 ? SystemOp[op] : null) || `DB 0x${op.toString(16)}`;
      let line = `  ${name}`;
      if ([Op.JMP, Op.JZ, Op.JNZ, Op.CALL].includes(op)) {
        const target = (ops[ip] | (ops[ip + 1] << 8) | (ops[ip + 2] << 16)) - 16;
        ip += 3; line += ` L_${target.toString(16).padStart(4, '0')}`;
      } else if ([Op.PUSH_B, Op.MASK, Op.PASS, Op.STORE_EXT, Op.IDX].includes(op)) line += ` ${ops[ip++]}`;
      else if ([Op.PUSH_W, Op.LD_G_B, Op.LD_G_W, Op.LD_G_D, Op.LEA_G_B, Op.LEA_G_W, Op.LEA_G_D, Op.LD_L_B, Op.LD_L_W, Op.LD_L_D, Op.LEA_L_B, Op.LEA_L_W, Op.LEA_L_D, Op.LEA_OFT, Op.LEA_L_PH, Op.LEA_ABS, Op.PUSH_ADDR, Op.SPACE, Op.LD_G_O_B, Op.LD_G_O_W, Op.LD_G_O_D, Op.LD_L_O_B, Op.LD_L_O_W, Op.LD_L_O_D].includes(op)) {
        const v = ops[ip] | (ops[ip + 1] << 8); ip += 2; line += ` ${v > 32767 ? v - 65536 : v}`;
      } else if (op === Op.PUSH_D) {
        const v = ops[ip] | (ops[ip + 1] << 8) | (ops[ip + 2] << 16) | (ops[ip + 3] << 24); ip += 4; line += ` ${v}`;
      } else if (op === Op.FUNC || op === Op.DBG || op === Op.FUNCID) { line += ` ${ops[ip] | (ops[ip + 1] << 8)} ${ops[ip + 2]}`; ip += 3; }
      else if (op === Op.PUSH_STR) {
        const s = ip; while (ops[ip] !== 0 && ip < ops.length) ip++; const bytes = ops.slice(s, ip); ip++;
        line += ` "${iconv.decode(Buffer.from(bytes), 'gbk').replace(/"/g, '\\"').replace(/\n/g, '\\n')}"`;
      } else if (op === Op.INIT) {
        const a = ops[ip] | (ops[ip + 1] << 8); ip += 2; const l = ops[ip] | (ops[ip + 1] << 8); ip += 2;
        line += ` ${a} ${l} ${Array.from(ops.slice(ip, ip + l)).join(' ')}`; ip += l;
      }
      lines.push(line);
    }
    return lines.join('\n');
  }

  decompile(lav: Uint8Array): string {
    const asm = this.disassemble(lav);
    if (asm.startsWith("//")) return asm;
    const lines = asm.split('\n');
    const addrToName = new Map<number, string>();
    const globals = new Map<number, { size: number, data?: number[] }>();
    this.labelToAddr.clear();
    this.addrToLine.clear();

    lines.forEach((l, idx) => {
      const t = l.trim();
      if (t.endsWith(':')) {
          const label = t.slice(0, -1);
          const addr = parseInt(label.substring(2), 16);
          this.labelToAddr.set(label, addr);
          this.addrToLine.set(addr, idx);
      }
    });

    lines.forEach(line => {
      const t = line.trim();
      if (t.startsWith('JMP') && !Array.from(addrToName.values()).includes('main')) {
        const lbl = t.split(' ')[1];
        if (this.labelToAddr.has(lbl)) addrToName.set(this.labelToAddr.get(lbl)!, 'main');
      } else if (t.startsWith('CALL')) {
        const label = t.split(' ')[1];
        if (this.labelToAddr.has(label)) {
            const addr = this.labelToAddr.get(label)!;
            if (!addrToName.has(addr)) addrToName.set(addr, `func_${label.substring(2)}`);
        }
      } else if (t.startsWith('LD_G_') || t.startsWith('LEA_G_')) {
          const addr = parseInt(t.split(' ')[1]);
          if (!globals.has(addr)) globals.set(addr, { size: 4 });
      } else if (t.startsWith('INIT')) {
          const parts = t.split(/\s+/);
          const addr = parseInt(parts[1]);
          const len = parseInt(parts[2]);
          globals.set(addr, { size: len, data: parts.slice(3).map(x => parseInt(x)) });
      }
    });

    // Pass 1.5: Aggressive Global Discovery
    lines.forEach(line => {
        const t = line.trim();
        const parts = t.split(/\s+/), op = parts[0], args = parts.slice(1);
        if (op === 'PUSH_D' || op === 'PUSH_W') {
            const val = parseInt(args[0]);
            const addr = val & 0xFFFF;
            if (addr >= 0x2000 && addr < 0x20000 && !globals.has(addr)) globals.set(addr, { size: 4 });
        }
    });

    let src = "// Decompiled LavaX Source\n\n";
    Array.from(globals.keys()).sort((a, b) => a - b).forEach(addr => {
        const info = globals.get(addr)!;
        if (info.data) src += `char g_${addr.toString(16)}[] = { ${info.data.map(b => '0x' + b.toString(16)).join(', ')} };\n`;
        else src += `int g_${addr.toString(16)};\n`;
    });
    src += "\n";

    let current: { name: string, locals: Map<number, { size: number, isArray: boolean, data?: string[] }>, params: number } | null = null;
    let stack: string[] = [];

    const resolveAddrLiteral = (lit: string | undefined) => {
        if (!lit) return "0";
        const val = parseInt(lit);
        if (isNaN(val)) return lit;
        const addr = val & 0xFFFF;
        const isEBP = !!(val & 0x800000);
        if (isEBP) {
            if (current) {
                const pLimit = 5 + current.params * 4;
                if (addr >= 5 && addr < pLimit) return `p_${addr}`;
                if (!current.locals.has(addr)) current.locals.set(addr, { size: 4, isArray: false });
                return `l_${addr}`;
            }
            return `local_${addr}`;
        }
        if (globals.has(addr) || addr >= 0x2000) return `g_${addr.toString(16)}`;
        return lit;
    };

    const decompileBlock = (start: number, end: number, indent: string): string => {
      let bSrc = "";
      for (let i = start; i <= end; i++) {
        const t = lines[i].trim();
        if (!t || t.startsWith('SPACE') || t.startsWith('INIT') || t.endsWith(':') || t.startsWith('F_FLAG')) continue;
        const parts = t.split(/\s+/), op = parts[0], args = parts.slice(1);
        
        if (op.startsWith('LEA_L_') && i + 3 <= end) {
            const n1 = lines[i+1].trim().split(/\s+/), n2 = lines[i+2].trim().split(/\s+/), n3 = lines[i+3].trim().split(/\s+/);
            if (n1[0].startsWith('PUSH_') && n2[0] === 'STORE' && n3[0] === 'POP') {
                const sOff = parseInt(args[0]), values: string[] = []; let k = i;
                while (k + 3 <= end) {
                    const cO = lines[k].trim().split(/\s+/), cV = lines[k+1].trim().split(/\s+/), cS = lines[k+2].trim().split(/\s+/), cP = lines[k+3].trim().split(/\s+/);
                    if (cO[0].startsWith('LEA_L_') && parseInt(cO[1]) === sOff + values.length && cV[0].startsWith('PUSH_') && cS[0] === 'STORE' && cP[0] === 'POP') {
                        values.push('0x' + (parseInt(cV[1]) & 0xFF).toString(16)); k += 4;
                    } else break;
                }
                if (values.length > 2) { current!.locals.set(sOff, { size: values.length, isArray: true, data: values }); i = k - 1; continue; }
            }
        }

        if (op === 'FUNC' || op === 'RET' || op === 'EXIT' || op === 'DBG' || op === 'FUNCID' || op === 'VOID' || op === 'PASS') {
          if (op === 'RET') {
              // Flush any leftover call expressions that were never used
              while (stack.length > 1) {
                  const v = resolveAddrLiteral(stack.shift()!);
                  if (v && (v.includes('(') || v.includes('='))) bSrc += `${indent}${v};\n`;
              }
              const rv = stack.length ? resolveAddrLiteral(stack.pop()) : "";
              bSrc += `${indent}return${rv ? ` ${rv}` : ""};\n`;
          }
          if (op === 'EXIT' && current?.name !== 'main') bSrc += `${indent}exit(0);\n`;
          continue;
        }

        // Handle user-defined function calls
        if (op === 'CALL') {
          const funcLabel = args[0];
          const funcAddr = this.labelToAddr.get(funcLabel);
          const funcName = funcAddr !== undefined ? (addrToName.get(funcAddr) || funcLabel) : funcLabel;
          // Find param count from the called function's FUNC instruction
          let paramCount = 0;
          if (funcAddr !== undefined) {
            const funcStartLine = this.addrToLine.get(funcAddr);
            if (funcStartLine !== undefined) {
              for (let k = funcStartLine; k <= Math.min(funcStartLine + 3, lines.length - 1); k++) {
                const lt = lines[k].trim();
                if (lt.startsWith('FUNC')) { paramCount = parseInt(lt.split(/\s+/)[2]) || 0; break; }
              }
            }
          }
          const callArgs: string[] = [];
          for (let k = 0; k < paramCount; k++) callArgs.unshift(resolveAddrLiteral(stack.pop() || '0'));
          const callExpr = `${funcName}(${callArgs.join(', ')})`;
          // Determine if the return value is consumed by the immediately following instruction
          const nextParts = i + 1 <= end ? lines[i + 1].trim().split(/\s+/) : [];
          const nextOp2 = nextParts[0] || '';
          const valueConsumers = new Set(['ADD','SUB','MUL','DIV','MOD','AND','OR','XOR','SHL','SHR','EQ','NEQ','LT','GT','LE','GE','L_AND','L_OR','STORE','SWAP','NEG','NOT','L_NOT','INC_PRE','DEC_PRE','INC_POS','DEC_POS','DUP']);
          if (nextOp2 === 'POP') {
            // Non-void called as a statement, return value discarded
            bSrc += `${indent}${callExpr};\n`;
            i++; // skip POP
          } else if (valueConsumers.has(nextOp2) || nextOp2.startsWith('LEA_') || nextOp2.startsWith('LD_IND')) {
            // Return value used in an expression
            stack.push(callExpr);
          } else {
            // Void function call (no return value consumed)
            bSrc += `${indent}${callExpr};\n`;
          }
          continue;
        }
        // Handle POP+JZ/JNZ fusion: skip POP if next is JZ/JNZ (combined pattern)
        if (op === 'POP') {
          const nextOp = i + 1 <= end ? lines[i+1].trim().split(/\s+/)[0] : "";
          if (nextOp === 'JZ' || nextOp === 'JNZ') {
            // Don't pop from decompiler stack; let JZ/JNZ handle it
            continue;
          }
        }
        if (op === 'JZ') {
          const cond = resolveAddrLiteral(stack.pop()), target = args[0], tAddr = this.labelToAddr.get(target);
          if (tAddr !== undefined) {
              const targetLine = this.addrToLine.get(tAddr)!, pT = lines[targetLine - 1]?.trim() || "";
              if (pT.startsWith('JMP')) {
                  const jL = pT.split(' ')[1], ja = this.labelToAddr.get(jL);
                  if (ja !== undefined) {
                      const jLine = this.addrToLine.get(ja)!;
                      if (jLine < i) { bSrc += `${indent}while (${cond}) {\n${decompileBlock(i + 1, targetLine - 2, indent + "  ")}${indent}}\n`; i = targetLine - 1; continue; }
                      if (jLine > targetLine) { bSrc += `${indent}if (${cond}) {\n${decompileBlock(i + 1, targetLine - 2, indent + "  ")}${indent}} else {\n${decompileBlock(targetLine + 1, jLine - 1, indent + "  ")}${indent}}\n`; i = jLine - 1; continue; }
                  }
              }
              bSrc += `${indent}if (${cond}) {\n${decompileBlock(i + 1, targetLine - 1, indent + "  ")}${indent}}\n`;
              i = targetLine - 1; continue;
          }
        }
        if (op === 'JMP') { bSrc += `${indent}goto ${args[0]};\n`; continue; }
        const nO = i + 1 <= end ? lines[i+1].trim() : "";
        const iSP = op === 'STORE' && nO === 'POP';
        this.handleOp(op, args, stack, (s) => bSrc += `${indent}${s};\n`, current!, iSP, resolveAddrLiteral);
        if (iSP) i++;
      }
      return bSrc;
    };

    const fAddrs = Array.from(addrToName.keys()).sort((a, b) => a - b);
    fAddrs.forEach((addr, idx) => {
        let sLine = this.addrToLine.get(addr)!, eLine = (idx + 1 < fAddrs.length) ? this.addrToLine.get(fAddrs[idx + 1])! - 1 : lines.length - 1;
        const name = addrToName.get(addr)!;
        const fl = lines.slice(sLine, eLine + 1).find(l => l.trim().startsWith('FUNC'));
        const params = fl ? parseInt(fl.trim().split(/\s+/)[2]) : 0;
        current = { name, locals: new Map(), params }; stack = [];
        let body = decompileBlock(sLine + 1, eLine, "  ");
        src += `void ${name}(${Array.from({length: params}, (_, j) => `int p_${5+j*4}`).join(', ')}) {\n`;
        Array.from(current.locals.entries()).sort((a, b) => a[0] - b[0]).forEach(([off, info]) => {
            if (off >= 5 + current!.params * 4) {
                if (info.isArray) src += `  char l_${off}[] = { ${info.data?.join(', ')} };\n`;
                else src += `  int l_${off};\n`;
            }
        });
        src += body + "}\n\n";
    });
    return src;
  }

  private handleOp(op: string, args: string[], stack: string[], emit: (s: string) => void, func: any, iSP: boolean, resolveAddr: any) {
    const getLocal = (off: number) => {
      for (const [start, info] of func.locals.entries()) {
          if (off >= start && off < start + info.size) {
              if (info.isArray) return `l_${start}[${off - start}]`;
              if (off === start) return `l_${start}`;
          }
      }
      func.locals.set(off, { size: 4, isArray: false }); return off < 5 + func.params * 4 ? `p_${off}` : `l_${off}`;
    };
    const deref = (s: string | undefined) => { if (!s) return "0"; if (s.includes('[') || s.startsWith('g_') || s.startsWith('l_') || s.startsWith('p_') || s.startsWith('(')) return s; return s.startsWith('&') ? s.substring(1) : `*(${s})`; };
    const getAddr = (off: number) => { for (const [start, info] of func.locals.entries()) { if (off === start && info.isArray) return `l_${start}`; } return `&${getLocal(off)}`; };

    switch (op) {
      case 'PUSH_B': case 'PUSH_W': case 'PUSH_D': stack.push(args[0]); break;
      case 'PUSH_STR': stack.push(args.join(' ')); break;
      case 'LD_G_B': case 'LD_G_W': case 'LD_G_D': stack.push(`g_${parseInt(args[0]).toString(16)}`); break;
      case 'LD_L_B': case 'LD_L_W': case 'LD_L_D': stack.push(getLocal(parseInt(args[0]))); break;
      case 'LEA_G_B': case 'LEA_G_W': case 'LEA_G_D': stack.push(`g_${parseInt(args[0]).toString(16)}`); break;
      case 'LEA_L_B': case 'LEA_L_W': case 'LEA_L_D': stack.push(getAddr(parseInt(args[0]))); break;
      case 'STORE': {
        const val = resolveAddr(stack.pop());
        const rawAddrExpr = resolveAddr(stack.pop());
        // Try to evaluate address as a numeric handle encoding (offset | EBP_flag | type_bits)
        // e.g. "((9 | 8388608) | 131072)" → resolve as local var at offset 9
        const lhs = (() => {
          const cleaned = rawAddrExpr.replace(/[()]/g, '').trim();
          if (/^[\d\s|]+$/.test(cleaned)) {
            const parts = cleaned.split('|');
            let result = 0, valid = true;
            for (const p of parts) { const n = parseInt(p.trim()); if (isNaN(n)) { valid = false; break; } result |= n; }
            if (valid) {
              const resolved = resolveAddr(String(result));
              if (resolved !== String(result)) return deref(resolved);
            }
          }
          // Strip type-constant OR: "(&l_5 | 131072)" → "&l_5"
          let stripped = rawAddrExpr
            .replace(/^\((.+?)\s*\|\s*(?:65536|131072|262144)\s*\)$/, '$1')
            .replace(/^\((.+?)\s*\|\s*8388608\s*\)$/, '$1').trim();
          return deref(stripped);
        })();
        if (iSP) {
          emit(`${lhs} = ${val}`);
        } else {
          stack.push(`(${lhs} = ${val})`);
        }
        break;
      }
      case 'POP': if (stack.length) { const v = resolveAddr(stack.pop())!; if (v.includes('(') || v.includes('=') || v.includes('++') || v.includes('--')) emit(v); } break;
      case 'ADD': case 'SUB': case 'MUL': case 'DIV': case 'MOD': case 'AND': case 'OR': case 'XOR': case 'SHL': case 'SHR': case 'EQ': case 'NEQ': case 'LT': case 'GT': case 'LE': case 'GE': case 'L_AND': case 'L_OR': { const b = stack.pop() || "0", a = stack.pop() || "0"; const ops:any = {ADD:'+',SUB:'-',MUL:'*',DIV:'/',MOD:'%',AND:'&',OR:'|',XOR:'^',SHL:'<<',SHR:'>>',EQ:'==',NEQ:'!=',LT:'<',GT:'>',LE:'<=',GE:'>=',L_AND:'&&',L_OR:'||'}; stack.push(`(${a} ${ops[op]} ${b})`); break; }
      case 'NEG': case 'NOT': case 'L_NOT': { const ops:any = {NEG:'-',NOT:'~',L_NOT:'!'}; stack.push(`(${ops[op]}${stack.pop()})`); break; }
      case 'INC_PRE': case 'DEC_PRE': { const ops:any = {INC_PRE:'++',DEC_PRE:'--'}; stack.push(`${ops[op]}${deref(stack.pop())}`); break; }
      case 'INC_POS': case 'DEC_POS': { const ops:any = {INC_POS:'++',DEC_POS:'--'}; stack.push(`((${deref(stack.pop())})${ops[op]})`); break; }
      case 'LD_IND': stack.push(`*(${resolveAddr(stack.pop())})`); break;
      case 'LD_IND_W': stack.push(`*(int*)(${resolveAddr(stack.pop())})`); break;
      case 'LD_IND_D': stack.push(`*(long*)(${resolveAddr(stack.pop())})`); break;
      case 'CPTR': stack.push(`(char*)(${resolveAddr(stack.pop())})`); break;
      case 'CIPTR': stack.push(`(int*)(${resolveAddr(stack.pop())})`); break;
      case 'CLPTR': stack.push(`(long*)(${resolveAddr(stack.pop())})`); break;
      case 'L2C': stack.push(`(char)(${resolveAddr(stack.pop())})`); break;
      case 'L2I': stack.push(`(int)(${resolveAddr(stack.pop())})`); break;
      case 'DUP': if (stack.length) stack.push(stack[stack.length - 1]); break;
      case 'SWAP': if (stack.length >= 2) { const t = stack[stack.length-1]; stack[stack.length-1] = stack[stack.length-2]; stack[stack.length-2] = t; } break;
      default:
        if (SystemOp[op as any] !== undefined || op in SystemOp) {
          const spec: any = { putchar: [0], getchar: [], strcpy: [1, 1], strlen: [1], SetScreen: [0], UpdateLCD: [0], Delay: [0, 0], WriteBlock: [0, 0, 0, 0, 0, 1], Refresh: [], TextOut: [0, 0, 1, 0], Block: [0, 0, 0, 0, 0], Rectangle: [0, 0, 0, 0, 0], exit: [0], ClearScreen: [], abs: [0], rand: [], srand: [0], Locate: [0, 0], Inkey: [], Point: [0, 0, 0], GetPoint: [0, 0], Line: [0, 0, 0, 0, 0], Box: [0, 0, 0, 0, 0, 0], Circle: [0, 0, 0, 0, 0], Ellipse: [0, 0, 0, 0, 0, 0], Beep: [], XDraw: [0], GetBlock: [0, 0, 0, 0, 0, 1], FillArea: [0, 0, 0], Sin: [0], Cos: [0], PutKey: [0], ReleaseKey: [0], opendir: [1], readdir: [0], closedir: [0], Getms: [], CheckKey: [0], GetWord: [], fopen: [1, 1], MakeDir: [1], ChDir: [1], fseek: [0, 0, 0], fread: [1, 0, 0, 0], fwrite: [1, 0, 0, 0], fclose: [0] };
          let c = 0; let argSpecs: number[] = []; if (spec[op]) { argSpecs = spec[op]; c = argSpecs.length; }
          if (op === 'printf' || op === 'sprintf') { const countStr = stack.pop(); c = (countStr !== undefined) ? (parseInt(countStr) || 0) : 0; argSpecs = Array(c).fill(0); if (op === 'printf') argSpecs[0] = 1; else if (op === 'sprintf') { argSpecs[0] = 1; argSpecs[1] = 1; } }
          const a: string[] = []; for (let i = 0; i < c; i++) {
              let val = resolveAddr(stack.pop()); const argIdxFromRight = c - 1 - i;
              if (argSpecs[argIdxFromRight] === 1) val = resolveAddr(val);
              a.unshift(val);
          }
          const call = `${op}(${a.join(', ')})`;
          const returns = ['getchar', 'strlen', 'abs', 'rand', 'Inkey', 'GetPoint', 'isalnum', 'isalpha', 'iscntrl', 'isdigit', 'isgraph', 'islower', 'isprint', 'ispunct', 'isspace', 'isupper', 'isxdigit', 'strchr', 'strcmp', 'strstr', 'tolower', 'toupper', 'fopen', 'fread', 'fwrite', 'fseek', 'ftell', 'feof', 'getc', 'putc', 'MakeDir', 'DeleteFile', 'Getms', 'CheckKey', 'Crc16', 'ChDir', 'FileList', 'GetWord', 'Sin', 'Cos', 'FindWord', 'PlayInit', 'PlayFile', 'opendir', 'readdir', 'closedir', 'read_uart', 'srand', 'exit', 'GetBlock'];
          if (returns.includes(op)) stack.push(call); else emit(call);
        }
    }
  }
}
