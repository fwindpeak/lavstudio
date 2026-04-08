import { SystemOp } from './types';
import iconv from 'iconv-lite';
import { LavaXAssembler } from './compiler/LavaXAssembler';

function encodeToGBK(str: string): number[] {
  try {
    const buf = iconv.encode(str, 'gbk');
    return Array.from(buf);
  } catch (e) {
    return Array.from(str).map(c => c.charCodeAt(0) & 0xFF);
  }
}
function unescapeString(str: string): string {
  return str.replace(/\\n/g, '\n')
    .replace(/\\r/g, '\r')
    .replace(/\\t/g, '\t')
    .replace(/\\"/g, '"')
    .replace(/\\\\/g, '\\');
}


interface Variable {
  offset: number;
  type: string; // 'int', 'char', 'long', 'void', 'addr'
  size: number; // For arrays, this is the number of elements
  pointerDepth: number; // 0 for normal vars, 1 for *p, 2 for **p etc.
  dimensions?: number[];
}

interface StructMember {
  name: string;
  type: string;
  offset: number;
  size: number;
  pointerDepth: number;
  dimensions?: number[];
}

interface StructDef {
  members: Map<string, StructMember>;
  totalSize: number;
}

export class LavaXCompiler {
  private src: string = "";
  private pos: number = 0;
  private asm: string[] = [];
  private labelCount = 0;
  private globals: Map<string, Variable> = new Map();
  private locals: Map<string, Variable> = new Map();
  private globalOffset = 0x2000;
  private localOffset = 0;
  private functions: Map<string, { params: number, returnType: string }> = new Map();
  private breakLabels: string[] = [];
  private continueLabels: string[] = [];
  private defines: Map<string, string> = new Map();
  private initializers: string[] = [];
  private structs: Map<string, StructDef> = new Map();
  private readonly SYSCALLS_WITH_RETURN = new Set([
    'getchar', 'strlen', 'abs', 'rand', 'Inkey', 'GetPoint',
    'isalnum', 'isalpha', 'iscntrl', 'isdigit', 'isgraph',
    'islower', 'isprint', 'ispunct', 'isspace', 'isupper', 'isxdigit',
    'strchr', 'strcmp', 'strstr', 'tolower', 'toupper',
    'fopen', 'fread', 'fwrite', 'fseek', 'ftell', 'feof',
    'getc', 'putc', 'MakeDir', 'DeleteFile', 'Getms', 'CheckKey', 'Crc16',
    'ChDir', 'FileList', 'GetWord', 'Sin', 'Cos',
    'FindWord', 'PlayInit', 'PlayFile',
    'opendir', 'readdir', 'closedir', 'read_uart', 'SetFgColor', 'SetBgColor', 'SetPalette'
  ]);


  private static readonly SYSCALL_PARAM_COUNTS: Partial<Record<keyof typeof SystemOp, number>> = {
    putchar: 1, getchar: 0, strcpy: 2, strlen: 1, SetScreen: 1,
    UpdateLCD: 1, Delay: 1, WriteBlock: 6, Refresh: 0, TextOut: 4,
    Block: 5, Rectangle: 5, exit: 1, ClearScreen: 0, abs: 1,
    rand: 0, srand: 1, Locate: 2, Inkey: 0, Point: 3,
    GetPoint: 2, Line: 5, Box: 6, Circle: 5, Ellipse: 6,
    Beep: 0, isalnum: 1, isalpha: 1, iscntrl: 1, isdigit: 1,
    isgraph: 1, islower: 1, isprint: 1, ispunct: 1, isspace: 1,
    isupper: 1, isxdigit: 1, strcat: 2, strchr: 2, strcmp: 2,
    strstr: 2, tolower: 1, toupper: 1, memset: 3, memcpy: 3,
    fopen: 2, fclose: 1, fread: 4, fwrite: 4, fseek: 3,
    ftell: 1, feof: 1, rewind: 1, getc: 1, putc: 2,
    MakeDir: 1, DeleteFile: 1, Getms: 0, CheckKey: 1, memmove: 3,
    Crc16: 2, Secret: 3, ChDir: 1, FileList: 1, GetTime: 1,
    SetTime: 1, GetWord: 0, XDraw: 1, ReleaseKey: 0, GetBlock: 6,
    Sin: 1, Cos: 1, FillArea: 3, PutKey: 1, FindWord: 1,
    PlayInit: 1, PlayFile: 1, PlayStops: 0, SetVolume: 1, PlaySleep: 0,
    opendir: 1, readdir: 1, rewinddir: 1, closedir: 1, Refresh2: 0,
    open_key: 1, close_key: 0, PlayWordVoice: 1, sysexecset: 1, open_uart: 2,
    close_uart: 0, write_uart: 2, read_uart: 2, RefreshIcon: 0,
    SetFgColor: 1, SetBgColor: 1, SetPalette: 3
  };

  private evalConstant(expr: string): number {
    // 1. Recursive macro expansion
    let expanded = expr;
    let limit = 100;
    while (limit-- > 0) {
      let changed = false;
      // Find identifiers
      expanded = expanded.replace(/[a-zA-Z_]\w*/g, (match) => {
        if (this.defines.has(match)) {
          changed = true;
          return this.defines.get(match)!;
        }
        return match;
      });
      if (!changed) break;
    }

    // 2. Evaluate
    try {
      // Safety check: only allow digits, operators, parens, spaces, hex
      // We allow \w for hex (0x...) and identifiers that might be valid (e.g. true/false if supported, or unexpanded)
      // But strictly we should probably limit it.
      // For now, let's try to eval.
      return new Function(`return (${expanded});`)();
    } catch (e) {
      return NaN;
    }
  }

  private getLineNumber(pos: number): number {
    return this.src.substring(0, pos).split('\n').length;
  }

  compile(source: string): string {
    this.src = source;
    this.pos = 0;
    this.asm = [];
    this.labelCount = 0;
    this.globals = new Map();
    this.locals = new Map();
    this.globalOffset = 0x2000;
    this.localOffset = 0;
    this.functions = new Map();
    this.breakLabels = [];
    this.continueLabels = [];
    this.structs = new Map();
    this.defines = new Map([
      ['NULL', '0'],
      ['TRUE', '1'],
      ['FALSE', '0']
    ]);
    this.initializers = [];

    try {
      const tempPos = this.pos;
      while (this.pos < this.src.length) {
        this.skipWhitespace();
        const type = this.peekToken();
        if (type === '#') {
          this.parseToken(); // #
          const directive = this.parseToken();
          if (directive === 'define') {
            const key = this.parseToken();
            // Read until newline
            let val = "";
            // Skip horizontal whitespace
            while (this.pos < this.src.length && " \t".includes(this.src[this.pos])) this.pos++;
            const start = this.pos;
            while (this.pos < this.src.length && this.src[this.pos] !== '\n' && this.src[this.pos] !== '\r') {
              this.pos++;
            }
            val = this.src.substring(start, this.pos);
            // Handle // comments
            const commentIdx = val.indexOf('//');
            if (commentIdx !== -1) val = val.substring(0, commentIdx);

            this.defines.set(key, val.trim());
          }
          continue;
        }

        if (!type || !['int', 'char', 'long', 'void', 'addr', 'struct', 'typedef'].includes(type)) {
          if (type) this.parseToken(); // Consume unknown top-level or whatever
          continue;
        }

        // Handle struct definitions in pre-scan
        if (type === 'struct') {
          this.parseToken(); // consume 'struct'
          const structName = this.parseToken();
          if (this.match('{')) {
            this.parseStructDefinition(structName);
          } else {
            // struct variable declaration or forward decl - skip
            while (this.pos < this.src.length && this.src[this.pos] !== ';') this.pos++;
            if (this.src[this.pos] === ';') this.pos++;
          }
          continue;
        }

        // Handle typedef in pre-scan (basic - skip it)
        if (type === 'typedef') {
          this.parseToken(); // consume 'typedef'
          let depth = 0;
          while (this.pos < this.src.length) {
            const c = this.src[this.pos];
            if (c === '{') depth++;
            else if (c === '}') depth--;
            else if (c === ';' && depth === 0) { this.pos++; break; }
            this.pos++;
          }
          continue;
        }
        this.parseToken(); // Consume base type
        do {
          let pointerDepth = 0;
          while (this.match('*')) { pointerDepth++; }
          const name = this.parseToken();
          if (this.match('(')) {
            // Pre-scan function to register its existence
            let paramsCount = 0;
            if (!this.match(')')) {
              do {
                this.parseToken(); // type
                while (this.match('*')) { /* consume */ }
                this.parseToken(); // name
                paramsCount++;
              } while (this.match(','));
              this.expect(')');
            }
            this.functions.set(name, { params: paramsCount, returnType: type });

            if (this.match(';')) {
              // Already handled
            } else {
              this.expect('{');
              let depth = 1;
              while (this.pos < this.src.length && depth > 0) {
                const char = this.src[this.pos];
                if (char === '"') {
                  this.pos++;
                  while (this.pos < this.src.length && this.src[this.pos] !== '"') {
                    if (this.src[this.pos] === '\\') this.pos++;
                    this.pos++;
                  }
                  this.pos++;
                } else if (char === "'") {
                  this.pos++;
                  while (this.pos < this.src.length && this.src[this.pos] !== "'") {
                    if (this.src[this.pos] === '\\') this.pos++;
                    this.pos++;
                  }
                  this.pos++;
                } else if (this.src.startsWith('//', this.pos)) {
                  while (this.pos < this.src.length && this.src[this.pos] !== '\n') this.pos++;
                } else if (this.src.startsWith('/*', this.pos)) {
                  this.pos += 2;
                  while (this.pos < this.src.length && !this.src.startsWith('*/', this.pos)) this.pos++;
                  this.pos += 2;
                } else if (char === '{') {
                  depth++;
                  this.pos++;
                } else if (char === '}') {
                  depth--;
                  this.pos++;
                } else {
                  this.pos++;
                }
              }
            }
            break; // functions can't be comma-separated with vars in this simple parser
          } else {
            // Global variable/array
            let size = 1;
            const elementSize = type === 'char' ? 1 : 4;
            const dimensions: number[] = [];
            let isImplicitFirstDim = false;

            while (this.match('[')) {
              if (this.peekToken() === ']') {
                this.parseToken();
                if (dimensions.length > 0) throw new Error("Only the first dimension can be implicit");
                isImplicitFirstDim = true;
                dimensions.push(0);
              } else {
                // Capture expression until ]
                const start = this.pos;
                let depth = 0;
                while (this.pos < this.src.length) {
                  const char = this.src[this.pos];
                  if (char === ']') {
                    if (depth === 0) break;
                    depth--;
                  } else if (char === '[') {
                    depth++;
                  }
                  this.pos++;
                }
                const expr = this.src.substring(start, this.pos);
                // Manually consume ] if loop finished by finding ]
                if (this.src[this.pos] === ']') this.pos++;
                else throw new Error("Expected ']'");

                let dim = this.evalConstant(expr);
                if (isNaN(dim)) throw new Error(`Invalid array dimension: ${expr}`);
                dimensions.push(dim);
              }
            }

            if (dimensions.length > 0) {
              size = dimensions.reduce((a, b) => (b === 0 ? a : a * b), 1);
              if (isImplicitFirstDim) size = 0; // Will be set by initializer
              else {
                // If not implicit, size is product of all dims
                size = dimensions.reduce((a, b) => a * b, 1);
              }
            }

            if (this.match('=')) {
              const initializer = this.peekToken();
              if (initializer.startsWith('"')) {
                const str = initializer.substring(1, initializer.length - 1);
                const strRaw = unescapeString(str);
                const bytes = encodeToGBK(strRaw);
                if (size === 0) size = bytes.length + 1;
                // Save INIT for global string
                this.initializers.push(`INIT ${this.globalOffset} ${bytes.length + 1} ${bytes.join(' ')} 0`);
                this.parseToken(); // consume string
              } else if (initializer === '{') {
                const values: number[] = [];
                const count = this.parseInitializerList(values);
                if (size === 0 && isImplicitFirstDim) {
                  const innerSize = dimensions.length > 1 ? dimensions.slice(1).reduce((a, b) => a * b, 1) : 1;
                  size = count * innerSize;
                }
                // Emit INIT for global array
                const elementSize = type === 'char' ? 1 : 4;
                if (values.length > 0) {
                  const byteValues: number[] = [];
                  for (const v of values) {
                    if (elementSize === 1) byteValues.push(v & 0xFF);
                    else {
                      byteValues.push(v & 0xFF, (v >> 8) & 0xFF, (v >> 16) & 0xFF, (v >> 24) & 0xFF);
                    }
                  }
                  this.initializers.push(`INIT ${this.globalOffset} ${byteValues.length} ${byteValues.join(' ')}`);
                }
              } else {
                const expr = this.parseToken(); // Simplified for pre-scan
                const val = this.evalConstant(expr);
                if (!isNaN(val)) {
                  if (elementSize === 1) this.initializers.push(`INIT ${this.globalOffset} 1 ${val & 0xFF}`);
                  else this.initializers.push(`INIT ${this.globalOffset} 4 ${val & 0xFF} ${(val >> 8) & 0xFF} ${(val >> 16) & 0xFF} ${(val >> 24) & 0xFF}`);
                }
              }
            }

            if (size === 0) throw new Error(`Array size required for ${name}`);

            this.globals.set(name, { offset: this.globalOffset, type, size, pointerDepth, dimensions });
            this.globalOffset += size * elementSize;
          }
        } while (this.match(','));
        this.match(';');
      }
      this.pos = tempPos;

      this.asm.push(`SPACE ${this.globalOffset}`);
      this.asm.push(...this.initializers);
      // Main function is the entry point - use JMP not CALL
      // because main should not return, it should exit directly
      this.asm.push('JMP main');

      while (this.pos < this.src.length) {
        this.skipWhitespace();
        if (this.pos >= this.src.length) break;
        this.parseTopLevel();
      }
    } catch (e: any) {
      // Calculate line and column number
      const lines = this.src.substring(0, this.pos).split('\n');
      const lineNumber = lines.length;
      const columnNumber = lines[lines.length - 1].length + 1;

      const contextStart = Math.max(0, this.pos - 20);
      const contextEnd = Math.min(this.src.length, this.pos + 30);
      const context = this.src.substring(contextStart, contextEnd);
      const pointer = ' '.repeat(this.pos - contextStart) + '^';
      console.error('[COMPILER ERROR]', e.message);
      console.error(`At line ${lineNumber}, column ${columnNumber} `);
      console.error('Context:', context);
      console.error('        ', pointer);
      return `ERROR: ${e.message} at line ${lineNumber}, column ${columnNumber} \nContext: ${context} \n         ${pointer} `;
    }
    return this.asm.join('\n');
  }

  private peekToken(): string {
    const oldPos = this.pos;
    const token = this.parseToken();
    this.pos = oldPos;
    return token;
  }

  private match(str: string) {
    this.skipWhitespace();
    if (this.peekToken() === str) {
      this.parseToken();
      return true;
    }
    return false;
  }

  private expect(str: string) {
    if (!this.match(str)) throw new Error(`Expected '${str}'`);
  }

  private skipWhitespace() {
    while (this.pos < this.src.length) {
      const c = this.src[this.pos];
      if (/\s/.test(c)) { this.pos++; continue; }
      if (this.src.startsWith('//', this.pos)) {
        while (this.pos < this.src.length && this.src[this.pos] !== '\n') this.pos++;
        continue;
      }
      if (this.src.startsWith('/*', this.pos)) {
        this.pos += 2;
        while (this.pos < this.src.length && !this.src.startsWith('*/', this.pos)) this.pos++;
        this.pos += 2;
        continue;
      }
      break;
    }
  }

  private parseToken(): string {
    this.skipWhitespace();
    const start = this.pos;
    if (this.pos >= this.src.length) return "";

    if (this.src[this.pos] === '"') {
      this.pos++;
      while (this.pos < this.src.length && this.src[this.pos] !== '"') {
        if (this.src[this.pos] === '\\') this.pos++;
        this.pos++;
      }
      this.pos++;
      return this.src.substring(start, this.pos);
    }

    // Handle character literals (single quotes)
    if (this.src[this.pos] === "'") {
      this.pos++;
      while (this.pos < this.src.length && this.src[this.pos] !== "'") {
        if (this.src[this.pos] === '\\') this.pos++;
        this.pos++;
      }
      this.pos++;
      return this.src.substring(start, this.pos);
    }

    const special = "(){}[],;=+-*/%><!&|^~#";
    if (special.includes(this.src[this.pos])) {
      let op = this.src[this.pos++];
      if (op === '<' && this.src[this.pos] === '<') {
        op += this.src[this.pos++];
        if (this.src[this.pos] === '=') op += this.src[this.pos++];
      }
      else if (op === '>' && this.src[this.pos] === '>') {
        op += this.src[this.pos++];
        if (this.src[this.pos] === '=') op += this.src[this.pos++];
      }
      else if ((op === '=' || op === '!' || op === '<' || op === '>') && this.src[this.pos] === '=') op += this.src[this.pos++];
      else if ((op === '&' || op === '|') && this.src[this.pos] === op) {
        op += this.src[this.pos++];
        if (this.src[this.pos] === '=') op += this.src[this.pos++];
      }
      else if ((op === '+' || op === '-') && this.src[this.pos] === op) op += this.src[this.pos++];
      else if ("+-*/%&|^!".includes(op) && this.src[this.pos] === '=') op += this.src[this.pos++];
      return op;
    }

    while (this.pos < this.src.length && !/\s/.test(this.src[this.pos]) && !special.includes(this.src[this.pos])) {
      this.pos++;
    }
    return this.src.substring(start, this.pos);
  }

  private parseTopLevel() {
    const type = this.parseToken();
    if (!type) return;

    // Handle struct definition (already pre-scanned, skip the body)
    if (type === 'struct') {
      const structName = this.parseToken();
      if (this.match('{')) {
        // Skip struct body - already parsed in pre-scan
        let depth = 1;
        while (this.pos < this.src.length && depth > 0) {
          const c = this.src[this.pos];
          if (c === '{') depth++;
          else if (c === '}') depth--;
          this.pos++;
        }
        this.match(';');
      } else {
        // struct variable declaration at global scope
        const varName = this.parseToken();
        const structDef = this.structs.get(structName);
        if (structDef && varName) {
          this.globals.set(varName, {
            offset: this.globalOffset,
            type: 'struct:' + structName,
            size: structDef.totalSize,
            pointerDepth: 0
          });
          this.globalOffset += structDef.totalSize;
        }
        this.match(';');
      }
      return;
    }

    // Handle typedef - skip
    if (type === 'typedef') {
      let depth = 0;
      while (this.pos < this.src.length) {
        const c = this.src[this.pos];
        if (c === '{') depth++;
        else if (c === '}') depth--;
        else if (c === ';' && depth === 0) { this.pos++; break; }
        this.pos++;
      }
      return;
    }

    if (!['int', 'char', 'long', 'void', 'addr'].includes(type)) return;
    while (this.match('*')) { /* consume stars */ }
    const name = this.parseToken();
    if (this.match('(')) {
      const params: { name: string, type: string }[] = [];
      if (!this.match(')')) {
        do {
          const pType = this.parseToken();
          let pDepth = 0;
          while (this.match('*')) { pDepth++; }
          const pName = this.parseToken();
          // We cheat a bit and store depth in type for now or just ignore it for params? 
          // No, we need it. 
          // Let's store it in a way we can retrieve.
          // Since params are {name, type}, we might lose depth.
          // Let's hack: type = "int*" if depth 1.
          params.push({ name: pName, type: pType, pointerDepth: pDepth } as any);
        } while (this.match(','));
        this.expect(')');
      }

      if (this.match(';')) return;

      this.expect('{');
      this.asm.push('F_FLAG');
      this.asm.push(`${name}:`);
      this.localOffset = 5;
      this.locals.clear();
      params.forEach((p, i) => {
        // Simple param parsing in parseTopLevel doesn't capture pointer depth properly in 'type' string
        // We'd need to parse stars there too.
        // For now, let's assume params are simple types or we need to fix parseTopLevel param parsing.
        // The params array structure is { name: string, type: string }. 
        // We really should capture depth there.
        // But for this edit, let's update where params are parsed: lines 243-250.
        this.locals.set(p.name, { offset: 5 + i * 4, type: p.type, size: 1, pointerDepth: (p as any).pointerDepth || 0 });
        this.localOffset += 4;
      });
      const localSizePos = this.asm.length;
      this.asm.push('REPLACE_ME_FUNC');
      const prevLocalOffset = this.localOffset;
      this.parseBlock();
      const localVarsSize = this.localOffset - prevLocalOffset;
      // FUNC frameSize paramCount
      // Frame layout: [0-2] saved PC, [3-4] saved BASE, [5+] params, [5+params*4+] locals
      // frameSize must cover: 5 (header) + params*4 (arguments) + localVarsSize
      const frameSize = 5 + (params.length * 4) + localVarsSize;
      this.asm[localSizePos] = `FUNC ${frameSize} ${params.length}`;

      // For main function (void main), we should use EXIT not RET
      // because there's nowhere to return to
      if (name === 'main') {
        // Main should exit directly, not return
        // If there's no explicit return, add EXIT
        const lastInsn = this.asm[this.asm.length - 1].trim();
        if (!lastInsn.startsWith('RET') && !lastInsn.startsWith('EXIT')) {
          this.asm.push('EXIT');
        }
      } else {
        if (type !== 'void') {
          this.asm.push('PUSH_B 0');
        }
        this.asm.push('RET');
      }
      this.locals = new Map();
      this.localOffset = 0;
    } else {
      // Global already handled in pre-scan, but let's skip it and its initializer
      let depth = 0;
      while (this.pos < this.src.length) {
        const c = this.src[this.pos];
        if (c === '{') depth++;
        else if (c === '}') depth--;
        else if (c === ';' && depth === 0) {
          this.pos++;
          break;
        }
        this.pos++;
      }
    }
  }
  private parseBlock() {
    while (this.pos < this.src.length) {
      this.skipWhitespace();
      if (this.src[this.pos] === '}') {
        this.pos++;
        break;
      }
      this.parseStatement();
    }
  }

  private parseStatement() {
    this.skipWhitespace();
    const token = this.peekToken();
    if (!token) return;

    if (token.endsWith(':')) {
      this.parseToken();
      this.asm.push(token);
      return;
    }

    if (token === 'struct') {
      // Local struct variable declaration
      this.parseToken(); // consume 'struct'
      const structTypeName = this.parseToken();
      const structDef = this.structs.get(structTypeName);
      if (!structDef) throw new Error(`Unknown struct type: ${structTypeName}`);
      do {
        const varName = this.parseToken();
        // Register the local variable with struct type
        this.locals.set(varName, {
          offset: this.localOffset,
          type: 'struct:' + structTypeName,
          size: structDef.totalSize,
          pointerDepth: 0
        });
        this.localOffset += structDef.totalSize;
      } while (this.match(','));
      this.expect(';');
      return;
    }

    if (token === 'int' || token === 'char' || token === 'long' || token === 'void' || token === 'addr') {
      this.parseToken();
      do {
        let pointerDepth = 0;
        while (this.match('*')) { pointerDepth++; }
        const name = this.parseToken();
        let size = 1;
        const elementSize = token === 'char' ? 1 : 4;
        const dimensions: number[] = [];
        let isImplicitFirstDim = false;

        while (this.match('[')) {
          if (this.peekToken() === ']') {
            this.parseToken();
            if (dimensions.length > 0) throw new Error("Only the first dimension can be implicit");
            isImplicitFirstDim = true;
            dimensions.push(0);
          } else {
            const start = this.pos;
            let depth = 0;
            while (this.pos < this.src.length) {
              const char = this.src[this.pos];
              if (char === ']') {
                if (depth === 0) break;
                depth--;
              } else if (char === '[') {
                depth++;
              }
              this.pos++;
            }
            const expr = this.src.substring(start, this.pos);
            this.expect(']');
            const dim = this.evalConstant(expr);
            if (isNaN(dim)) throw new Error(`Invalid array dimension: ${expr}`);
            dimensions.push(dim);
          }
        }

        if (dimensions.length > 0) {
          size = dimensions.reduce((a, b) => (b === 0 ? a : a * b), 1);
          if (isImplicitFirstDim) size = 0;
        }

        if (this.match('=')) {
          const initializerToken = this.peekToken();
          if (initializerToken.startsWith('"')) {
            const str = initializerToken.substring(1, initializerToken.length - 1);
            if (size === 0) size = str.length + 1;
          } else if (initializerToken === '{') {
            // Local array initialization with list
            const values: number[] = [];
            const count = this.parseInitializerList(values);
            if (size === 0 && isImplicitFirstDim) {
              const innerSize = dimensions.length > 1 ? dimensions.slice(1).reduce((a, b) => a * b, 1) : 1;
              size = count * innerSize;
            }
            if (size === 0) throw new Error(`Array size required for ${name}`);

            this.locals.set(name, { offset: this.localOffset, type: token, size, pointerDepth, dimensions });
            const baseAddr = this.localOffset;
            this.localOffset += size * elementSize;

            // Generate initialization code
            // We need to store values into the allocated stack space
            // The stack space corresponds to [baseAddr, baseAddr + size*elementSize) relative to BP

            // For each value in values, store it to the appropriate offset
            for (let i = 0; i < values.length; i++) {
              const val = values[i];
              const offset = baseAddr + i * elementSize;

              // 1. Push value first
              this.pushLiteral(val);

              // 2. Calculate address: LEA_L_B/W/D offset
              if (token === 'char') this.asm.push(`LEA_L_B ${offset}`);
              else if (token === 'int') this.asm.push(`LEA_L_W ${offset}`);
              else this.asm.push(`LEA_L_D ${offset}`);

              // 3. Add handle type encoding
              let handleType = '0x10000';
              if (pointerDepth > 0) handleType = '0x40000';
              else if (token === 'int') handleType = '0x20000';
              else if (token === 'long' || token === 'addr') handleType = '0x40000';
              this.asm.push(`PUSH_D ${handleType}`);
              this.asm.push('OR');
              this.asm.push('SWAP');

              // 4. Store
              this.asm.push('STORE');
              // 5. Pop result of store (which is the value)
              this.asm.push('POP');
            }

            // We have handled initialization, so we don't need the generic assignment parsing below
            // which expects a single expression.
            continue;
          }

          if (size === 0) throw new Error(`Array size required for ${name}`);
          this.locals.set(name, { offset: this.localOffset, type: token, size, pointerDepth, dimensions });
          const addr = this.localOffset;
          this.localOffset += size * elementSize;

            // Parse the value expression first
            this.parseExpression();
            // Then get address for the destination variable
            // For pointer variables (pointerDepth > 0), they store a full handle (24-bit),
            // so we treat them as DWORD (4-byte) storage.
            // We use PUSH_W + PUSH_D 0x800000 + OR to avoid pre-baked type bits from LEA.
            if (pointerDepth > 0) {
              // Pointer variable: store as DWORD (handle is 24-bit)
              this.asm.push(`PUSH_W ${addr}`);
              this.asm.push('PUSH_D 0x800000');
              this.asm.push('OR');
              this.asm.push('PUSH_D 0x40000');
              this.asm.push('OR');
            } else {
              // Normal variable: use LEA to get address
              const leaOp = token === 'char' ? 'LEA_L_B' : (token === 'int' ? 'LEA_L_W' : 'LEA_L_D');
              this.asm.push(`${leaOp} ${addr}`);
              // Add handle type encoding (LEA already includes the base type, just OR won't add duplicates
              // since LEA_L_B=0x10000, LEA_L_W=0x20000, LEA_L_D=0x40000 - OR with same value is idempotent)
              let handleType = '0x10000';
              if (token === 'int') handleType = '0x20000';
              else if (token === 'long' || token === 'addr') handleType = '0x40000';
              this.asm.push(`PUSH_D ${handleType}`);
              this.asm.push('OR');
            }
            this.asm.push('SWAP');
            this.asm.push('STORE');
            this.asm.push('POP');
        } else {
          if (size === 0) throw new Error(`Array size required for ${name}`);
          this.locals.set(name, { offset: this.localOffset, type: token, size, pointerDepth });
          this.localOffset += size * elementSize;
        }
      } while (this.match(','));
      this.expect(';');
    } else if (token === 'if') {
      this.parseToken();
      this.expect('(');
      this.parseExpression();
      this.expect(')');
      const labelElse = `L_ELSE_${this.labelCount++}`;
      const labelEnd = `L_END_${this.labelCount++}`;
      this.asm.push(`JZ ${labelElse}`);
      this.parseInnerStatement();
      if (this.match('else')) {
        this.asm.push(`JMP ${labelEnd}`);
        this.asm.push(`${labelElse}:`);
        this.parseInnerStatement();
        this.asm.push(`${labelEnd}:`);
      } else {
        this.asm.push(`${labelElse}:`);
      }
    } else if (token === 'while') {
      this.parseToken();
      const labelStart = `L_WHILE_${this.labelCount++}`;
      const labelEnd = `L_WEND_${this.labelCount++}`;
      this.asm.push(`${labelStart}:`);
      this.expect('(');
      this.parseExpression();
      this.expect(')');
      this.asm.push(`JZ ${labelEnd}`);
      this.breakLabels.push(labelEnd);
      this.continueLabels.push(labelStart);
      this.parseInnerStatement();
      this.breakLabels.pop();
      this.continueLabels.pop();
      this.asm.push(`JMP ${labelStart}`);
      this.asm.push(`${labelEnd}:`);
    } else if (token === 'do') {
      this.parseToken();
      const labelStart = `L_DO_${this.labelCount++}`;
      const labelContinue = `L_DOCONT_${this.labelCount++}`;
      const labelEnd = `L_DOEND_${this.labelCount++}`;
      this.asm.push(`${labelStart}:`);
      this.breakLabels.push(labelEnd);
      this.continueLabels.push(labelContinue);
      this.parseInnerStatement();
      this.breakLabels.pop();
      this.continueLabels.pop();
      this.asm.push(`${labelContinue}:`);
      this.expect('while');
      this.expect('(');
      this.parseExpression();
      this.expect(')');
      this.expect(';');
      this.asm.push(`JNZ ${labelStart}`);
      this.asm.push(`${labelEnd}:`);
    } else if (token === 'switch') {
      this.parseToken();
      this.expect('(');
      this.parseExpression();
      this.expect(')');
      this.expect('{');
      // switch expression is on stack
      const labelEnd = `L_SWEND_${this.labelCount++}`;
      this.breakLabels.push(labelEnd);
      // Parse case labels and body
      // Strategy: collect all case values and generate dispatch code
      // Each case: DUP, PUSH_B caseVal, EQ, JNZ caseLabel
      // After all cases: JMP default/end
      const caseLabels: { val: number | null, label: string }[] = [];
      const caseStmts: { label: string, stmts: string[] }[] = [];
      // Parse all case/default blocks
      while (true) {
        this.skipWhitespace();
        if (this.pos >= this.src.length || this.src[this.pos] === '}') break;
        const nextTok = this.peekToken();
        if (nextTok === 'case') {
          this.parseToken(); // consume 'case'
          // Capture expression until ':'
          const start = this.pos;
          while (this.pos < this.src.length && this.src[this.pos] !== ':') this.pos++;
          const expr = this.src.substring(start, this.pos).trim();
          this.expect(':');
          const val = this.evalConstant(expr);
          const caseLabel = `L_CASE_${this.labelCount++}`;
          caseLabels.push({ val, label: caseLabel });
          // Collect statements until next case/default/}
          const savedAsm = this.asm;
          this.asm = [];
          while (true) {
            this.skipWhitespace();
            if (this.pos >= this.src.length) break;
            const peekTok = this.peekToken();
            if (peekTok === 'case' || peekTok === 'default' || peekTok === 'default:' || peekTok === '}') break;
            this.parseStatement();
          }
          const stmts = this.asm;
          this.asm = savedAsm;
          caseStmts.push({ label: caseLabel, stmts });
        } else if (nextTok === 'default' || nextTok === 'default:') {
          this.parseToken(); // consume 'default' or 'default:'
          // If we got 'default' (without ':'), consume the ':' separately
          if (nextTok === 'default') this.expect(':');
          const caseLabel = `L_CASE_${this.labelCount++}`;
          caseLabels.push({ val: null, label: caseLabel }); // null = default
          const savedAsm = this.asm;
          this.asm = [];
          while (true) {
            this.skipWhitespace();
            if (this.pos >= this.src.length) break;
            const peekTok = this.peekToken();
            if (peekTok === 'case' || peekTok === 'default' || peekTok === 'default:' || peekTok === '}') break;
            this.parseStatement();
          }
          const stmts = this.asm;
          this.asm = savedAsm;
          caseStmts.push({ label: caseLabel, stmts });
        } else {
          // Unexpected - break
          break;
        }
      }
      this.expect('}');
      this.breakLabels.pop();
      // Emit dispatch code
      // switch value is on stack, we'll DUP for each comparison
      for (const c of caseLabels) {
        if (c.val !== null) {
          this.asm.push('DUP');
          this.pushLiteral(c.val);
          this.asm.push('EQ');
          this.asm.push(`JNZ ${c.label}`);
        }
      }
      // Check for default case
      const defaultCase = caseLabels.find(c => c.val === null);
      if (defaultCase) {
        this.asm.push(`JMP ${defaultCase.label}`);
      } else {
        this.asm.push(`JMP ${labelEnd}`);
      }
      // Emit case bodies
      for (const cs of caseStmts) {
        this.asm.push(`${cs.label}:`);
        this.asm.push(...cs.stmts);
      }
      // Pop the switch expression value
      this.asm.push(`${labelEnd}:`);
      this.asm.push('POP'); // pop the original switch expression value
    } else if (token === 'for') {
      this.parseToken();
      this.expect('(');
      if (!this.match(';')) { this.parseExprStmt(); this.expect(';'); }
      const labelStart = `L_FOR_${this.labelCount++}`;
      const labelEnd = `L_FEND_${this.labelCount++}`;
      const labelStep = `L_FSTEP_${this.labelCount++}`;
      this.asm.push(`${labelStart}:`);
      if (!this.match(';')) { this.parseExpression(); this.asm.push(`JZ ${labelEnd}`); this.expect(';'); }
      let stepExprStart = this.pos;
      let parenDepth = 0;
      while (true) {
        if (this.src[this.pos] === '(') parenDepth++;
        if (this.src[this.pos] === ')') {
          if (parenDepth === 0) break;
          parenDepth--;
        }
        this.pos++;
      }
      let stepExprEnd = this.pos;
      this.expect(')');
      this.breakLabels.push(labelEnd);
      this.continueLabels.push(labelStep);
      this.parseInnerStatement();
      this.breakLabels.pop();
      this.continueLabels.pop();
      this.asm.push(`${labelStep}:`);
      const savedPos = this.pos;
      this.pos = stepExprStart;
      if (this.pos < stepExprEnd) { this.parseExprStmt(); }
      this.pos = savedPos;
      this.asm.push(`JMP ${labelStart}`);
      this.asm.push(`${labelEnd}:`);
    } else if (token === 'goto') {
      this.parseToken();
      const label = this.parseToken();
      this.asm.push(`JMP ${label}`);
      this.expect(';');
    } else if (token === 'break') {
      this.parseToken();
      if (this.breakLabels.length === 0) throw new Error("break outside of loop");
      this.asm.push(`JMP ${this.breakLabels[this.breakLabels.length - 1]}`);
      this.expect(';');
    } else if (token === 'continue') {
      this.parseToken();
      if (this.continueLabels.length === 0) throw new Error("continue outside of loop");
      this.asm.push(`JMP ${this.continueLabels[this.continueLabels.length - 1]}`);
      this.expect(';');
    } else if (token === 'return') {
      this.parseToken();
      if (!this.match(';')) {
        this.parseExpression();
        this.expect(';');
      }
      this.asm.push('RET');
    } else {
      this.parseExprStmt();
      this.expect(';');
    }
  }

  private parseInnerStatement() {
    if (this.match('{')) this.parseBlock();
    else this.parseStatement();
  }

  private parseExprStmt() {
    const hasValue = this.parseExpression();
    if (hasValue) {
      this.asm.push('POP');
    }
  }

  private peekNextToken(): string {
    const oldPos = this.pos;
    this.parseToken();
    const next = this.peekToken();
    this.pos = oldPos;
    return next;
  }

  private parseExpression(): boolean {
    return this.parseAssignment();
  }

  private parseAssignment(): boolean {
    const token = this.peekToken();

    // Support *ptr = value
    const savedPos = this.pos;
    const savedAsmLen = this.asm.length;
    if (this.match('*')) {
      try {
        // ... (existing *ptr logic)
        let handleType = '0x10000';
        const savedPos2 = this.pos;
        const possibleVar = this.parseToken();
        const variable = this.locals.get(possibleVar) || this.globals.get(possibleVar);
        if (variable && variable.pointerDepth > 0) {
          if (variable.type === 'int') handleType = '0x20000';
          else if (variable.type === 'long' || variable.type === 'addr') handleType = '0x40000';
        }
        this.pos = savedPos2;
        this.parseUnary(); // Stack: [..., addr]
        const op = this.peekToken();
        const isCompound = op.endsWith('=') && op.length > 1 && !['==', '!=', '<=', '>='].includes(op);
        if (op === '=' || isCompound) {
          this.parseToken(); // consume op
          this.asm.push(`PUSH_D ${handleType}`);
          this.asm.push('OR'); // Stack: [..., handle]
          if (isCompound) {
            this.asm.push('DUP');
            this.asm.push('LD_IND');
            this.parseExpression();
            this.emitCompoundOp(op);
          } else {
            this.parseExpression();
          }
          this.asm.push('STORE');
          // Result of assignment is the value, so it leaves 1 value on stack
          return true;
        }
      } catch (e) { /* Fallthrough */ }
      this.pos = savedPos;
      this.asm.length = savedAsmLen;
    }

    const variable = (token && (this.locals.get(token) || this.globals.get(token))) || null;
    const isLocal = token ? this.locals.has(token) : false;

    if (variable) {
      const oldPos = this.pos;
      const oldAsmLen = this.asm.length;
      this.parseToken(); // consume name

      // Struct member assignment: var.member = expr or var->member = expr
      if (variable.type.startsWith('struct:') && (this.peekToken() === '.' || this.peekToken() === '->')) {
        this.parseToken(); // consume '.' or '->'
        const memberName = this.parseToken();
        const member = this.resolveStructMember(token!, memberName, isLocal);
        if (!member) throw new Error(`Unknown member '${memberName}' in struct`);
        const op = this.peekToken();
        const isCompound = op.endsWith('=') && op.length > 1 && !['==', '!=', '<=', '>='].includes(op);
        if (op === '=' || isCompound) {
          this.parseToken(); // consume op
          const opSuffix = member.type === 'char' ? 'B' : (member.type === 'int' ? 'W' : 'D');
          if (isCompound) {
            const ldPrefix = isLocal ? 'LD_L' : 'LD_G';
            this.asm.push(`${ldPrefix}_${opSuffix} ${member.offset}`);
            this.parseAssignment();
            this.emitCompoundOp(op);
          } else {
            this.parseAssignment();
          }
          const leaPrefix = isLocal ? 'LEA_L' : 'LEA_G';
          this.asm.push(`${leaPrefix}_${opSuffix} ${member.offset}`);
          let handleType = '0x10000';
          if (member.type === 'int') handleType = '0x20000';
          else if (member.type === 'long' || member.type === 'addr') handleType = '0x40000';
          this.asm.push(`PUSH_D ${handleType}`);
          this.asm.push('OR');
          this.asm.push('SWAP');
          this.asm.push('STORE');
          return true;
        }
        // Not an assignment - rollback
        this.pos = oldPos;
        this.asm.length = oldAsmLen;
        return this.parseLogicalOr();
      }

      if (this.match('[')) {
        this.parseExpression();
        this.expect(']');
        let dimIdx = 1;
        while (this.match('[')) {
          if (variable.dimensions && dimIdx < variable.dimensions.length) {
            const nextDim = variable.dimensions[dimIdx];
            this.pushLiteral(nextDim);
            this.asm.push('MUL');
            this.parseExpression();
            this.asm.push('ADD');
            dimIdx++;
          } else {
            this.parseExpression();
            this.asm.push('ADD');
          }
          this.expect(']');
        }
        const op = this.peekToken();
        const isCompound = op.endsWith('=') && op.length > 1 && !['==', '!=', '<=', '>='].includes(op);
        if (op === '=' || isCompound) {
          this.parseToken(); // consume op
          const elementSize = variable.type === 'char' ? 1 : 4;
          if (elementSize > 1) {
            this.pushLiteral(elementSize);
            this.asm.push('MUL');
          }
          if (isLocal) {
            this.pushLiteral(variable.offset);
            this.asm.push('ADD');
            // Manually build handle: offset | HANDLE_BASE_EBP | handle_type
            // Do NOT use LEA_L_PH which forces HANDLE_TYPE_BYTE
            this.asm.push('PUSH_D 0x800000');
            this.asm.push('OR');
          } else {
            this.pushLiteral(variable.offset);
            this.asm.push('ADD');
          }
          const handleType = variable.type === 'char' ? '0x10000' : (variable.type === 'int' ? '0x20000' : '0x40000');
          this.asm.push(`PUSH_D ${handleType}`);
          this.asm.push('OR');
          if (isCompound) {
            this.asm.push('DUP');
            this.asm.push('LD_IND');
            this.parseAssignment();
            this.emitCompoundOp(op);
          } else {
            this.parseAssignment();
          }
          this.asm.push('STORE');
          return true;
        }
        // Not an assignment - rollback both pos and asm
        this.pos = oldPos;
        this.asm.length = oldAsmLen;
      } else {
        const op = this.peekToken();
        const isCompound = op.endsWith('=') && op.length > 1 && !['==', '!=', '<=', '>='].includes(op);
        if (op === '=' || isCompound) {
          this.parseToken(); // consume op
          
          // For compound assignment (e.g., i = i + 1):
          // We need to evaluate the right side expression first, then store
          // The correct order is:
          // 1. Parse right side expression (new value)
          // 2. Get address
          // 3. SWAP to get [value, addr]
          // 4. STORE
          
          const opPrefix = isLocal ? 'LEA_L' : 'LEA_G';
          // Pointer variables store a 24-bit handle (4 bytes), must use D suffix
          const opSuffix = (variable as any).pointerDepth > 0 ? 'D' :
            (variable.type === 'char' ? 'B' : (variable.type === 'int' ? 'W' : 'D'));
          if (isCompound) {
            const ldPrefix = isLocal ? 'LD_L' : 'LD_G';
            this.asm.push(`${ldPrefix}_${opSuffix} ${variable.offset}`);
            this.parseAssignment();
            this.emitCompoundOp(op);
          } else {
            this.parseAssignment();
          }
          
          // Now get the address and prepare for store
          // For local variables, use PUSH_W to get raw offset + HANDLE_BASE_EBP
          if (isLocal) {
            this.asm.push(`PUSH_W ${variable.offset}`);
            this.asm.push('PUSH_D 0x800000');
            this.asm.push('OR');
          } else {
            this.asm.push(`${opPrefix}_${opSuffix} ${variable.offset}`);
          }
          // Add handle type encoding
          let handleType = '0x10000';
          if ((variable as any).pointerDepth > 0) handleType = '0x40000';
          else if (variable.type === 'int') handleType = '0x20000';
          else if (variable.type === 'long' || variable.type === 'addr') handleType = '0x40000';
          this.asm.push(`PUSH_D ${handleType}`);
          this.asm.push('OR');
          this.asm.push('SWAP');
          this.asm.push('STORE');
          return true;
        }
        this.pos = oldPos;
      }
    }
    return this.parseLogicalOr();
  }

  private parseLogicalOr(): boolean {
    let hasValue = this.parseLogicalAnd();
    while (true) {
      if (this.match('||')) {
        this.parseLogicalAnd();
        this.asm.push('L_OR');
        hasValue = true;
      } else break;
    }
    return hasValue;
  }

  private parseLogicalAnd(): boolean {
    let hasValue = this.parseBitwiseOr();
    while (true) {
      if (this.match('&&')) {
        this.parseBitwiseOr();
        this.asm.push('L_AND');
        hasValue = true;
      } else break;
    }
    return hasValue;
  }

  private parseBitwiseOr(): boolean {
    let hasValue = this.parseBitwiseXor();
    while (true) {
      if (this.match('|')) {
        this.parseBitwiseXor();
        this.asm.push('OR');
        hasValue = true;
      } else break;
    }
    return hasValue;
  }

  private parseBitwiseXor(): boolean {
    let hasValue = this.parseBitwiseAnd();
    while (true) {
      if (this.match('^')) {
        this.parseBitwiseAnd();
        this.asm.push('XOR');
        hasValue = true;
      } else break;
    }
    return hasValue;
  }

  private parseBitwiseAnd(): boolean {
    let hasValue = this.parseEquality();
    while (true) {
      if (this.match('&')) {
        this.parseEquality();
        this.asm.push('AND');
        hasValue = true;
      } else break;
    }
    return hasValue;
  }

  private parseEquality(): boolean {
    let hasValue = this.parseRelational();
    while (true) {
      if (this.match('==')) { this.parseRelational(); this.asm.push('EQ'); hasValue = true; }
      else if (this.match('!=')) { this.parseRelational(); this.asm.push('NEQ'); hasValue = true; }
      else break;
    }
    return hasValue;
  }

  private parseRelational(): boolean {
    let hasValue = this.parseShift();
    while (true) {
      if (this.match('<')) { this.parseShift(); this.asm.push('LT'); hasValue = true; }
      else if (this.match('>')) { this.parseShift(); this.asm.push('GT'); hasValue = true; }
      else if (this.match('<=')) { this.parseShift(); this.asm.push('LE'); hasValue = true; }
      else if (this.match('>=')) { this.parseShift(); this.asm.push('GE'); hasValue = true; }
      else break;
    }
    return hasValue;
  }

  private parseShift(): boolean {
    let hasValue = this.parseAdditive();
    while (true) {
      if (this.match('<<')) { this.parseAdditive(); this.asm.push('SHL'); hasValue = true; }
      else if (this.match('>>')) { this.parseAdditive(); this.asm.push('SHR'); hasValue = true; }
      else break;
    }
    return hasValue;
  }

  private parseAdditive(): boolean {
    let hasValue = this.parseTerm();
    while (true) {
      if (this.match('+')) { this.parseTerm(); this.asm.push('ADD'); hasValue = true; }
      else if (this.match('-')) { this.parseTerm(); this.asm.push('SUB'); hasValue = true; }
      else break;
    }
    return hasValue;
  }

  private parseTerm(): boolean {
    let hasValue = this.parseUnary();
    while (true) {
      if (this.match('*')) { this.parseUnary(); this.asm.push('MUL'); hasValue = true; }
      else if (this.match('/')) { this.parseUnary(); this.asm.push('DIV'); hasValue = true; }
      else if (this.match('%')) { this.parseUnary(); this.asm.push('MOD'); hasValue = true; }
      else break;
    }
    return hasValue;
  }

  private parseUnary(): boolean {
    if (this.match('++')) {
      const token = this.parseToken();
      const variable = this.locals.get(token) || this.globals.get(token);
      const isLocal = this.locals.has(token);
      if (variable) {
        const opPrefix = isLocal ? 'LEA_L' : 'LEA_G';
        const opSuffix = variable.type === 'char' ? 'B' : (variable.type === 'int' ? 'W' : 'D');
        this.asm.push(`${opPrefix}_${opSuffix} ${variable.offset}`);
        this.asm.push('INC_PRE');
        return true;
      } else {
        throw new Error(`++ requires lvalue, got ${token} `);
      }
    } else if (this.match('--')) {
      const token = this.parseToken();
      const variable = this.locals.get(token) || this.globals.get(token);
      const isLocal = this.locals.has(token);
      if (variable) {
        const opPrefix = isLocal ? 'LEA_L' : 'LEA_G';
        const opSuffix = variable.type === 'char' ? 'B' : (variable.type === 'int' ? 'W' : 'D');
        this.asm.push(`${opPrefix}_${opSuffix} ${variable.offset}`);
        this.asm.push('DEC_PRE');
        return true;
      } else {
        throw new Error(`-- requires lvalue, got ${token} `);
      }
    } else if (this.match('(')) {
      const savedPos = this.pos;
      const token = this.parseToken();
      if (['int', 'char', 'long', 'void', 'addr'].includes(token)) {
        let pointerDepth = 0;
        while (this.match('*')) { pointerDepth++; }
        this.expect(')');
        this.parseUnary();
        if (pointerDepth > 0) {
          let handleType = '0x10000';
          if (token === 'int') handleType = '0x20000';
          else if (token === 'long' || token === 'addr') handleType = '0x40000';
          this.asm.push(`PUSH_D ${handleType}`);
          this.asm.push('OR');
          this.asm.push('LD_IND');
          return true;
        }
        return true;
      }
      this.pos = savedPos;
      const res = this.parseExpression();
      this.expect(')');
      return res;
    } else if (this.match('*')) {
      const savedPos = this.pos;
      const possibleVar = this.parseToken();
      const variable = this.locals.get(possibleVar) || this.globals.get(possibleVar);
      this.pos = savedPos;
      this.parseUnary();
      // If the expression is a pointer variable (pointerDepth > 0), the value on the stack
      // is already a complete handle (HANDLE_BASE_EBP | type | offset), loaded with LD_L_D.
      // We should NOT OR additional type bits - just call LD_IND directly.
      // If the pointer came from an expression (not a direct variable), we may need type bits.
      if (variable && (variable as any).pointerDepth > 0) {
        // The handle already has correct type bits encoded when the pointer was created via &
        // Just dereference directly
        this.asm.push('LD_IND');
      } else {
        // Fallback: pointer came from a complex expression, add type bits
        let handleType = '0x10000';
        if (variable && variable.type === 'int') handleType = '0x20000';
        else if (variable && (variable.type === 'long' || variable.type === 'addr')) handleType = '0x40000';
        this.asm.push(`PUSH_D ${handleType}`);
        this.asm.push('OR');
        this.asm.push('LD_IND');
      }
      return true;
    } else if (this.match('&')) {
      const token = this.peekToken();
      const variable = this.locals.get(token) || this.globals.get(token);
      const isLocal = this.locals.has(token);
      if (variable) {
        this.parseToken();
        if (this.match('[')) {
          this.parseExpression();
          this.expect(']');
          const elementSize = variable.type === 'char' ? 1 : 4;
          this.asm.push(`PUSH_B ${elementSize}`);
          this.asm.push('MUL');
          if (isLocal) {
            this.asm.push(`PUSH_W ${variable.offset}`);
            this.asm.push('ADD');
            this.asm.push('LEA_L_PH 0');
          } else {
            this.asm.push(`PUSH_W ${variable.offset}`);
            this.asm.push('ADD');
          }
        } else {
          // For &variable, we need the raw offset, not the LEA-encoded address
          // Use PUSH_W/PUSH_D to push raw offset, then add HANDLE_BASE_EBP for local vars
          const op = isLocal ? 'PUSH_W' : 'PUSH_W';
          this.asm.push(`${op} ${variable.offset}`);
          if (isLocal) {
            this.asm.push('PUSH_D 0x800000');
            this.asm.push('OR');
          }
        }
        return true;
      } else {
        throw new Error(`& requires lvalue, got ${token} `);
      }
    } else if (this.match('-')) {
      this.parseUnary();
      this.asm.push('NEG');
      return true;
    } else if (this.match('!')) {
      this.parseUnary();
      this.asm.push('L_NOT');
      return true;
    } else if (this.match('~')) {
      this.parseUnary();
      this.asm.push('NOT');
      return true;
    } else {
      return this.parseFactor();
    }
  }

  private parseFactor(): boolean {
    const token = this.peekToken();
    if (!token) return false;

    if (token === '(') {
      this.parseToken();
      const hasVal = this.parseExpression();
      this.expect(')');
      return hasVal;
    } else if (token.match(/^0x[0-9a-fA-F]+$/)) {
      this.parseToken();
      this.pushLiteral(parseInt(token.substring(2), 16));
      return true;
    } else if (token.match(/^[0-9]+$/)) {
      this.parseToken();
      this.pushLiteral(parseInt(token));
      return true;
    } else if (token.startsWith('"')) {
      this.parseToken();
      this.asm.push(`PUSH_STR ${token}`);
      return true;
    } else if (token.startsWith("'")) {
      this.parseToken();
      this.pushLiteral(this.parseCharLiteral(token));
      return true;
    } else if (token === '_TEXT') {
      this.parseToken();
      this.asm.push('LD_TEXT');
      return true;
    } else if (token === '_GRAPH') {
      this.parseToken();
      this.asm.push('LD_GRAP');
      return true;
    } else if (token === '_GBUF') {
      this.parseToken();
      this.asm.push('LD_GBUF');
      return true;
    } else if (this.functions.has(token) || SystemOp[token as keyof typeof SystemOp] !== undefined) {
      this.parseToken();
      const func = this.functions.get(token);
      this.expect('(');
      const isVariadic = token === 'printf' || token === 'sprintf';
      const args: string[][] = [];
      if (!this.match(')')) {
        do {
          const currentAsm = this.asm;
          this.asm = [];
          this.parseExpression();
          args.push(this.asm);
          this.asm = currentAsm;
        } while (this.match(','));
        this.expect(')');
      }

      for (let i = 0; i < args.length; i++) {
        this.asm.push(...args[i]);
      }

      if (isVariadic) {
        this.asm.push(`PUSH_B ${args.length}`);
      }

      if (SystemOp[token as keyof typeof SystemOp] !== undefined) {
        const expectedCount = LavaXCompiler.SYSCALL_PARAM_COUNTS[token as keyof typeof SystemOp];
        if (expectedCount !== undefined && args.length !== expectedCount) {
          throw new Error(`Function ${token} expects ${expectedCount} arguments, but got ${args.length}`);
        }
        if (token === 'printf' && args.length < 1) {
          throw new Error(`printf expects at least 1 argument`);
        }
        if (token === 'sprintf' && args.length < 2) {
          throw new Error(`sprintf expects at least 2 arguments`);
        }
        this.asm.push(`${token}`);
        return this.SYSCALLS_WITH_RETURN.has(token);
      } else {
        if (func && args.length !== func.params) {
          throw new Error(`Function ${token} expects ${func.params} arguments, but got ${args.length}`);
        }
        this.asm.push(`CALL ${token}`);
        return func?.returnType !== 'void';
      }
    } else if (this.defines.has(token)) {
      this.parseToken();
      const val = this.evalConstant(token);
      this.pushLiteral(val);
      return true;
    } else if (this.locals.has(token) || this.globals.has(token)) {
      this.parseToken();
      const variable = (this.locals.get(token) || this.globals.get(token))!;
      const isLocal = this.locals.has(token);

      // Struct member access: var.member or var->member
      if (variable.type.startsWith('struct:') && (this.peekToken() === '.' || this.peekToken() === '->')) {
        this.parseToken(); // consume '.' or '->'
        const memberName = this.parseToken();
        const member = this.resolveStructMember(token, memberName, isLocal);
        if (!member) throw new Error(`Unknown member '${memberName}' in struct`);
        const opPrefix = isLocal ? 'LD_L' : 'LD_G';
        const opSuffix = member.type === 'char' ? 'B' : (member.type === 'int' ? 'W' : 'D');
        this.asm.push(`${opPrefix}_${opSuffix} ${member.offset}`);
        return true;
      }

      if (this.match('[')) {
        this.parseExpression();
        this.expect(']');
        let dimIdx = 1;
        while (this.match('[')) {
          if (variable.dimensions && dimIdx < variable.dimensions.length) {
            const nextDim = variable.dimensions[dimIdx];
            this.pushLiteral(nextDim);
            this.asm.push('MUL');
            this.parseExpression();
            this.asm.push('ADD');
            dimIdx++;
          } else {
            this.parseExpression();
            this.asm.push('ADD');
          }
          this.expect(']');
        }
        const elementSize = variable.type === 'char' ? 1 : 4;
        if (elementSize > 1) {
          this.pushLiteral(elementSize);
          this.asm.push('MUL');
        }
        if (isLocal) {
          this.pushLiteral(variable.offset);
          this.asm.push('ADD');
          const opSuffix = variable.type === 'char' ? 'B' : (variable.type === 'int' ? 'W' : 'D');
          this.asm.push(`LD_L_O_${opSuffix} 0`);
        } else {
          this.pushLiteral(variable.offset);
          this.asm.push('ADD');
          const opSuffix = variable.type === 'char' ? 'B' : (variable.type === 'int' ? 'W' : 'D');
          this.asm.push(`LD_G_O_${opSuffix} 0`);
        }
      } else if (variable.size > 1) {
        const opPrefix = isLocal ? 'LEA_L' : 'LEA_G';
        const opSuffix = variable.type === 'char' ? 'B' : (variable.type === 'int' ? 'W' : 'D');
        this.asm.push(`${opPrefix}_${opSuffix} ${variable.offset}`);
      } else {
        const opPrefix = isLocal ? 'LD_L' : 'LD_G';
        // Pointer variables store a full 24-bit handle, must use DWORD (4-byte) load
        // regardless of the base type (e.g. int* still uses LD_L_D)
        const opSuffix = (variable as any).pointerDepth > 0 ? 'D' :
          (variable.type === 'char' ? 'B' : (variable.type === 'int' ? 'W' : 'D'));
        this.asm.push(`${opPrefix}_${opSuffix} ${variable.offset}`);
      }

      if (this.match('++')) {
        const opPrefix = isLocal ? 'LEA_L' : 'LEA_G';
        const opSuffix = variable.type === 'char' ? 'B' : (variable.type === 'int' ? 'W' : 'D');
        this.asm.pop();
        this.asm.push(`${opPrefix}_${opSuffix} ${variable.offset}`);
        this.asm.push('INC_POS');
      } else if (this.match('--')) {
        const opPrefix = isLocal ? 'LEA_L' : 'LEA_G';
        const opSuffix = variable.type === 'char' ? 'B' : (variable.type === 'int' ? 'W' : 'D');
        this.asm.pop();
        this.asm.push(`${opPrefix}_${opSuffix} ${variable.offset}`);
        this.asm.push('DEC_POS');
      }
      return true;
    } else {
      throw new Error(`Unexpected token: ${token} `);
    }
  }

  private pushLiteral(val: number) {
    if (val >= 0 && val <= 255) this.asm.push(`PUSH_B ${val}`);
    else if (val >= -32768 && val <= 32767) this.asm.push(`PUSH_W ${val}`);
    else this.asm.push(`PUSH_D ${val}`);
  }

  private parseCharLiteral(token: string): number {
    let char = token.substring(1, token.length - 1);
    if (char.startsWith('\\')) {
      switch (char[1]) {
        case 'n': return 10;
        case 't': return 9;
        case 'r': return 13;
        case '0': return 0;
        case '\\': return 92;
        case "'": return 39;
        case '"': return 34;
        default: return char.charCodeAt(1);
      }
    }
    return char.charCodeAt(0);
  }

  private parseInitializerList(values?: number[]): number {
    // Consumes { ... } and returns number of top-level elements
    this.expect('{');
    let count = 0;
    if (this.peekToken() === '}') {
      this.parseToken();
      return 0;
    }

    do {
      count++;
      const token = this.peekToken();
      if (token === '{') {
        this.parseInitializerList(values); // recurse
      } else {
        const start = this.pos;
        this.skipInitializerElement();
        if (values) {
          const expr = this.src.substring(start, this.pos);
          const val = this.evalConstant(expr.trim().replace(/,$/, '').replace(/\}$/, ''));
          if (!isNaN(val)) values.push(val);
          else values.push(0); // Default for non-constant or complex
        }
      }
    } while (this.match(','));

    this.expect('}');
    return count;
  }

  private skipInitializerElement() {
    let depth = 0;
    while (this.pos < this.src.length) {
      const token = this.peekToken();
      if (token === '{' || token === '(' || token === '[') {
        depth++;
        this.parseToken();
      } else if (token === '}' || token === ')' || token === ']') {
        if (depth === 0) {
          if (token === '}') return; // End of list
          // ) or ] without opening is weird but let's just return if we see comma/semicolon/brace
        }
        depth--;
        this.parseToken();
      } else if (token === ',' && depth === 0) {
        return;
      } else if (token === ';' && depth === 0) {
        return; // Should not happen in init list
      } else {
        this.parseToken();
      }
    }
  }

  private emitCompoundOp(op: string) {
    const baseOp = op.substring(0, op.length - 1);
    const opMap: { [key: string]: string } = {
      '+': 'ADD', '-': 'SUB', '*': 'MUL', '/': 'DIV', '%': 'MOD',
      '&': 'AND', '|': 'OR', '^': 'XOR', '<<': 'SHL', '>>': 'SHR'
    };
    if (opMap[baseOp]) {
      this.asm.push(opMap[baseOp]);
    } else {
      throw new Error(`Unsupported compound operator: ${op} `);
    }
  }

  /**
   * Parse a struct definition: reads member declarations inside { }
   * and registers the struct definition in this.structs.
   * Assumes the opening '{' has already been consumed.
   */
  private parseStructDefinition(structName: string): void {
    const members = new Map<string, StructMember>();
    let offset = 0;

    while (this.pos < this.src.length) {
      this.skipWhitespace();
      if (this.src[this.pos] === '}') {
        this.pos++;
        break;
      }
      const memberType = this.parseToken();
      if (!memberType || !['int', 'char', 'long', 'void', 'addr'].includes(memberType)) {
        // Skip unknown - advance to semicolon
        while (this.pos < this.src.length && this.src[this.pos] !== ';' && this.src[this.pos] !== '}') this.pos++;
        if (this.src[this.pos] === ';') this.pos++;
        continue;
      }
      const elementSize = memberType === 'char' ? 1 : 4;
      do {
        let pointerDepth = 0;
        while (this.match('*')) pointerDepth++;
        const memberName = this.parseToken();
        let size = 1;
        const dimensions: number[] = [];
        while (this.match('[')) {
          const start = this.pos;
          let depth = 0;
          while (this.pos < this.src.length) {
            const c = this.src[this.pos];
            if (c === ']' && depth === 0) break;
            if (c === '[') depth++;
            if (c === ']') depth--;
            this.pos++;
          }
          const expr = this.src.substring(start, this.pos);
          this.expect(']');
          const dim = this.evalConstant(expr);
          if (!isNaN(dim)) {
            dimensions.push(dim);
            size *= dim;
          }
        }
        members.set(memberName, {
          name: memberName,
          type: memberType,
          offset,
          size,
          pointerDepth,
          dimensions: dimensions.length > 0 ? dimensions : undefined
        });
        // Align to element size (simple alignment)
        const memberBytes = size * elementSize;
        offset += memberBytes;
      } while (this.match(','));
      this.expect(';');
    }
    this.match(';'); // optional trailing semicolon after }

    this.structs.set(structName, { members, totalSize: offset });
  }

  /**
   * Resolve struct member access: variable.member or variable->member
   * Returns the member's info for use in load/store operations.
   */
  private resolveStructMember(varName: string, memberName: string, isLocal: boolean): { offset: number, type: string, pointerDepth: number } | null {
    const variable = isLocal ? this.locals.get(varName) : this.globals.get(varName);
    if (!variable) return null;
    const structTypeName = variable.type.startsWith('struct:') ? variable.type.substring(7) : null;
    if (!structTypeName) return null;
    const structDef = this.structs.get(structTypeName);
    if (!structDef) return null;
    const member = structDef.members.get(memberName);
    if (!member) return null;
    return {
      offset: variable.offset + member.offset,
      type: member.type,
      pointerDepth: member.pointerDepth
    };
  }
}

export { LavaXAssembler };
