import React, { useEffect, useRef } from 'react';
import { Monitor, Trash2 } from 'lucide-react';
import { SoftKeyboard, getKeyCode } from './SoftKeyboard';
import { useI18n } from '../i18n';

interface DeviceProps {
    screen: ImageData | null;
    onKeyPress: (code: number) => void;
    onKeyRelease?: (code: number) => void;
    onStop: () => void;
    isRunning: boolean;
}

const PHYSICAL_KEY_MAP: Record<string, string> = {
    'ArrowUp': '↑',
    'ArrowDown': '↓',
    'ArrowLeft': '←',
    'ArrowRight': '→',
    'Enter': '↵',
    'Escape': 'ESC',
    'PageUp': '⇈',
    'PageDown': '⇊',
    ' ': 'SPACE',
    'Shift': 'SHIFT',
    'CapsLock': 'CAPS',
    'Alt': 'HELP',
    'Control': 'SHIFT', // Use Ctrl as another modifier if needed
};

export const Device: React.FC<DeviceProps> = ({ screen, onKeyPress, onKeyRelease, onStop, isRunning }) => {
    const containerRef = useRef<HTMLDivElement>(null);
    const { t } = useI18n();

    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (!isRunning) return;

            // Don't capture if user is typing in an input/textarea elsewhere
            if (document.activeElement?.tagName === 'INPUT' || document.activeElement?.tagName === 'TEXTAREA') {
                return;
            }

            let key = e.key;
            if (PHYSICAL_KEY_MAP[key]) {
                key = PHYSICAL_KEY_MAP[key];
            }

            const code = getKeyCode(key);
            if (code !== null) {
                e.preventDefault();
                onKeyPress(code);
            }
        };

        const handleKeyUp = (e: KeyboardEvent) => {
            if (!isRunning || !onKeyRelease) return;
            if (document.activeElement?.tagName === 'INPUT' || document.activeElement?.tagName === 'TEXTAREA') return;

            let key = e.key;
            if (PHYSICAL_KEY_MAP[key]) key = PHYSICAL_KEY_MAP[key];

            const code = getKeyCode(key);
            if (code !== null) {
                e.preventDefault();
                onKeyRelease(code);
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        window.addEventListener('keyup', handleKeyUp);
        return () => {
            window.removeEventListener('keydown', handleKeyDown);
            window.removeEventListener('keyup', handleKeyUp);
        };
    }, [isRunning, onKeyPress, onKeyRelease]);

    return (
        <div
            ref={containerRef}
            className="flex flex-col items-center h-full gap-3 md:gap-8 outline-none"
            tabIndex={0}
            onClick={() => containerRef.current?.focus()}
        >
            <div className="bg-[#1a1a1a] rounded-[1.5rem] md:rounded-[3.5rem] p-2.5 md:p-10 border border-white/10 shadow-[0_0_50px_rgba(0,0,0,0.5)] w-full max-w-full relative group">
                <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-neutral-800 px-4 md:px-6 py-1 rounded-full border border-white/5 text-[9px] md:text-[10px] font-black text-neutral-500 uppercase tracking-widest shadow-lg whitespace-nowrap">
                    {t('hwTitle')}
                </div>

                <div className="bg-black p-2 md:p-6 rounded-2xl md:rounded-3xl shadow-[inset_0_4px_30px_rgba(0,0,0,1)] border-b-4 border-black/50 relative">
                    <div className="bg-[#94a187] rounded-md p-1 shadow-[inset_0_2px_15px_rgba(0,0,0,0.4)] relative overflow-hidden">
                        <canvas
                            width={160}
                            height={80}
                            className="pixelated w-full aspect-[2/1] brightness-[1.05] contrast-[1.1]"
                            ref={(canvas) => {
                                if (canvas && screen) {
                                    const ctx = canvas.getContext('2d');
                                    if (ctx) ctx.putImageData(screen, 0, 0);
                                }
                            }}
                        />
                        {/* Overlay effects */}
                        <div className="absolute inset-0 pointer-events-none bg-gradient-to-br from-white/10 via-transparent to-black/20"></div>
                        <div className="absolute inset-0 pointer-events-none opacity-[0.05] bg-[linear-gradient(rgba(18,16,16,0)_50%,rgba(0,0,0,0.25)_50%),linear-gradient(90deg,rgba(255,0,0,0.06),rgba(0,255,0,0.02),rgba(0,0,118,0.06))] bg-[length:100%_4px,3px_100%] shadow-[inset_0_0_100px_rgba(0,0,0,0.2)]"></div>
                    </div>

                    {!isRunning && (
                        <div className="absolute inset-0 flex items-center justify-center bg-black/60 backdrop-blur-[2px] rounded-2xl md:rounded-3xl z-10">
                            <div className="text-[10px] font-black text-neutral-500 uppercase tracking-widest border border-white/10 px-4 py-2 rounded-full bg-black/40">
                                {t('systemStandby')}
                            </div>
                        </div>
                    )}
                </div>

                <div
                    className="mt-3 md:mt-10 flex justify-center w-full"
                    role="region"
                    aria-label="Virtual Keyboard"
                >
                    <SoftKeyboard onKeyPress={onKeyPress} onKeyRelease={onKeyRelease} />
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 md:gap-5 w-full mt-auto">
                <div className="hidden md:flex p-3 md:p-5 bg-white/5 rounded-2xl md:rounded-3xl border border-white/5 flex-col gap-2 md:gap-3 backdrop-blur-sm relative overflow-hidden group">
                    <div className="absolute inset-0 bg-gradient-to-br from-blue-500/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity"></div>
                    <div className="flex items-center gap-2.5 text-[11px] font-black text-neutral-400 uppercase tracking-wider relative">
                        <Monitor size={14} className="text-blue-400" /> {t('hwSpecs')}
                    </div>
                    <p className="text-[10px] md:text-[11px] text-neutral-500 font-medium leading-relaxed relative">
                        {t('hwScreen')}<br />
                        {t('hwRam')}<br />
                        {t('hwCpu')}
                    </p>
                </div>
                <div className="p-3 md:p-5 bg-white/5 rounded-2xl md:rounded-3xl border border-white/5 flex flex-col gap-2 md:gap-3 backdrop-blur-sm relative overflow-hidden group">
                    <div className="absolute inset-0 bg-gradient-to-br from-amber-500/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity"></div>
                    <div className="flex items-center gap-2.5 text-[11px] font-black text-neutral-400 uppercase tracking-wider relative">
                        <Trash2 size={14} className="text-amber-400" /> {t('actions')}
                    </div>
                    <button
                        onClick={onStop}
                        disabled={!isRunning}
                        className="text-[10px] font-black uppercase text-red-400/80 hover:text-red-400 disabled:opacity-30 transition-colors text-left"
                    >
                        {t('forceShutdown')}
                    </button>
                </div>
            </div>
        </div>
    );
};
