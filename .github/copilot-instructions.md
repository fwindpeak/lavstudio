# LavStudio — GitHub Copilot Instructions

## 📌 Project Overview

**LavStudio** is a web-based IDE and emulator for the **LavaX** platform — a C-like language targeting classic handheld electronic dictionaries (文曲星/WQX, 160×80 monochrome display). The entire toolchain runs in the browser.

The pipeline is:
```
LavaX C Source ──[Compiler]──> Assembly ──[Assembler]──> .lav Binary ──[VM]──> Execution
                                                                           ↓
                                                               [Decompiler] → ASM / C Source
```

---

## 🛠️ Tech Stack

| Technology | Purpose |
|---|---|
| **React 18** | UI framework |
| **TypeScript 5.8** | Primary language |
| **Vite 6** | Build tool & dev server |
| **Bun** | Package manager & runtime |
| **Tailwind CSS 4** | Styling |
| **Lucide React** | Icons |
| **iconv-lite** | GBK/UTF-8 encoding conversion |
| **vite-plugin-node-polyfills** | Node.js globals in the browser |

---

## 📁 Repository Structure

```
lavstudio/
├── src/
│   ├── compiler.ts                  # LavaX C → Assembly compiler
│   ├── decompiler.ts                # .lav → Assembly / C source decompiler
│   ├── vm.ts                        # LavaX Virtual Machine core (GVM)
│   ├── types.ts                     # Shared types, enums (Op, Syscall), constants
│   ├── index.tsx                    # Main React app / IDE orchestration
│   ├── index.css                    # Global styles (Tailwind)
│   ├── compiler/
│   │   └── LavaXAssembler.ts        # Assembly → .lav binary assembler
│   ├── vm/
│   │   ├── GraphicsEngine.ts        # 160×80 screen emulation & drawing primitives
│   │   ├── SyscallHandler.ts        # System call dispatcher (0x80–0xDF)
│   │   ├── VirtualFileSystem.ts     # In-memory VFS with IndexedDB persistence
│   │   └── VFSStorageDriver.ts      # IndexedDB storage backend for VFS
│   ├── components/
│   │   ├── Editor.tsx               # Code editor with syntax highlighting
│   │   ├── Device.tsx               # Device emulator display
│   │   ├── FileManager.tsx          # VFS file manager UI
│   │   ├── SoftKeyboard.tsx         # On-screen keyboard (文曲星 layout)
│   │   ├── Terminal.tsx             # Output terminal
│   │   └── dialogs/                 # Modal dialog components
│   ├── hooks/
│   │   └── useLavaVM.ts             # React hook wiring the VM to the UI
│   ├── i18n/
│   │   └── index.ts                 # Internationalization strings
│   └── vst/
│       └── LavParser.ts             # .lav VST file parser
├── public/
│   └── fonts.dat                    # Binary font data (16×16 and 12×12 bitmap fonts)
├── docs/
│   ├── lav_format.md                # .lav file format & full instruction set spec
│   ├── LavaX-docs.md                # LavaX language reference manual
│   ├── target.md                    # Project goals & requirements
│   ├── PROBLEM_ANALYSIS.md          # Analysis of specific bugs
│   └── ai/                          # AI assistant documentation
│       ├── INDEX.md                 # Entry point for AI docs
│       ├── README.md                # AI collaboration guide
│       ├── QUICK_START.md           # Quick reference (read first)
│       ├── MODULE_INTERFACES.md     # Module API contracts
│       ├── LAV_FORMAT_REFERENCE.md  # Instruction set quick reference
│       ├── LAV_CHEATSHEET.md        # Instruction cheat sheet
│       ├── PROGRAMMING_PATTERNS.md  # Code generation patterns
│       ├── LOOP_CLOSURE_TEST.md     # End-to-end test guide
│       ├── KNOWN_ISSUES.md          # Bug tracker
│       └── TEST_CASES.md            # Test case collection
├── tests/                           # Test scripts (run with `bun`)
├── examples/                        # Sample LavaX C programs
├── PROJECT_STATUS.md                # Current project status & roadmap
├── package.json
├── vite.config.ts
└── tsconfig.json
```

---

## 🧩 Core Module APIs

### Compiler (`src/compiler.ts`)
```typescript
class LavaXCompiler {
  compile(source: string): string  // Returns assembly text, or "ERROR: ..." on failure
}
```
- Input: LavaX C source (subset of C: `int`, `char`, `long`, `float`, `addr`, arrays, pointers)
- Output: Text-format assembly for the assembler
- All string literals are GBK-encoded

### Assembler (`src/compiler/LavaXAssembler.ts`)
```typescript
class LavaXAssembler {
  assemble(asm: string): Uint8Array  // Returns raw .lav binary
}
```
- Input: Assembly text from the compiler
- Output: 16-byte header + bytecode

