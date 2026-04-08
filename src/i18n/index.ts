import React, { createContext, useContext, useState, ReactNode } from 'react';

export type Language = 'en' | 'zh-CN';

const en = {
  // App
  appName: 'LavStudio',
  appVersion: 'v0x12',
  appSubtitle: 'LavaX VM Integrated Environment',

  // Header actions
  examples: 'EXAMPLES',
  build: 'BUILD',
  assemble: 'ASSEMBLE',
  decompile: 'DECOMPILE',
  start: 'START',
  stop: 'STOP',
  debugMode: 'Debug Mode',

  // Editor view modes
  source: 'Source',
  assembly: 'Assembly',
  binary: 'Binary',
  saveToVFS: 'SAVE TO VFS',
  noBinaryData: 'No binary data available',
  newTab: 'New Tab',

  // Right panel tabs
  hardware: 'Hardware',
  fileSystem: 'FileSystem',

  // Console
  systemConsole: 'System Console',
  clear: 'Clear',

  // Footer
  systemRunning: 'SYSTEM RUNNING',
  systemIdle: 'SYSTEM IDLE',
  modeDebug: 'DEBUG',
  modeProd: 'PROD',
  modeLabel: 'MODE',
  lenLabel: 'LEN',

  // Device
  hwTitle: 'LavaX Hardware v2.0',
  systemStandby: 'System Standby',
  hwSpecs: 'HW Specs',
  hwScreen: 'Screen: 160x80 Mono',
  hwRam: 'RAM: 64KB Managed',
  hwCpu: 'CPU: 32-bit RISC Stack',
  actions: 'Actions',
  forceShutdown: 'Force Shutdown',

  // FileManager
  vfsExplorer: 'VFS Explorer',
  newFolder: 'New Folder',
  enterFolderName: 'Enter folder name:',
  folderNamePlaceholder: 'Folder Name',
  folderNameEmpty: 'Folder name cannot be empty',
  deleteFolderTitle: 'Delete Folder',
  deleteFolderMsg: 'Are you sure you want to delete folder "%s" and all its contents? This action cannot be undone.',
  deleteFileTitle: 'Delete File',
  deleteFileMsg: 'Are you sure you want to delete "%s"?',
  deleteAction: 'Delete',
  renameTitle: 'Rename Item',
  renameMsg: 'Enter new name for "%s":',
  nameEmpty: 'Name cannot be empty',
  nameTooLong: 'Filename cannot exceed 14 bytes',
  directoryEmpty: 'Directory is empty',
  rootDir: 'root',
  dirLabel: 'Directory',
  uploadFiles: 'Upload Files',
  runFile: 'Run',
  openInEditor: 'Open in Editor',
  download: 'Download',
  rename: 'Rename',

  // Terminal
  integratedTerminal: 'Integrated Terminal',
  copyAll: 'COPY ALL',
  logsEmpty: 'Session logs will appear here...',

  // Editor status bar
  lineLabel: 'Ln',
  columnLabel: 'Col',

  // Mobile navigation
  editorTab: 'Editor',
  emulatorTab: 'Emulator',
  filesTab: 'Files',

  // Language switcher
  language: 'Language',
} as const;

const zhCN: typeof en = {
  // App
  appName: 'LavStudio',
  appVersion: 'v0x12',
  appSubtitle: 'LavaX 虚拟机集成环境',

  // Header actions
  examples: '示例',
  build: '编译',
  assemble: '汇编',
  decompile: '反编译',
  start: '运行',
  stop: '停止',
  debugMode: '调试模式',

  // Editor view modes
  source: '源代码',
  assembly: '汇编',
  binary: '二进制',
  saveToVFS: '保存到VFS',
  noBinaryData: '暂无二进制数据',
  newTab: '新标签',

  // Right panel tabs
  hardware: '硬件',
  fileSystem: '文件系统',

  // Console
  systemConsole: '系统控制台',
  clear: '清空',

  // Footer
  systemRunning: '系统运行中',
  systemIdle: '系统空闲',
  modeDebug: '调试',
  modeProd: '生产',
  modeLabel: '模式',
  lenLabel: '行数',

  // Device
  hwTitle: 'LavaX 硬件 v2.0',
  systemStandby: '系统待机',
  hwSpecs: '硬件规格',
  hwScreen: '屏幕：160x80 单色',
  hwRam: '内存：64KB',
  hwCpu: 'CPU：32位 RISC 栈机',
  actions: '操作',
  forceShutdown: '强制关机',

  // FileManager
  vfsExplorer: '虚拟文件系统',
  newFolder: '新建文件夹',
  enterFolderName: '输入文件夹名称：',
  folderNamePlaceholder: '文件夹名称',
  folderNameEmpty: '文件夹名称不能为空',
  deleteFolderTitle: '删除文件夹',
  deleteFolderMsg: '确定要删除文件夹 "%s" 及其所有内容吗？此操作不可撤销。',
  deleteFileTitle: '删除文件',
  deleteFileMsg: '确定要删除 "%s" 吗？',
  deleteAction: '删除',
  renameTitle: '重命名',
  renameMsg: '为 "%s" 输入新名称：',
  nameEmpty: '名称不能为空',
  nameTooLong: '文件名不能超过14字节',
  directoryEmpty: '目录为空',
  rootDir: '根目录',
  dirLabel: '目录',
  uploadFiles: '上传文件',
  runFile: '运行',
  openInEditor: '在编辑器中打开',
  download: '下载',
  rename: '重命名',

  // Terminal
  integratedTerminal: '集成终端',
  copyAll: '全部复制',
  logsEmpty: '会话日志将显示在这里...',

  // Editor status bar
  lineLabel: '行',
  columnLabel: '列',

  // Mobile navigation
  editorTab: '编辑器',
  emulatorTab: '模拟器',
  filesTab: '文件',

  // Language switcher
  language: '语言',
};

const TRANSLATIONS: Record<Language, typeof en> = { en, 'zh-CN': zhCN };

export type TranslationKey = keyof typeof en;

interface I18nContextType {
  language: Language;
  setLanguage: (lang: Language) => void;
  t: (key: TranslationKey, ...args: (string | number)[]) => string;
}

const I18nContext = createContext<I18nContextType | undefined>(undefined);

export const I18nProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [language, setLanguageState] = useState<Language>(() => {
    const saved = localStorage.getItem('lavax_language') as Language;
    if (saved && TRANSLATIONS[saved]) return saved;
    return navigator.language.startsWith('zh') ? 'zh-CN' : 'en';
  });

  const setLanguage = (lang: Language) => {
    setLanguageState(lang);
    localStorage.setItem('lavax_language', lang);
  };

  const t = (key: TranslationKey, ...args: (string | number)[]): string => {
    const str: string = TRANSLATIONS[language][key] ?? TRANSLATIONS.en[key] ?? key;
    if (args.length === 0) return str;
    return args.reduce<string>((acc, arg) => acc.replace('%s', String(arg)), str);
  };

  return React.createElement(
    I18nContext.Provider,
    { value: { language, setLanguage, t } },
    children
  );
};

export const useI18n = (): I18nContextType => {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error('useI18n must be used within an I18nProvider');
  return ctx;
};
