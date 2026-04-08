import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { FolderOpen, Upload, Trash2, FileText, PlayCircle, Download, FolderPlus, ChevronRight, File, Folder, SearchCode, Edit } from 'lucide-react';
import { LavaXVM } from '../vm';
import iconv from 'iconv-lite';
import { useDialog } from './dialogs/DialogContext';
import { useI18n } from '../i18n';

export const FileManager: React.FC<{
    vm: LavaXVM,
    onRunLav: (data: Uint8Array) => void,
    onDecompileLav: (data: Uint8Array) => void,
    onOpenFile: (path: string, content: string | Uint8Array) => void
}> = ({ vm, onRunLav, onDecompileLav, onOpenFile }) => {
    const [allFiles, setAllFiles] = useState<{ path: string, size: number }[]>([]);
    const [currentPath, setCurrentPath] = useState<string>('/');
    const [isDragging, setIsDragging] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const dialog = useDialog();
    const { t } = useI18n();

    const refreshFiles = useCallback(() => {
        setAllFiles(vm.vfs.getFiles());
    }, [vm]);

    useEffect(() => {
        refreshFiles();
        vm.vfs.ready.then(refreshFiles);
        const interval = setInterval(refreshFiles, 3000);
        return () => clearInterval(interval);
    }, [refreshFiles, vm.vfs.ready]);

    const items = useMemo(() => {
        const normalizedCurrentPath = currentPath === '/' ? '/' : (currentPath.endsWith('/') ? currentPath : currentPath + '/');
        const levelItems = new Map<string, { name: string, isDir: boolean, size: number, fullPath: string }>();

        allFiles.forEach(f => {
            const rel = f.path.startsWith(normalizedCurrentPath) ? f.path.slice(normalizedCurrentPath.length) : (currentPath === '/' && !f.path.startsWith('/') ? f.path : null);
            if (rel === null) return;

            const parts = rel.split('/');
            const name = parts[0];
            if (!name) return;

            const isDir = parts.length > 1 || f.path.endsWith('/');
            const fullPath = normalizedCurrentPath === '/' ? '/' + name : normalizedCurrentPath + name;

            if (levelItems.has(name)) {
                if (isDir) levelItems.get(name)!.isDir = true;
            } else {
                levelItems.set(name, { name, isDir, size: f.size, fullPath });
            }
        });

        return Array.from(levelItems.values()).sort((a, b) => {
            if (a.isDir !== b.isDir) return b.isDir ? 1 : -1;
            return a.name.localeCompare(b.name);
        });
    }, [allFiles, currentPath]);

    const handleUpload = async (files: FileList | null) => {
        if (!files) return;
        for (let i = 0; i < files.length; i++) {
            const f = files[i];
            const path = currentPath === '/' ? f.name : `${currentPath.replace(/\/$/, '')}/${f.name}`;

            // Check if it's a text file by extension
            const isTextFile = /\.(c|h|txt|asm|md|s)$/i.test(f.name);

            const buffer = await f.arrayBuffer();
            const data = new Uint8Array(buffer);

            if (isTextFile) {
                try {
                    // Try decoding as UTF-8 with fatal: true to detect encoding
                    const text = new TextDecoder('utf-8', { fatal: true }).decode(data);
                    // Successfully decoded as UTF-8, convert to GBK for VFS storage
                    const gbkData = iconv.encode(text, 'gbk');
                    vm.vfs.addFile(path, new Uint8Array(gbkData));
                } catch (e) {
                    // Decoding failed, assume it's already GBK (or another non-UTF-8 encoding)
                    // and store the raw bytes directly.
                    vm.vfs.addFile(path, data);
                }
            } else {
                // For binary files, keep as-is
                vm.vfs.addFile(path, data);
            }
        }
        refreshFiles();
    };

    const createFolder = async () => {
        const name = await dialog.prompt({
            title: t('newFolder'),
            message: t('enterFolderName'),
            placeholder: t('folderNamePlaceholder'),
            validation: (val) => !val.trim() ? t('folderNameEmpty') : null
        });

        if (name) {
            const path = currentPath === '/' ? `/${name}` : `${currentPath.replace(/\/$/, '')}/${name}`;
            vm.vfs.mkdir(path);
            refreshFiles();
        }
    };

    const deleteItem = async (item: typeof items[0]) => {
        if (item.isDir) {
            const confirmed = await dialog.confirm({
                title: t('deleteFolderTitle'),
                message: t('deleteFolderMsg', item.name),
                confirmText: t('deleteAction'),
                isDestructive: true
            });

            if (confirmed) {
                allFiles.filter(f => f.path.startsWith(item.fullPath + '/')).forEach(f => vm.vfs.deleteFile(f.path));
                vm.vfs.deleteFile(item.fullPath + '/.keep'); // if exists
                refreshFiles();
            }
        } else {
            const confirmed = await dialog.confirm({
                title: t('deleteFileTitle'),
                message: t('deleteFileMsg', item.name),
                confirmText: t('deleteAction'),
                isDestructive: true
            });

            if (confirmed) {
                vm.vfs.deleteFile(item.fullPath);
                refreshFiles();
            }
        }
    };

    const downloadFile = (name: string, data: Uint8Array) => {
        // Check if it's a text file by extension
        const isTextFile = /\.(c|h|txt|asm|md|s)$/i.test(name);

        let blobData: Uint8Array | string;
        let mimeType: string;

        if (isTextFile) {
            // For text files, convert from GBK to UTF-8
            const text = iconv.decode(Buffer.from(data), 'gbk');
            blobData = text;
            mimeType = 'text/plain;charset=utf-8';
        } else {
            // For binary files, keep as-is
            blobData = data;
            mimeType = 'application/octet-stream';
        }

        const blob = new Blob([blobData as any], { type: mimeType });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url; a.download = name; a.click();
        URL.revokeObjectURL(url);
    };

    const renameItem = async (item: typeof items[0]) => {
        const newName = await dialog.prompt({
            title: t('renameTitle'),
            message: t('renameMsg', item.name),
            defaultValue: item.name,
            validation: (val) => {
                if (!val.trim()) return t('nameEmpty');
                if (val.length > 14) return t('nameTooLong');
                return null;
            }
        });

        if (!newName || newName === item.name) return;

        const parentPath = currentPath === '/' ? '/' : currentPath.endsWith('/') ? currentPath : currentPath + '/';
        const newPath = `${parentPath}${newName}`;

        if (item.isDir) {
            // Rename folder: move all files under it
            const oldPrefix = item.fullPath.endsWith('/') ? item.fullPath : item.fullPath + '/';
            const filesToMove = allFiles.filter(f => f.path.startsWith(oldPrefix) || f.path === oldPrefix.slice(0, -1));

            filesToMove.forEach(f => {
                const data = vm.vfs.getFile(f.path);
                if (data) {
                    const relativePath = f.path.slice(oldPrefix.length);
                    const newFilePath = `${newPath}/${relativePath}`;
                    vm.vfs.addFile(newFilePath, data);
                    vm.vfs.deleteFile(f.path);
                }
            });
        } else {
            // Rename file
            const data = vm.vfs.getFile(item.fullPath);
            if (data) {
                vm.vfs.addFile(newPath, data);
                vm.vfs.deleteFile(item.fullPath);
            }
        }

        refreshFiles();
    };

    const breadcrumbs = useMemo(() => {
        const parts = currentPath.split('/').filter(Boolean);
        return [{ name: t('rootDir'), path: '/' }, ...parts.map((p, i) => ({
            name: p,
            path: '/' + parts.slice(0, i + 1).join('/')
        }))];
    }, [currentPath, t]);

    return (
        <div
            className={`flex flex-col h-full bg-neutral-900/50 rounded-2xl overflow-hidden border transition-all backdrop-blur-sm ${isDragging ? 'border-blue-500 bg-blue-500/10 shadow-[0_0_20px_rgba(59,130,246,0.2)]' : 'border-white/5'}`}
            onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
            onDragLeave={() => setIsDragging(false)}
            onDrop={(e) => { e.preventDefault(); setIsDragging(false); handleUpload(e.dataTransfer.files); }}
        >
            <div className="flex flex-col bg-neutral-800/80 border-b border-white/5">
                <div className="flex justify-between items-center p-4">
                    <h3 className="text-[12px] font-black text-neutral-400 uppercase flex items-center gap-2"><FolderOpen size={16} /> {t('vfsExplorer')}</h3>
                    <div className="flex gap-2">
                        <button onClick={createFolder} className="p-2 hover:bg-white/10 rounded-lg transition-all text-neutral-400 hover:text-white" title={t('newFolder')}>
                            <FolderPlus size={16} />
                        </button>
                        <button onClick={() => fileInputRef.current?.click()} className="p-2 hover:bg-white/10 rounded-lg transition-all text-blue-400" title={t('uploadFiles')}>
                            <Upload size={16} /><input type="file" ref={fileInputRef} multiple onChange={(e) => handleUpload(e.target.files)} className="hidden" />
                        </button>
                    </div>
                </div>
                <div className="flex items-center gap-1 px-4 pb-2 overflow-x-auto no-scrollbar">
                    {breadcrumbs.map((b, i) => (
                        <React.Fragment key={b.path}>
                            {i > 0 && <ChevronRight size={12} className="text-neutral-600 shrink-0" />}
                            <button
                                onClick={() => setCurrentPath(b.path)}
                                className={`text-[10px] font-bold px-2 py-1 rounded-md transition-colors whitespace-nowrap ${currentPath === b.path ? 'bg-orange-500/20 text-orange-400' : 'text-neutral-500 hover:bg-white/5 hover:text-neutral-300'}`}
                            >
                                {b.name}
                            </button>
                        </React.Fragment>
                    ))}
                </div>
            </div>

            <div className="flex-1 overflow-y-auto p-3 custom-scrollbar space-y-1.5">
                {items.length === 0 && <div className="text-center py-16 text-neutral-600 text-[11px] italic">{t('directoryEmpty')}</div>}
                {items.map(item => {
                    const isLav = item.name.toLowerCase().endsWith('.lav');
                    const isText = /\.(c|h|txt|asm|md|s)$/i.test(item.name);

                    return (
                        <div
                            key={item.fullPath}
                            className="flex items-center justify-between p-3 bg-white/5 hover:bg-white/10 rounded-xl group text-[11px] transition-all cursor-default border border-transparent hover:border-white/10"
                            onClick={() => {
                                console.log('[FileManager] Item clicked:', item);
                                if (item.isDir) {
                                    console.log('[FileManager] Changing directory to:', item.fullPath);
                                    setCurrentPath(item.fullPath);
                                }
                                else if (isText) {
                                    console.log('[FileManager] Opening text file:', item.fullPath);
                                    const d = vm.vfs.getFile(item.fullPath);
                                    if (d) onOpenFile(item.fullPath, d);
                                }
                                else if (isLav) {
                                    console.log('[FileManager] Running LAV file:', item.fullPath);
                                    const d = vm.vfs.getFile(item.fullPath);
                                    if (d) onRunLav(d);
                                }
                            }}
                        >
                            <div className="flex items-center gap-3 overflow-hidden flex-1">
                                {item.isDir ? (
                                    <Folder size={16} className="text-blue-400" />
                                ) : (
                                    <File size={16} className={isLav ? "text-orange-500" : (isText ? "text-purple-400" : "text-neutral-500")} />
                                )}
                                <div className="flex flex-col overflow-hidden">
                                    <span className={`text-neutral-200 truncate font-bold ${isText ? 'cursor-pointer hover:text-purple-300' : ''}`}>{item.name}</span>
                                    <span className="text-neutral-500 text-[9px] uppercase">{item.isDir ? t('dirLabel') : `${item.size} Bytes`}</span>
                                </div>
                            </div>
                            <div className="flex items-center gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
                                {!item.isDir && isLav && (
                                    <button
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            console.log('[FileManager] Run LAV clicked:', item.fullPath);
                                            const d = vm.vfs.getFile(item.fullPath);
                                            if (d) onRunLav(d);
                                            else console.error('[FileManager] Could not get file data for:', item.fullPath);
                                        }}
                                        className="p-1.5 hover:text-emerald-500 transition-colors"
                                        title={t('runFile')}
                                    >
                                        <PlayCircle size={16} />
                                    </button>
                                )}
                                {!item.isDir && isLav && <button onClick={(e) => { e.stopPropagation(); const d = vm.vfs.getFile(item.fullPath); if (d) onDecompileLav(d); }} className="p-1.5 hover:text-blue-400 transition-colors" title={t('decompile')}><SearchCode size={16} /></button>}
                                {!item.isDir && isText && <button onClick={(e) => { e.stopPropagation(); const d = vm.vfs.getFile(item.fullPath); if (d) onOpenFile(item.fullPath, d); }} className="p-1.5 hover:text-purple-400 transition-colors" title={t('openInEditor')}><FileText size={16} /></button>}
                                {!item.isDir && <button onClick={(e) => { e.stopPropagation(); const d = vm.vfs.getFile(item.fullPath); if (d) downloadFile(item.name, d); }} className="p-1.5 hover:text-blue-400 transition-colors" title={t('download')}><Download size={16} /></button>}
                                <button onClick={(e) => { e.stopPropagation(); renameItem(item); }} className="p-1.5 hover:text-yellow-400 transition-colors" title={t('rename')}><Edit size={16} /></button>
                                <button onClick={(e) => { e.stopPropagation(); deleteItem(item); }} className="p-1.5 hover:text-red-500 transition-colors" title={t('deleteAction')}><Trash2 size={16} /></button>
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
};
