
import React, { useMemo } from 'react';

interface EditorProps {
    code: string;
    onChange: (code: string) => void;
    onScroll: (e: React.UIEvent<HTMLTextAreaElement>) => void;
}

function highlightCode(code: string) {
    // Escape HTML entities first
    let result = code
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');

    // Use placeholders to avoid regex conflicts
    const tokens: { placeholder: string; html: string }[] = [];
    let tokenIndex = 0;

    // Helper to create unique placeholder
    const createToken = (match: string, className: string) => {
        const placeholder = `___TOKEN_${tokenIndex++}___`;
        tokens.push({ placeholder, html: `<span class="${className}">${match}</span>` });
        return placeholder;
    };

    // Match comments first (highest priority)
    result = result.replace(/\/\/.*|\/\*[\s\S]*?\*\//g, (match) => createToken(match, 'text-gray-500'));

    // Match strings
    result = result.replace(/"[^"]*"/g, (match) => createToken(match, 'text-green-400'));

    // Match keywords
    result = result.replace(/\b(int|char|long|void|if|else|while|for|do|return|goto|break|continue|addr|struct|typedef|switch|case|default)\b/g, (match) => createToken(match, 'text-purple-400 font-bold'));

    // Match system functions
    result = result.replace(/\b(putchar|getchar|printf|strcpy|strlen|SetScreen|UpdateLCD|Delay|WriteBlock|Refresh|TextOut|Block|Rectangle|Exit|ClearScreen|abs|rand|srand|Locate|Inkey|Point|GetPoint|Line|Box|Circle|Ellipse|Beep|isalnum|isalpha|iscntrl|isdigit|isgraph|islower|isprint|ispunct|isspace|isupper|isxdigit|strcat|strchr|strcmp|strstr|tolower|toupper|memset|memcpy|fopen|fclose|fread|fwrite|fseek|ftell|feof|rewind|fgetc|fputc|sprintf|MakeDir|DeleteFile|Getms|CheckKey|memmove|Sin|Cos|FillArea|SetGraphMode|SetBgColor|SetFgColor|GetTime|Math)\b/g, (match) => createToken(match, 'text-blue-300'));

    // Replace all placeholders with actual HTML
    tokens.forEach(({ placeholder, html }) => {
        result = result.replace(placeholder, html);
    });

    return <span dangerouslySetInnerHTML={{ __html: result }} />;
}

export const Editor: React.FC<EditorProps> = ({ code, onChange, onScroll }) => {
    const lineNumbersRef = React.useRef<HTMLDivElement>(null);
    const preRef = React.useRef<HTMLPreElement>(null);
    const textareaRef = React.useRef<HTMLTextAreaElement>(null);
    const [cursorPosition, setCursorPosition] = React.useState({ line: 1, column: 1 });

    const lineCount = useMemo(() => code.split('\n').length, [code]);
    const highlightedCode = useMemo(() => highlightCode(code), [code]);

    const handleScroll = (e: React.UIEvent<HTMLTextAreaElement>) => {
        const target = e.currentTarget;
        if (lineNumbersRef.current) lineNumbersRef.current.scrollTop = target.scrollTop;
        if (preRef.current) {
            preRef.current.scrollTop = target.scrollTop;
            preRef.current.scrollLeft = target.scrollLeft;
        }
        onScroll(e);
    };

    const updateCursorPosition = () => {
        if (!textareaRef.current) return;
        const textarea = textareaRef.current;
        const cursorPos = textarea.selectionStart;
        const textBeforeCursor = code.substring(0, cursorPos);
        const lines = textBeforeCursor.split('\n');
        const line = lines.length;
        const column = lines[lines.length - 1].length + 1;
        setCursorPosition({ line, column });
    };

    const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
        onChange(e.target.value);
        // Update cursor position after state update
        setTimeout(updateCursorPosition, 0);
    };

    return (
        <div className="flex-1 flex flex-col overflow-hidden border border-white/10 rounded-xl bg-black/40 backdrop-blur-md relative group h-full">
            <div className="flex-1 flex overflow-hidden relative">
                <div
                    ref={lineNumbersRef}
                    className="w-12 bg-white/5 border-r border-white/10 flex flex-col items-center py-4 text-white/30 font-mono text-sm select-none overflow-hidden"
                >
                    {Array.from({ length: lineCount }).map((_, i) => (
                        <div key={i} className="h-6 leading-6">{i + 1}</div>
                    ))}
                </div>
                <div className="flex-1 relative overflow-hidden h-full">
                    <pre
                        ref={preRef}
                        className="absolute inset-0 p-4 font-mono text-sm h-full w-full pointer-events-none overflow-hidden m-0 box-border border-none"
                        style={{ whiteSpace: 'pre', wordBreak: 'normal', lineHeight: '1.5rem' }}
                    >
                        {highlightedCode}
                    </pre>
                    <textarea
                        ref={textareaRef}
                        value={code}
                        onChange={handleChange}
                        onScroll={handleScroll}
                        onClick={updateCursorPosition}
                        onKeyUp={updateCursorPosition}
                        className="absolute inset-0 p-4 font-mono text-sm bg-transparent text-transparent caret-white outline-none resize-none h-full w-full overflow-auto m-0 border-none focus:ring-0 box-border leading-6"
                        spellCheck={false}
                        style={{ whiteSpace: 'pre', wordBreak: 'normal', lineHeight: '1.5rem' }}
                    />
                </div>
            </div>
            <div className="h-6 bg-white/5 border-t border-white/10 px-4 flex items-center text-white/50 text-xs font-mono">
                Ln {cursorPosition.line}, Col {cursorPosition.column}
            </div>
        </div>
    );
};