### Virtual Machine (`src/vm.ts`)
```typescript
class LavaXVM {
  debug: boolean                    // Enable per-instruction logging
  load(lav: Uint8Array): void       // Load a .lav binary
  run(): Promise<void>              // Execute until EXIT or error
  reset(): void                     // Reset VM state
}
```
- 32-bit stack-based architecture
- Memory: 1 MB total; VRAM @ 0x0000, GBUF @ 0x0640, TEXT @ 0x0C80, globals @ 0x2000+
- System calls: 0x80–0xDF (see `src/types.ts` `Syscall` enum)

### Decompiler (`src/decompiler.ts`)
```typescript
class LavaXDecompiler {
  disassemble(lav: Uint8Array): string  // .lav → assembly text
  decompile(lav: Uint8Array): string    // .lav → C source (experimental)
}
```

---

## 📋 Key Constants & Types (`src/types.ts`)

- `Op` enum — all VM opcodes (0x00–0x68+)
- `Syscall` enum — all system call IDs (0x80–0xDF)
- `SCREEN_WIDTH = 160`, `SCREEN_HEIGHT = 80`
- `MEMORY_SIZE = 1 MB`
- Memory offsets: `VRAM_OFFSET`, `GBUF_OFFSET`, `TEXT_OFFSET`, `GLOBAL_RAM_START`

---

## 📄 .lav File Header (16 bytes)

| Offset | Size | Field | Value |
|---|---|---|---|
| 0x00 | 3 | magic | `LAV` (0x4C 0x41 0x56) |
| 0x03 | 1 | version | `0x12` (18) |
| 0x04 | 1 | padding | `0x00` |
| 0x05 | 1 | strMask | XOR mask for string decryption |
| 0x06 | 2 | arrayInitSpace | Size of `#loadall` segment (LE u16) |
| 0x08 | 3 | entryPoint | Entry PC (LE u24, always `0x000010`) |
| 0x0B | 5 | padding | `0x00` × 5 |

---

## 🖥️ Graphics Engine (`src/vm/GraphicsEngine.ts`)

- Screen: 160×80 monochrome (1-bit per pixel)
- Two buffers: **VRAM** (display buffer) and **GBUF** (offscreen buffer)
- Drawing mode bit 6: `0` = VRAM, `1` = GBUF (Rule A for Point/Line/Box/Circle/Ellipse/GetBlock)
- `TextOut`, `WriteBlock`, `FillArea` use inverted rule (Rule B)
- Font rendering uses `fonts.dat` (16×16 and 12×12 bitmap fonts, GBK encoded)

---

## 🔧 Development Commands

```bash
# Install dependencies
bun install

# Start dev server (http://localhost:5173)
bun run dev

# Production build (outputs to dist/)
bun run build

# Preview production build
bun run preview

# Run tests (Bun runtime)
bun run test:simple      # Basic compiler/VM tests
bun run test:compiler    # Compiler tests
bun run test:vm          # VM tests
bun run test:graphics    # Graphics tests
bun run test:full        # Full integration tests
```

---

## ⚠️ Known Limitations

| Area | Issue |
|---|---|
| Compiler | Struct support is incomplete |
| Compiler | Float literals not fully handled |
| Compiler | Complex nested expressions may fail |
| Compiler | Generated `.lav` may not run on real hardware |
| VM | Stack overflow check is incomplete |
| VM | Float precision differs from native LavaX |
| Decompiler | Control-flow recovery (if/while/for) is experimental |
| IDE | Chinese IME input experience needs improvement |

---

## 🏗️ Coding Conventions

- **Language**: TypeScript strict mode
- **Style**: No trailing spaces in labels/directives; follow existing code formatting
- **Assembly labels**: `L_ELSE_0:` format (no trailing space before colon)
- **String encoding**: All string literals must be GBK-encoded via `iconv-lite`
- **Error returns**: Compiler errors are returned as `"ERROR: <message>"` strings
- **No test runner**: Tests are standalone TypeScript scripts run directly with `bun`
- **React**: Functional components with hooks; no class components
- **Tailwind**: Dark-themed UI; use existing Tailwind utility classes

---

## 🔄 End-to-End Flow

The complete round-trip is:
1. **Edit** LavaX C source in the IDE
2. **BUILD** → `LavaXCompiler.compile()` → assembly text
3. **BUILD** → `LavaXAssembler.assemble()` → `.lav` binary stored in VFS
4. **RUN** → `LavaXVM.load()` + `run()` → renders to 160×80 canvas
5. **RECOVER** → `LavaXDecompiler.decompile()` → recovers C source from `.lav`

---

## 📚 Reference Documents

- Full instruction set: `docs/lav_format.md`
- LavaX language manual: `docs/LavaX-docs.md`
- Quick reference for AI: `docs/ai/QUICK_START.md`
- Module interfaces: `docs/ai/MODULE_INTERFACES.md`
- Known bugs: `docs/ai/KNOWN_ISSUES.md`
