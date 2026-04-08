# LavStudio AI 协作指南

> 本文档面向 AI 助手，帮助快速理解和处理 LavStudio 项目

## 📚 文档结构

```
docs/ai/
├── INDEX.md              ← 从这里开始
├── QUICK_START.md        ← 快速参考（问题诊断时先读）
├── MODULE_INTERFACES.md  ← 模块接口规范
├── KNOWN_ISSUES.md       ← 已知问题追踪
└── TEST_CASES.md         ← 测试用例集
```

## 🚀 AI 处理流程

### 当你收到一个 LavStudio 相关任务时：

1. **首先读取** `docs/ai/QUICK_START.md`
   - 了解当前核心问题和优先级
   - 掌握调试技巧

2. **根据任务类型**：
   - **修复问题** → 查看 `KNOWN_ISSUES.md`
   - **实现功能** → 查看 `MODULE_INTERFACES.md`
   - **调试运行** → 使用 `TEST_CASES.md` 的测试用例

3. **按需深入**：
   - 不要一次性读取多个模块的实现代码
   - 优先通过接口理解模块
   - 只读取需要修改的模块代码

## 🎯 当前最高优先级任务

1. **VM 栈下溢保护** (VM-001)
   - 位置: `src/vm.ts:pop()`
   - 修复: 栈空时抛出错误而不是返回 lastValue

2. **绘图缓冲区规则统一** (GFX-001)
   - 位置: `src/vm/SyscallHandler.ts`, `src/vm/GraphicsEngine.ts`
   - 修复: 统一处理 mode 参数的 bit 6

3. **反编译器重写** (DC-001)
   - 位置: `src/decompiler.ts`
   - 目标: 实现控制流分析，恢复数组定义和变量声明

## 🔗 关键文件链接

| 文件 | 职责 |
|------|------|
| `src/compiler.ts` | C 源码 → 汇编 |
| `src/compiler/LavaXAssembler.ts` | 汇编 → LAV 字节码 |
| `src/vm.ts` | 执行 LAV 字节码 |
| `src/vm/GraphicsEngine.ts` | 绘图函数实现 |
| `src/vm/SyscallHandler.ts` | 系统调用处理 |
| `src/decompiler.ts` | LAV → 源码 |
| `src/types.ts` | 常量定义和类型 |

## 📖 技术参考

- **LAV 格式规范**: `docs/lav_format.md`
- **LavaX 语言手册**: `docs/LavaX-docs.md`
- **项目状态**: `PROJECT_STATUS.md`（项目根目录）

## 🧪 常用命令

```bash
# 安装依赖
bun install

# 开发模式
bun run dev

# 运行测试
bun run test:simple
bun run test:graphics
bun run test:vm

# 构建
bun run build
```

## ⚠️ 重要约束

1. **上下文限制**: 不要一次处理超过一个模块的实现细节
2. **接口优先**: 通过接口理解模块，而非实现
3. **测试驱动**: 修改后必须更新/添加测试用例
4. **闭环验证**: 确保 源码→编译→运行→反编译→源码 完整流程

## 🔄 闭环目标

```
C 源码 ──编译器──> 汇编代码 ──汇编器──> LAV 字节码
    ↑                                          ↓
    └────────反编译器（当前薄弱）────────── 虚拟机执行
```

**成功标准**: 反编译后的源码能再次编译并产生相同行为

---

## 📝 更新记录

- 2026-02-14: 创建 AI 文档体系

---

**需要帮助？**
- 查看 `QUICK_START.md` 的常见问题
- 参考 `KNOWN_ISSUES.md` 的问题追踪
- 使用 `TEST_CASES.md` 的测试用例验证
