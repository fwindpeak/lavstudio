# LavStudio AI 文档索引

> **优先读取顺序**：AI 处理 LavStudio 相关任务时，按以下顺序读取文档

## 📖 文档结构

```
lavstudio/                          ← 项目根目录
├── PROJECT_STATUS.md               ← 项目整体状态与路线图
└── docs/
    ├── ai/
    │   ├── INDEX.md                ← 你在这里（入口文档）
    │   ├── README.md               ← AI 协作指南
    │   ├── QUICK_START.md          ← 快速参考（处理问题时先读）
    │   ├── LAV_FORMAT_REFERENCE.md ← LAV 格式与指令集详细参考
    │   ├── LAV_CHEATSHEET.md       ← 指令速查表
    │   ├── PROGRAMMING_PATTERNS.md ← 编程模式指南
    │   ├── LOOP_CLOSURE_TEST.md    ← 闭环测试指南
    │   ├── MODULE_INTERFACES.md    ← 模块接口规范
    │   ├── KNOWN_ISSUES.md         ← 已知问题追踪
    │   └── TEST_CASES.md           ← 测试用例集
    ├── lav_format.md               ← LAV 字节码格式规范（完整版）
    └── LavaX-docs.md               ← LavaX 语言手册（完整版）
```

## 🎯 使用指南

### 场景 1：修复特定模块问题
1. 先读 `QUICK_START.md` 了解当前状态
2. 读 `KNOWN_ISSUES.md` 查看是否已知问题
3. 读 `MODULE_INTERFACES.md` 查看目标模块接口
4. 按需读取 `LAV_FORMAT_REFERENCE.md` 了解指令细节
5. 按需读取具体实现代码

### 场景 2：实现新功能
1. 读 `MODULE_INTERFACES.md` 了解模块边界
2. 读 `LAV_FORMAT_REFERENCE.md` 了解指令集
3. 读 `PROGRAMMING_PATTERNS.md` 了解代码生成模式
4. 查看相关模块的接口定义
5. 实现后更新 `TEST_CASES.md`

### 场景 3：调试运行问题
1. 读 `QUICK_START.md` 的「调试技巧」
2. 读 `KNOWN_ISSUES.md` 的「常见问题」
3. 使用 `TEST_CASES.md` 的测试用例验证
4. 参考 `LAV_FORMAT_REFERENCE.md` 分析字节码

### 场景 4：快速查找指令
- 使用 `LAV_CHEATSHEET.md` 快速查找常用指令
- 或参考 `LAV_FORMAT_REFERENCE.md` 的完整表格

### 场景 5：闭环验证
- 读 `LOOP_CLOSURE_TEST.md` 了解测试流程
- 运行 `tests/loop_closure_test.ts` 验证完整流程

## 🔧 模块概览

| 模块 | 文件路径 | 职责 | 状态 |
|------|----------|------|------|
| **Compiler** | `src/compiler.ts` | C 源码 → 汇编中间码 | ⚠️ 数组/结构体问题 |
| **Assembler** | `src/compiler/LavaXAssembler.ts` | 汇编 → LAV 字节码 | ✅ 基本稳定 |
| **VM** | `src/vm.ts` | 执行 LAV 字节码 | ⚠️ 栈下溢保护已修复，待验证 |
| **Graphics** | `src/vm/GraphicsEngine.ts` | 绘图函数实现 | ⚠️ 缓冲区规则待确认 |
| **Syscall** | `src/vm/SyscallHandler.ts` | 系统调用处理 | ✅ 基本完整 |
| **Decompiler** | `src/decompiler.ts` | LAV → 汇编/源码 | ⚠️ 部分完成，需生成可编译代码 |
| **VFS** | `src/vm/VirtualFileSystem.ts` | 虚拟文件系统 | ✅ 可用 |

## 📚 文档说明

| 文档 | 内容 | 用途 |
|------|------|------|
| **QUICK_START.md** | 当前状态、核心问题、调试技巧 | 问题诊断时先读 |
| **LAV_FORMAT_REFERENCE.md** | LAV 格式、完整指令集、系统调用 | 需要指令详情时读 |
| **LAV_CHEATSHEET.md** | 常用指令速查表 | 快速查找指令 |
| **PROGRAMMING_PATTERNS.md** | 常见编程模式的汇编实现 | 代码生成参考 |
| **LOOP_CLOSURE_TEST.md** | 闭环测试说明和指南 | 验证完整流程 |
| **MODULE_INTERFACES.md** | 各模块接口定义 | 模块开发参考 |
| **KNOWN_ISSUES.md** | 已知问题追踪 | 排查问题时读 |
| **TEST_CASES.md** | 测试用例集 | 验证修复时读 |

## 🚨 关键限制（AI 注意）

1. **上下文限制**：不要一次性读取多个模块的实现细节
2. **接口优先**：优先通过接口理解模块，而非实现
3. **测试驱动**：修改后必须更新/添加测试用例
4. **闭环验证**：确保 源码→编译→运行→反编译→源码 完整流程

## 📚 外部参考

- **LAV 格式规范完整版**: `docs/lav_format.md`
- **LavaX 语言手册完整版**: `docs/LavaX-docs.md`
- **项目状态**: `PROJECT_STATUS.md`（项目根目录）

## 🎯 当前最高优先级任务

1. **验证 VM 栈下溢修复** - 运行 `tests/repro_underflow.ts`
2. **验证绘图函数** - 运行 `tests/verify_graphics_rules.ts`
3. **完善反编译器** - 实现控制流结构化，生成可编译 C 代码
4. **编译器兼容性** - 对比正式 VM 文件格式

---
*最后更新：2026-02-14*
