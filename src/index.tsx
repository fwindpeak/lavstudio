
import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import './index.css';
import { createRoot } from 'react-dom/client';
import {
  Play, Square, FileCode, Monitor, FolderOpen, Terminal as TerminalIcon,
  Settings, KeyRound, Save, Download, Trash2, Cpu, Braces, Binary, SearchCode, Zap, Bug
} from 'lucide-react';
import { FileManager } from './components/FileManager';
import { Terminal as LavaTerminal } from './components/Terminal';
import { useLavaVM } from './hooks/useLavaVM';
import { Editor } from './components/Editor';
import { Device } from './components/Device';
import { LavaXDecompiler } from './decompiler';
import { DialogProvider } from './components/dialogs/DialogContext';
import iconv from 'iconv-lite';
import { Buffer } from 'buffer';



const EXAMPLES = [
  {
    name: 'hello.c',
    content: `void main() {
  printf("Hello, LavaX!\\n");
  printf("Press any key...\\n");
  getchar();
}`
  },
  {
    name: 'graphics.c',
    content: `void main() {
  ClearScreen();
  Line(0, 0, 159, 79, 1);
  Circle(80, 40, 30, 0, 1);
  getchar();
  ClearScreen();
  char fa[]={
    0xff,0xe0,0x80,0x20,0xbb,0xa0,0x8a,0x20,
    0x91,0x20,0xa0,0xa0,0xbb,0xa0,0x8a,0xa0,
    0xba,0xa0,0xa0,0x20,0xbb,0xa0,0x8a,0xa0,
    0x89,0x20,0xba,0xa0,0x80,0x20,0xff,0xe0};
  WriteBlock(60, 30, 11, 16, 1, fa);
  WriteBlock(80, 30, 11, 16, 2, fa);
  WriteBlock(96, 30, 16, 16, 0x21, fa);
  Refresh();
  getchar();
}`
  },
  {
    name: 'input_demo.c',
    content: `void main() {
  int key;
  printf("Press keys... (ESC to exit)\\n");
  while((key = getchar()) != 27) {
    printf("Key: %d\\n", key);
  }
}`
  },
  {
    name: 'draw_color.c',
    content: `char palette[] = {255,0,0,0,0,0,255,0};

void main()
{
 SetGraphMode(8);
 SetFgColor(205);
 TextOut(60, 30, "LavaX", 0x81);
 SetFgColor(206);
 TextOut(40, 50, "请按任意键", 0x81);
 Refresh();
 getchar();
 SetPalette(205, 2, palette);
 getchar();
}`
  }
];

interface Tab { id: string; name: string; content: string; asm?: string; bin?: Uint8Array; }

