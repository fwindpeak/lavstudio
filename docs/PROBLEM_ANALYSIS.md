# 问题分析报告

## 中文镜像问题

### 分析结果：无需修复

经过详细的位运算分析，发现 TextOut 的 hFlip (bit5) 实现是正确的：

- ASCII 字符 (6/8pt)：hFlip 正确
- 16pt 中文字符 (w=16)：hFlip 正确  
- 12pt 中文字符 (w=12)：hFlip 正确

### 验证方法

运行 `test_render.ts` 可以验证中文字符正确渲染：

```bash
cd /Users/guokai/code/myprj/LavStudio
bun test_render.ts
```

输出显示 "中文测试 ABC" 正确渲染。

### 用户报告的可能原因

- 某些 lav 文件设置了 type & 0x20 (hFlip bit)
- 或特定字符的视觉错觉

---

## 闪退/栈下溢问题

### 分析结果：VFS 文件缺失

### 根因

真实 lav 程序需要外部数据文件：

```
/LavaData/RichPic.dat
/LavaData/RichCfig.dat
/GVMData/RichPic.dat
/GVMData/RichCfig.dat
```

这些文件在 VFS 中不存在。

### 栈下溢警告说明

```
[VM Warning] Stack Underflow at PC=0x146b, using lastValue=0x-1
```

这不是 bug！JZ 指令在 SP=0 时使用 lastValue 是正确的 VM 行为：
- LavX 程序故意用 EQ + POP + JZ(SP=0) 的模式
- JZ 检测 lastValue (上一条 POP 的结果) 来决定跳转

### 解决方案

选项 1：添加缺失的 VFS 文件
- 需要获取或创建 RichPic.dat, RichCfig.dat 等文件

选项 2：修改 VFS.openFile() 行为
- 当前：文件不存在时返回 handle=0（空文件）
- 建议：文件不存在时返回 -1（错误码）
