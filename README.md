# 🌋 LavStudio

LavStudio is a modern, web-based IDE and emulator for the **LavaX** platform — a C-like language designed for classic handheld electronic dictionaries (文曲星/WQX). It provides a complete browser-based development environment: write, compile, run, and decompile LavaX programs without installing anything.

[中文版](README_CN.md)

## ✨ Features

- **Integrated IDE** — Dark-themed editor with syntax highlighting for LavaX C (GVM C).
- **LavaX Compiler** — Compiles C-like source code into assembly intermediate code and then to `.lav` binaries.
- **Assembler & Disassembler** — Converts between assembly text and `.lav` binary format.
- **LavaX Virtual Machine (GVM)** — A 32-bit stack-based VM that faithfully emulates the target hardware.
- **Hardware Simulation** — 160×80 monochrome display, GBK bitmap fonts, keyboard input, and basic sound.
- **VFS (Virtual File System)** — Persistent in-browser file storage backed by IndexedDB.
- **Decompiler** — Reverse-engineer `.lav` binaries back to assembly or C source.

## 🚀 Tech Stack

| | |
|---|---|
| **Framework** | [React 18](https://reactjs.org/) |
| **Build Tool** | [Vite 6](https://vitejs.dev/) |
| **Package Manager** | [Bun](https://bun.sh/) |
| **Language** | TypeScript 5.8 |
| **Styling** | [Tailwind CSS 4](https://tailwindcss.com/) |
| **Icons** | [Lucide React](https://lucide.dev/) |
| **Encoding** | `iconv-lite` (GBK ↔ UTF-8) |
| **Polyfills** | `vite-plugin-node-polyfills` |

## 📂 Project Structure

```text
lavstudio/
├── src/
│   ├── compiler.ts              # LavaX C → Assembly compiler
│   ├── decompiler.ts            # .lav → Assembly / C source decompiler
│   ├── vm.ts                    # LavaX Virtual Machine core (GVM)
│   ├── types.ts                 # Shared types, enums (Op, Syscall), constants
│   ├── index.tsx                # Main React app / IDE orchestration
│   ├── index.css                # Global styles (Tailwind)
│   ├── compiler/
│   │   └── LavaXAssembler.ts    # Assembly → .lav binary assembler
│   ├── vm/
│   │   ├── GraphicsEngine.ts    # 160×80 screen emulation & drawing primitives
│   │   ├── SyscallHandler.ts    # System call dispatcher (0x80–0xDF)
│   │   ├── VirtualFileSystem.ts # In-memory VFS with IndexedDB persistence
│   │   └── VFSStorageDriver.ts  # IndexedDB storage backend
│   ├── components/
│   │   ├── Editor.tsx           # Code editor with syntax highlighting
│   │   ├── Device.tsx           # Device emulator display
│   │   ├── FileManager.tsx      # VFS file manager UI
│   │   ├── SoftKeyboard.tsx     # On-screen keyboard (文曲星 layout)
│   │   ├── Terminal.tsx         # Output terminal
│   │   └── dialogs/             # Modal dialog components
│   ├── hooks/
│   │   └── useLavaVM.ts         # React hook connecting the VM to the UI
│   └── i18n/
│       └── index.ts             # UI internationalization strings
├── public/
│   └── fonts.dat                # Bitmap font data (16×16 and 12×12, GBK)
├── docs/                        # Technical specifications and documentation
│   ├── lav_format.md            # .lav file format & full instruction set
│   ├── LavaX-docs.md            # LavaX language reference manual
│   └── ai/                      # AI-assistant documentation
├── tests/                       # Test scripts (run with Bun)
├── examples/                    # Sample LavaX C programs
├── PROJECT_STATUS.md            # Current status, known issues & roadmap
└── vite.config.ts               # Vite configuration
```

## 🛠️ Getting Started

### Prerequisites

- [Bun](https://bun.sh/) installed on your machine.

### Installation

```bash
# Clone the repository, then:
bun install
```

### Running Locally

```bash
bun run dev
```

Open [http://localhost:5173](http://localhost:5173) in your browser.

### Building for Production

```bash
bun run build   # outputs to dist/
bun run preview # serve the production build locally
```

## 📖 Usage Guide

### Writing Code
The editor supports LavaX C syntax (a subset of C). Click **BUILD** to compile to assembly and `.lav` binary.

### Running Applications
Click **RUN** to launch your program in the emulator. Use the on-screen keyboard or your physical keyboard to interact.

### Managing Files
The **Filesystem** tab lets you upload `.lav` files into the VFS, download compiled binaries, or delete files.

### Decompilation
With a `.lav` file in the VFS, click **RECOVER** to decompile it back to assembly or C source.

## 📜 Documentation

| Document | Description |
|---|---|
| [LAV Format & Instruction Set](docs/lav_format.md) | Binary format spec, all opcodes and system calls |
| [LavaX Language Manual](docs/LavaX-docs.md) | Language syntax, data types, standard library |
| [Project Status & Roadmap](PROJECT_STATUS.md) | Current state, known issues, priorities |
| [AI Assistant Docs](docs/ai/INDEX.md) | Module interfaces, quick reference, test cases |

## ⚖️ License

Private Project. All rights reserved.