export function App() {
  const [tabs, setTabs] = useState<Tab[]>(() => {
    const saved = localStorage.getItem('lavax_tabs');
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch (e) {
        return [{ id: 'default', name: 'main.c', content: EXAMPLES[0].content }];
      }
    }
    const legacyCode = localStorage.getItem('lavax_code');
    return [{ id: 'default', name: 'main.c', content: legacyCode || EXAMPLES[0].content }];
  });
  const [activeTabId, setActiveTabId] = useState(tabs[0]?.id || 'default');
  const [editingTabId, setEditingTabId] = useState<string | null>(null);
  const [showExamples, setShowExamples] = useState(false);

  const { running, logs, screen, compile, run, stop, pushKey, releaseKey, vm, compiler, assembler, setLogs, clearLogs } = useLavaVM(() => { });
  const decompiler = useMemo(() => new LavaXDecompiler(), []);

  const activeTab = useMemo(() => tabs.find(t => t.id === activeTabId) || tabs[0], [tabs, activeTabId]);
  const setCode = useCallback((newContent: string) => {
    setTabs(prev => prev.map(t => t.id === activeTabId ? { ...t, content: newContent } : t));
  }, [activeTabId]);
  const setAsm = useCallback((newAsm: string) => {
    setTabs(prev => prev.map(t => t.id === activeTabId ? { ...t, asm: newAsm } : t));
  }, [activeTabId]);

  const updateTabName = (id: string, newName: string) => {
    setTabs(prev => prev.map(t => t.id === id ? { ...t, name: newName } : t));
    setEditingTabId(null);
  };

  const loadExample = (ex: typeof EXAMPLES[0]) => {
    const id = Math.random().toString(36).substr(2, 9);
    setTabs([...tabs, { id, name: ex.name, content: ex.content }]);
    setActiveTabId(id);
    setShowExamples(false);
  };

  const handleOpenFileFromVFS = useCallback((path: string, content: string | Uint8Array) => {
    // Check if tab already exists
    const existing = tabs.find(t => t.name === path);
    if (existing) {
      setActiveTabId(existing.id);
      return;
    }

    let textContent = "";
    if (content instanceof Uint8Array) {
      textContent = iconv.decode(Buffer.from(content), 'gbk');
    } else {
      textContent = content;
    }

    const id = Math.random().toString(36).substr(2, 9);
    setTabs([...tabs, { id, name: path, content: textContent }]);
    setActiveTabId(id);
  }, [tabs]);

  const saveToVFS = useCallback(() => {
    if (!activeTab) return;
    const gbkData = iconv.encode(activeTab.content, 'gbk');
    vm.vfs.addFile(activeTab.name, new Uint8Array(gbkData));
    setLogs(p => [...p, `Source saved to VFS: ${activeTab.name}`]);
  }, [activeTab, vm]);

  const code = activeTab?.content || "";

  const [viewMode, setViewMode] = useState<'editor' | 'asm' | 'hex' | 'vfs'>('editor');
  const [rightTab, setRightTab] = useState<'emulator' | 'files'>('emulator');
  const [debugMode, setDebugMode] = useState(false);

  useEffect(() => {
    localStorage.setItem('lavax_tabs', JSON.stringify(tabs.map(t => ({ ...t, bin: undefined })))); // Don't save large binaries to localstorage
  }, [tabs]);

  const addTab = () => {
    const id = Math.random().toString(36).substr(2, 9);
    const newTab = { id, name: `untitled_${tabs.length}.c`, content: "" };
    setTabs([...tabs, newTab]);
    setActiveTabId(id);
  };

  const closeTab = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (tabs.length === 1) return;
    const newTabs = tabs.filter(t => t.id !== id);
    setTabs(newTabs);
    if (activeTabId === id) setActiveTabId(newTabs[0].id);
  };

  useEffect(() => {
    vm.debug = debugMode;
  }, [debugMode, vm]);

  const handleEditorScroll = (e: React.UIEvent<HTMLTextAreaElement>) => {
    const target = e.target as HTMLTextAreaElement;
    const pre = target.previousSibling as HTMLPreElement;
    if (pre) {
      pre.scrollTop = target.scrollTop;
      pre.scrollLeft = target.scrollLeft;
    }
  };



  const build = useCallback(() => {
    const res = compile(code);
    const fileName = activeTab?.name.replace(/\.c$/, '') || 'program';
    if (res.bin) {
      setTabs(prev => prev.map(t => t.id === activeTabId ? { ...t, asm: res.asm, bin: res.bin! } : t));

      // Save to VFS
      const lavName = `${fileName}.lav`;
      vm.vfs.addFile(lavName, res.bin);

      setLogs(p => [...p, `Build: Success! ${lavName} generated and saved to VFS.`]);
    } else {
      setLogs(p => [...p, "Build: Failed. Check editor for errors."]);
    }
    return res.bin;
  }, [code, compile, activeTabId, activeTab, vm]);

  const assemble = useCallback(() => {
    if (!activeTab?.asm) return;
    try {
      const bin = assembler.assemble(activeTab.asm);
      setTabs(prev => prev.map(t => t.id === activeTabId ? { ...t, bin } : t));
      setLogs(p => [...p, "Assembly: Success! Binary updated."]);
      return bin;
    } catch (e: any) {
      setLogs(p => [...p, `Assembly Error: ${e.message}`]);
    }
  }, [activeTabId, activeTab?.asm, assembler]);

  const handleRun = async () => {
    const bin = build();
    if (bin) {
      setRightTab('emulator');
      await run(bin);
    }
  };

  const handleDecompile = (data?: Uint8Array) => {
    const target = data || activeTab?.bin;
    if (!target || target.length === 0) { setLogs(p => [...p, "Error: No binary to decompile."]); return; }

    const recoveredCode = decompiler.decompile(target);
    const disassembledAsm = decompiler.disassemble(target);

    setTabs(prev => prev.map(t => t.id === activeTabId ? { ...t, content: recoveredCode, asm: disassembledAsm, bin: target } : t));

    setViewMode('editor');
    setLogs(p => [...p, "Decompiler: Source recovered."]);
  };

  const terminalLogs = useMemo(() => logs.map(l => ({ text: l, time: new Date().toLocaleTimeString() })), [logs]);

  return (
    <div className="flex flex-col h-screen bg-[#0a0a0c] text-slate-100 font-sans selection:bg-purple-500/30 overflow-hidden">
      {/* Header */}
      <header className="h-16 border-b border-white/5 bg-black/40 backdrop-blur-xl flex items-center justify-between px-6 z-10 shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-gradient-to-br from-purple-500 to-blue-600 rounded-xl flex items-center justify-center shadow-lg shadow-purple-500/20">
            <Cpu className="w-6 h-6 text-white" />
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tight bg-gradient-to-r from-white to-slate-400 bg-clip-text text-transparent">
              LavStudio <span className="text-xs font-mono text-purple-400/80 px-2 py-0.5 rounded-full bg-purple-500/10 border border-purple-500/20 ml-1">v0x12</span>
            </h1>
            <p className="text-[10px] text-slate-500 font-mono uppercase tracking-widest leading-none mt-1">LavaX VM Integrated Environment</p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <div className="relative">
            <button
              onClick={() => setShowExamples(!showExamples)}
              className="text-[11px] font-bold text-neutral-400 hover:text-white px-3 py-2 rounded-lg border border-white/5 bg-white/5 transition-all flex items-center gap-2"
            >
              <FileCode size={14} /> EXAMPLES
            </button>
            {showExamples && (
              <div className="absolute top-full left-0 mt-2 w-48 bg-neutral-900 border border-white/10 rounded-xl shadow-2xl z-50 py-2 overflow-hidden">
                {EXAMPLES.map((ex, i) => (
                  <button
                    key={i}
                    onClick={() => loadExample(ex)}
                    className="w-full text-left px-4 py-2 text-[11px] text-neutral-400 hover:text-white hover:bg-white/5 transition-colors"
                  >
                    {ex.name}
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="flex items-center bg-white/5 rounded-xl p-1 border border-white/10">
            <button
              onClick={build}
              className="px-4 py-2 text-[11px] font-black uppercase tracking-widest text-blue-400 hover:bg-blue-400/10 rounded-lg transition-all flex items-center gap-2"
              title="Compile Source to Assembly & Binary"
            >
              <Zap size={14} className="fill-current" /> BUILD
            </button>
            <div className="w-px h-4 bg-white/10 mx-1"></div>
            <button
              onClick={assemble}
              className="px-4 py-2 text-[11px] font-black uppercase tracking-widest text-emerald-400 hover:bg-emerald-400/10 rounded-lg transition-all flex items-center gap-2"
              title="Assemble Assembly to Binary"
            >
              <Binary size={14} /> ASSEMBLE
            </button>
            <div className="w-px h-4 bg-white/10 mx-1"></div>
            <button
              onClick={() => handleDecompile()}
              className="px-4 py-2 text-[11px] font-black uppercase tracking-widest text-amber-400 hover:bg-amber-400/10 rounded-lg transition-all flex items-center gap-2"
              title="Decompile Binary back to Source & Assembly"
            >
              <SearchCode size={14} /> DECOMPILE
            </button>
          </div>

          <div className="flex items-center gap-2 ml-2">
            {!running ? (
              <button
                onClick={handleRun}
                className="flex items-center gap-2 px-6 py-2 bg-white text-black rounded-xl font-bold hover:bg-slate-200 active:scale-95 transition-all shadow-lg shadow-white/10 group"
              >
                <Play className="w-4 h-4 fill-current group-hover:scale-110 transition-transform" /> START
              </button>
            ) : (
              <button
                onClick={stop}
                className="flex items-center gap-2 px-6 py-2 bg-red-500 text-white rounded-xl font-bold hover:bg-red-600 active:scale-95 transition-all shadow-lg shadow-red-500/20"
              >
                <Square className="w-4 h-4 fill-current animate-pulse" /> STOP
              </button>
            )}
            <button
              onClick={() => setDebugMode(!debugMode)}
              className={`p-2 rounded-xl border transition-all ${debugMode ? 'bg-orange-500/20 text-orange-400 border-orange-500/30' : 'text-slate-400 hover:text-white hover:bg-white/5 border-white/5'}`}
              title="Toggle Debug Mode"
            >
              <Bug className="w-5 h-5" />
            </button>
          </div>
        </div>
      </header>

      {/* Main Content Layout */}
      <main className="flex-1 flex overflow-hidden">
        {/* Left Panel: Editor & Tabs */}
        <div className="flex-1 flex flex-col min-w-0 border-r border-white/5">
          {/* Tab Bar */}
          <div className="h-10 bg-black/40 border-b border-white/5 flex items-center px-4 gap-1 overflow-x-auto no-scrollbar">
            {tabs.map(tab => (
              <div
                key={tab.id}
                onClick={() => setActiveTabId(tab.id)}
                onDoubleClick={() => setEditingTabId(tab.id)}
                className={`group flex items-center gap-2 px-4 h-full cursor-pointer border-t-2 transition-all ${activeTabId === tab.id ? 'bg-white/5 border-purple-500 text-white' : 'border-transparent text-neutral-500 hover:text-neutral-300'}`}
              >
                <FileCode size={12} className={activeTabId === tab.id ? 'text-purple-400' : 'text-neutral-600'} />
                {editingTabId === tab.id ? (
                  <input
                    autoFocus
                    className="bg-black/40 border border-purple-500/50 rounded px-1 text-[11px] font-bold uppercase tracking-wider outline-none w-24"
                    defaultValue={tab.name}
                    onBlur={(e) => updateTabName(tab.id, e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') updateTabName(tab.id, (e.target as HTMLInputElement).value);
                      if (e.key === 'Escape') setEditingTabId(null);
                    }}
                  />
                ) : (
                  <span className="text-[11px] font-bold uppercase tracking-wider">{tab.name}</span>
                )}
                {tabs.length > 1 && (
                  <button
                    onClick={(e) => closeTab(tab.id, e)}
                    className="opacity-0 group-hover:opacity-100 p-1 hover:bg-white/10 rounded transition-all ml-auto"
                  >
                    <Trash2 size={10} className="text-neutral-500 hover:text-red-400" />
                  </button>
                )}
              </div>
            ))}
            <button
              onClick={addTab}
              className="px-4 h-full text-neutral-500 hover:text-white transition-all flex items-center"
              title="New Tab"
            >
              <Zap size={14} />
            </button>
          </div>

          {/* Editor Options Bar */}
          <div className="h-10 border-b border-white/5 bg-black/20 flex items-center px-4 justify-between">
            <div className="flex items-center gap-1">
              <button onClick={() => setViewMode('editor')} className={`px-4 py-1.5 rounded-lg text-xs font-black uppercase tracking-widest transition-all ${viewMode === 'editor' ? 'bg-white/10 text-white' : 'text-neutral-500 hover:text-neutral-300'}`}>
                Source
              </button>
              <button onClick={() => setViewMode('asm')} className={`px-4 py-1.5 rounded-lg text-xs font-black uppercase tracking-widest transition-all ${viewMode === 'asm' ? 'bg-white/10 text-white' : 'text-neutral-500 hover:text-neutral-300'}`}>
                Assembly
              </button>
              <button onClick={() => setViewMode('hex')} className={`px-4 py-1.5 rounded-lg text-xs font-black uppercase tracking-widest transition-all ${viewMode === 'hex' ? 'bg-white/10 text-white' : 'text-neutral-500 hover:text-neutral-300'}`}>
                Binary
              </button>
            </div>

            <button
              onClick={saveToVFS}
              className="text-[10px] font-black text-purple-400/80 hover:text-purple-300 px-3 py-1 rounded-lg border border-purple-500/10 bg-purple-500/5 transition-all flex items-center gap-2"
            >
              <Save size={12} /> SAVE TO VFS
            </button>
          </div>

          {/* Editor Content Area */}
          <div className="flex-1 overflow-hidden p-6 relative">
            {viewMode === 'editor' && (
              <Editor
                code={code}
                onChange={setCode}
                onScroll={handleEditorScroll}
              />
            )}
            {viewMode === 'asm' && (
              <Editor
                code={activeTab?.asm || ""}
                onChange={setAsm}
                onScroll={handleEditorScroll}
              />
            )}
            {viewMode === 'hex' && (
              <div className="h-full overflow-auto bg-black/40 border border-white/10 rounded-xl p-6 font-mono text-[12px] custom-scrollbar">
                {(!activeTab?.bin || activeTab.bin.length === 0) ? <div className="text-slate-500 italic p-10 text-center uppercase tracking-widest font-black opacity-30">No binary data available</div> :
                  <div className="grid grid-cols-[5rem_repeat(16,2.2rem)_1fr] gap-x-1 gap-y-1.5">
                    <span className="text-slate-600 font-black">OFFSET</span>
                    {[...Array(16)].map((_, i) => <span key={i} className="text-slate-500 font-black text-center">{i.toString(16).toUpperCase()}</span>)}
                    <span className="text-slate-600 ml-8">ASCII</span>
                    {(Array.from(activeTab.bin) as number[]).reduce((acc: any[], b: number, i: number) => {
                      if (i % 16 === 0) acc.push(<span key={`off-${i}`} className="text-purple-500/50 font-black">{(i).toString(16).padStart(4, '0').toUpperCase()}</span>);
                      acc.push(<span key={`hex-${i}`} className="text-slate-400 hover:text-white transition-colors cursor-default text-center">{b.toString(16).padStart(2, '0').toUpperCase()}</span>);
                      if ((i + 1) % 16 === 0 || i === activeTab.bin.length - 1) {
                        const startIdx = i - (i % 16);
                        const chunk = activeTab.bin.slice(startIdx, i + 1);
                        const ascii = (Array.from(chunk) as number[]).map((byte: number) => (byte >= 32 && byte <= 126) ? String.fromCharCode(byte) : '.').join('');
                        acc.push(<span key={`asc-${i}`} className="text-slate-600 ml-8 tracking-widest">{ascii}</span>);
                      }
                      return acc;
                    }, [])}
                  </div>}
              </div>
            )}
          </div>

          {/* Bottom Console */}
          <div className="h-64 border-t border-white/5 flex flex-col overflow-hidden">
            <div className="h-10 bg-black/40 border-b border-white/5 flex items-center px-6 justify-between shrink-0">
              <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.2em] text-neutral-500">
                <TerminalIcon size={12} /> System Console
              </div>
              <button onClick={clearLogs} className="text-[10px] font-black text-white/20 hover:text-red-400 transition-colors uppercase tracking-widest">
                Clear
              </button>
            </div>
            <div className="flex-1 overflow-hidden flex flex-col">
              <LavaTerminal logs={terminalLogs} onClear={clearLogs} onLog={(msg) => setLogs(p => [...p, msg])} />
            </div>
          </div>
        </div>

        {/* Right Panel: Device & VFS */}
        <div className="w-[500px] flex flex-col bg-black/20 shrink-0">
          {/* Sidebar Tabs */}
          <div className="h-12 border-b border-white/5 bg-black/20 flex items-center px-4 gap-1">
            <button onClick={() => setRightTab('emulator')} className={`flex-1 py-1.5 rounded-lg text-xs font-black uppercase tracking-widest transition-all ${rightTab === 'emulator' ? 'bg-white/10 text-white' : 'text-neutral-500 hover:text-neutral-300'}`}>
              Hardware
            </button>
            <button onClick={() => setRightTab('files')} className={`flex-1 py-1.5 rounded-lg text-xs font-black uppercase tracking-widest transition-all ${rightTab === 'files' ? 'bg-white/10 text-white' : 'text-neutral-500 hover:text-neutral-300'}`}>
              FileSystem
            </button>
          </div>

          <div className="flex-1 overflow-auto p-8 flex flex-col relative custom-scrollbar">
            {rightTab === 'emulator' ? (
              <Device
                screen={screen}
                onKeyPress={pushKey}
                onKeyRelease={releaseKey}
                onStop={stop}
                isRunning={running}
              />
            ) : (
              <FileManager
                vm={vm}
                onRunLav={async (data) => {
                  setTabs(prev => prev.map(t => t.id === activeTabId ? { ...t, bin: data } : t));
                  setRightTab('emulator');
                  await run(data);
                }}
                onDecompileLav={handleDecompile}
                onOpenFile={handleOpenFileFromVFS}
              />
            )}
          </div>
        </div>
      </main>

      <footer className="h-10 border-t border-white/5 bg-black/80 px-8 flex items-center justify-between text-[10px] text-slate-500 font-mono tracking-wider">
        <div className="flex gap-8">
          <div className="flex items-center gap-2">
            <div className={`w-1.5 h-1.5 rounded-full ${running ? 'bg-green-500 animate-pulse shadow-[0_0_8px_rgba(34,197,94,0.6)]' : 'bg-neutral-700'}`}></div>
            {running ? 'SYSTEM RUNNING' : 'SYSTEM IDLE'}
          </div>
          <div>LEN: {code.split('\n').length}</div>
          <div>MODE: {debugMode ? 'DEBUG' : 'PROD'}</div>
        </div>
        <div className="flex gap-6">
          <div className="flex items-center gap-1.5"><Monitor size={12} /> 160x80 MONO</div>
          <div className="flex items-center gap-1.5"><Cpu size={12} /> LAVA CORE v1.2</div>
        </div>
      </footer>
    </div>
  );
}

const container = document.getElementById('root');
if (container) {
  const root = (container as any)._reactRoot || createRoot(container);
  (container as any)._reactRoot = root;
  root.render(
    <DialogProvider>
      <App />
    </DialogProvider>
  );
}
