import React, { useEffect, useRef } from 'react';
import { MessageSquare } from 'lucide-react';

interface LogEntry {
    text: string;
    time: string;
}

interface TerminalProps {
    logs: LogEntry[];
    onClear: () => void;
    onLog: (msg: string) => void;
}

function classifyLog(text: string): 'error' | 'warn' | 'success' | 'output' | 'system' {
    if (text.startsWith('ERROR') || text.includes('Error') || text.includes('FATAL')) return 'error';
    if (text.startsWith('Warning') || text.includes('Warning')) return 'warn';
    if (text.startsWith('Build: Success') || text.startsWith('Assembly: Success') || text.startsWith('Success')) return 'success';
    if (text.startsWith('Compiling') || text.startsWith('Assembling') || text.startsWith('Build:') ||
        text.startsWith('Assembly:') || text.startsWith('Decompiler:') || text.startsWith('System:') ||
        text.startsWith('Source saved')) return 'system';
    return 'output';
}

const LOG_COLORS: Record<ReturnType<typeof classifyLog>, string> = {
    error: 'text-red-400',
    warn: 'text-yellow-400',
    success: 'text-green-400',
    system: 'text-blue-300/80',
    output: 'text-neutral-200',
};

const LOG_PREFIXES: Record<ReturnType<typeof classifyLog>, string> = {
    error: '✗',
    warn: '⚠',
    success: '✓',
    system: '›',
    output: ' ',
};

export const Terminal: React.FC<TerminalProps> = ({ logs, onClear, onLog }) => {
    const terminalRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (terminalRef.current) {
            terminalRef.current.scrollTop = terminalRef.current.scrollHeight;
        }
    }, [logs]);

    const handleCopyAll = () => {
        const text = logs.map(l => `[${l.time}] ${l.text}`).join('\n');
        navigator.clipboard.writeText(text);
        onLog("System: Logs copied to clipboard.");
    };

    return (
        <div className="h-56 bg-neutral-900/80 border-t border-white/5 flex flex-col shrink-0 backdrop-blur-md">
            <div className="px-6 py-2.5 border-b border-white/5 flex items-center justify-between">
                <span className="text-[11px] font-black text-neutral-500 uppercase flex items-center gap-2.5">
                    <MessageSquare size={14} /> Integrated Terminal
                </span>
                <div className="flex gap-4">
                    <button
                        onClick={handleCopyAll}
                        className="text-[10px] font-black text-neutral-600 hover:text-white transition-colors"
                    >
                        COPY ALL
                    </button>
                    <button
                        onClick={onClear}
                        className="text-[10px] font-black text-neutral-600 hover:text-white transition-colors"
                    >
                        CLEAR
                    </button>
                </div>
            </div>
            <div
                ref={terminalRef}
                className="flex-1 p-5 overflow-y-auto font-mono text-[12px] leading-relaxed custom-scrollbar bg-black/20 select-text"
            >
                <div className="flex flex-col min-h-full">
                    {logs.map((l, i) => {
                        const kind = classifyLog(l.text);
                        const color = LOG_COLORS[kind];
                        const prefix = LOG_PREFIXES[kind];
                        return (
                            <div key={i} className={`py-0.5 flex gap-2 select-text ${color}`}>
                                <span className="text-neutral-700 shrink-0 font-black select-none text-[10px] mt-0.5">[{l.time}]</span>
                                <span className="shrink-0 select-none w-4 text-center">{prefix}</span>
                                <span className="whitespace-pre-wrap break-all select-text flex-1">
                                    {l.text}
                                </span>
                            </div>
                        );
                    })}
                    {logs.length === 0 && <div className="text-neutral-700 italic">Session logs will appear here...</div>}
                </div>
            </div>
        </div>
    );
};
