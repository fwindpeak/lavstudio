# 🌋 LavStudio

LavStudio 是一个现代化的基于 Web 的集成开发环境 (IDE) 和 **LavaX** 平台模拟器。LavaX 是一种面向经典手持电子词典（如文曲星/WQX）的类 C 语言。本项目提供完整的浏览器内开发环境，无需安装任何软件即可编写、编译、运行和反编译 LavaX 程序。

[English Version](README.md)

![LavaX Banner](https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6)

## ✨ 特性

- **集成 IDE** — 专为 LavaX C (GVM C) 设计，带语法高亮的深色主题编辑器。
- **LavaX 编译器** — 将类 C 源码编译为汇编中间码，再生成 `.lav` 二进制文件。
- **汇编与反汇编器** — 在汇编文本与 `.lav` 二进制之间互相转换。
- **LavaX 虚拟机 (GVM)** — 32 位基于栈的虚拟机，高保真模拟目标硬件。
- **硬件仿真** — 160×80 黑白点阵屏、GBK 位图字体、键盘输入及基础声音。
- **VFS（虚拟文件系统）** — 基于 IndexedDB 的浏览器内持久化文件存储。
- **反编译器** — 将 `.lav` 二进制文件逆向还原为汇编代码或 C 源码。

## 🚀 技术栈

| | |
|---|---|
| **框架** | [React 18](https://reactjs.org/) |
| **构建工具** | [Vite 6](https://vitejs.dev/) |
| **包管理器** | [Bun](https://bun.sh/) |
| **语言** | TypeScript 5.8 |
| **样式** | [Tailwind CSS 4](https://tailwindcss.com/) |
| **图标** | [Lucide React](https://lucide.dev/) |
| **编码转换** | `iconv-lite`（GBK ↔ UTF-8） |
| **Polyfills** | `vite-plugin-node-polyfills` |

## 📂 项目结构

```text
lavstudio/
├── src/
│   ├── compiler.ts              # LavaX C → 汇编编译器
│   ├── decompiler.ts            # .lav → 汇编 / C 源码反编译器
│   ├── vm.ts                    # LavaX 虚拟机核心 (GVM)
│   ├── types.ts                 # 共享类型、枚举 (Op, Syscall)、常量
│   ├── index.tsx                # 主 React 应用 / IDE 编排
│   ├── index.css                # 全局样式 (Tailwind)
│   ├── compiler/
│   │   └── LavaXAssembler.ts    # 汇编 → .lav 二进制汇编器
│   ├── vm/
│   │   ├── GraphicsEngine.ts    # 160×80 屏幕模拟与绘图原语
│   │   ├── SyscallHandler.ts    # 系统调用分发器 (0x80–0xDF)
│   │   ├── VirtualFileSystem.ts # 内存 VFS（IndexedDB 持久化）
│   │   └── VFSStorageDriver.ts  # IndexedDB 存储后端
│   ├── components/
│   │   ├── Editor.tsx           # 带语法高亮的代码编辑器
│   │   ├── Device.tsx           # 设备模拟器显示
│   │   ├── FileManager.tsx      # VFS 文件管理器 UI
│   │   ├── SoftKeyboard.tsx     # 文曲星布局软键盘
│   │   ├── Terminal.tsx         # 输出终端
│   │   └── dialogs/             # 模态对话框组件
│   ├── hooks/
│   │   └── useLavaVM.ts         # 连接 VM 与 UI 的 React Hook
│   └── i18n/
│       └── index.ts             # UI 国际化字符串
├── public/
│   └── fonts.dat                # 位图字体数据（16×16 和 12×12，GBK）
├── docs/                        # 技术规范与文档
│   ├── lav_format.md            # .lav 文件格式与完整指令集
│   ├── LavaX-docs.md            # LavaX 语言参考手册
│   └── ai/                      # AI 助手文档
├── tests/                       # 测试脚本（使用 Bun 运行）
├── examples/                    # 示例 LavaX C 程序
├── PROJECT_STATUS.md            # 当前状态、已知问题与路线图
└── vite.config.ts               # Vite 配置
```

## 🛠️ 入门指南

### 前置条件

- 已安装 [Bun](https://bun.sh/)。

### 安装

```bash
# 克隆仓库后执行：
bun install
```

### 本地运行

```bash
bun run dev
```

在浏览器中打开 [http://localhost:5173](http://localhost:5173)。

### 生产构建

```bash
bun run build   # 输出到 dist/
bun run preview # 本地预览生产构建
```

## 📖 使用指南

### 编写代码
编辑器支持 LavaX C 语法（C 语言子集）。点击 **BUILD** 按钮将代码编译为汇编和 `.lav` 二进制文件。

### 运行程序
点击 **RUN** 按钮在模拟器中启动程序。可使用界面中的软键盘或物理键盘与程序交互。

### 管理文件
**Filesystem** 标签页支持向 VFS 上传 `.lav` 文件、下载编译好的二进制文件或删除文件。

### 反编译
VFS 中有 `.lav` 文件时，点击 **RECOVER** 按钮可将其反编译为汇编代码或 C 源码。

## 📜 相关文档

| 文档 | 说明 |
|---|---|
| [LAV 格式与指令集](docs/lav_format.md) | 二进制格式规范、全部操作码和系统调用 |
| [LavaX 语言手册](docs/LavaX-docs.md) | 语言语法、数据类型、标准库 |
| [项目状态与路线图](PROJECT_STATUS.md) | 当前状态、已知问题、优先级 |
| [AI 助手文档](docs/ai/INDEX.md) | 模块接口、快速参考、测试用例 |

## ⚖️ 许可证

私有项目。保留所有权利。
