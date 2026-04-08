import React from 'react';

const KEYBOARD_LAYOUT = [
    ['ON/OFF', '', '', '', '', '', 'F1', 'F2', 'F3', 'F4'],
    ['Q', 'W', 'E', 'R', 'T\n7', 'Y\n8', 'U\n9', 'I', 'O', 'P'],
    ['A', 'S', 'D', 'F', 'G\n4', 'H\n5', 'J\n6', 'K', 'L', '↵'],
    ['Z', 'X', 'C', 'V', 'B\n1', 'N\n2', 'M\n3', '⇈', '↑', '⇊'],
    ['HELP', 'SHIFT', 'CAPS', 'ESC', '0', '.', 'SPACE', '←', '↓', '→']
];

export const KEY_CODES: Record<string, number> = {
    '↵': 13, 'ESC': 27, '↑': 20, '↓': 21, '←': 23, '→': 22,
    'F1': 28, 'F2': 29, 'F3': 30, 'F4': 31,
    'HELP': 25, 'SHIFT': 26, 'CAPS': 18,
    '⇈': 19, '⇊': 14, 'SPACE': 32, '.': 46,
    '0': 48, '1': 49, '2': 50, '3': 51, '4': 52, '5': 53, '6': 54, '7': 55, '8': 56, '9': 57
};

export const getKeyCode = (labelOrKey: string): number | null => {
    let code = KEY_CODES[labelOrKey.toUpperCase()];
    if (!code && labelOrKey.length === 1) {
        code = labelOrKey.toLowerCase().charCodeAt(0);
    }
    return code || null;
};

export const SoftKeyboard: React.FC<{ onKeyPress: (code: number) => void; onKeyRelease?: (code: number) => void }> = ({ onKeyPress, onKeyRelease }) => (
    <div className="grid gap-0.5 sm:gap-1 p-1.5 sm:p-2 bg-neutral-900/90 rounded-2xl border border-white/5 backdrop-blur-xl shadow-inner touch-none select-none">
        {KEYBOARD_LAYOUT.map((row, rowIndex) => (
            <div key={rowIndex} className="flex gap-0.5 sm:gap-1 justify-center">
                {row.map((key, keyIndex) => {
                    if (key === '') return <div key={keyIndex} className="w-7 h-7 sm:w-8 sm:h-8" />;
                    const displayKey = key.split('\n');
                    const isSpecial = ['ON/OFF', 'HELP', 'SHIFT', 'CAPS', 'ESC', '↵', '⇈', '⇊', 'F1', 'F2', 'F3', 'F4', 'SPACE'].includes(displayKey[0]);

                    const handlePointerDown = (e: React.PointerEvent) => {
                        e.preventDefault();
                        const code = getKeyCode(displayKey[0]);
                        if (code !== null) onKeyPress(code);
                    };

                    const handlePointerUpOrLeave = (e: React.PointerEvent) => {
                        e.preventDefault();
                        if (onKeyRelease) {
                            const code = getKeyCode(displayKey[0]);
                            if (code !== null) onKeyRelease(code);
                        }
                    };

                    return (
                        <button key={keyIndex}
                            onPointerDown={handlePointerDown}
                            onPointerUp={handlePointerUpOrLeave}
                            onPointerLeave={handlePointerUpOrLeave}
                            onPointerCancel={handlePointerUpOrLeave}
                            onContextMenu={(e) => e.preventDefault()}
                            className={`w-7 h-7 sm:w-8 sm:h-8 flex items-center justify-center gap-0.5 ${isSpecial ? 'bg-neutral-800 text-neutral-400 hover:bg-neutral-750' : 'bg-neutral-700 text-white hover:bg-neutral-600'} active:scale-90 active:brightness-75 text-[8px] sm:text-[9px] font-black rounded-lg shadow-lg transition-all border-b-[3px] border-black/40 relative`}
                        >
                            <span>{displayKey[0]}</span>
                            {displayKey[1] && <span className="text-[5px] sm:text-[6px] text-neutral-400 self-end mb-2">{displayKey[1]}</span>}
                        </button>
                    );
                })}
            </div>
        ))}
    </div>
);
