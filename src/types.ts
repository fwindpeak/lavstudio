
export const SCREEN_WIDTH = 160;
export const SCREEN_HEIGHT = 80;
export const MEMORY_SIZE = 1024 * 1024; // 1MB GVM range

/**
 * LavaX (.lav) File Header - 16 Bytes
 */
export interface LavHeader {
  magic: string;          // Offset 0x00: 'LAV' (0x4C 0x41 0x56)
  version: number;        // Offset 0x03: 0x12 (18)
  memoryLimit: number;    // Offset 0x05: 0x74 or 0x80
  arrayInitSize: number;  // Offset 0x06: 2 Bytes (Little-Endian)
  jpVar: number;          // Offset 0x08: 2 Bytes (Variable total space jump address)
}

// Memory Layout Offsets (VRAM, GBUF, TEXT)
export const VRAM_OFFSET = 0x0000;
export const GBUF_OFFSET = 0x0640;
export const TEXT_OFFSET = 0x0C80;
export const GLOBAL_RAM_START = 0x2000;

// Legacy/Compatibility Offsets
export const HEAP_OFFSET = 0x1000;
export const STRBUF_START = 0x7000;
export const STRBUF_END = 0x74FF;
export const GBUF_OFFSET_LVM = 0x8000;

// Handle Encoding (Bits 16-18 for type, Bit 23 for EBP base)
export const HANDLE_TYPE_BYTE = 0x010000; // 0x1 << 16
export const HANDLE_TYPE_WORD = 0x020000; // 0x2 << 16
export const HANDLE_TYPE_DWORD = 0x040000; // 0x4 << 16
export const HANDLE_BASE_EBP = 0x800000;   // Bit 23

export enum Op {
  NOP = 0x00,
  PUSH_B = 0x01,
  PUSH_W = 0x02,
  PUSH_D = 0x03,

  // Global Addressing
  LD_G_B = 0x04,
  LD_G_W = 0x05,
  LD_G_D = 0x06,
  LD_G_O_B = 0x07,
  LD_G_O_W = 0x08,
  LD_G_O_D = 0x09,
  LEA_G_B = 0x0A,
  LEA_G_W = 0x0B,
  LEA_G_D = 0x0C,

  PUSH_STR = 0x0D,

  // Local Addressing
  LD_L_B = 0x0E,
  LD_L_W = 0x0F,
  LD_L_D = 0x10,
  LD_L_O_B = 0x11,
  LD_L_O_W = 0x12,
  LD_L_O_D = 0x13,
  LEA_L_B = 0x14,
  LEA_L_W = 0x15,
  LEA_L_D = 0x16,

  LEA_OFT = 0x17,
  LEA_L_PH = 0x18,
  LEA_ABS = 0x19,

  // Memory Addressing
  LD_TEXT = 0x1A,
  LD_GRAP = 0x1B,

  // Arithmetic & Logic
  NEG = 0x1C,
  INC_PRE = 0x1D,
  DEC_PRE = 0x1E,
  INC_POS = 0x1F,
  DEC_POS = 0x20,
  ADD = 0x21,
  SUB = 0x22,
  AND = 0x23,
  OR = 0x24,
  NOT = 0x25,
  XOR = 0x26,
  L_AND = 0x27,
  L_OR = 0x28,
  L_NOT = 0x29,
  MUL = 0x2A,
  DIV = 0x2B,
  MOD = 0x2C,
  SHL = 0x2D,
  SHR = 0x2E,
  EQ = 0x2F,
  NEQ = 0x30,
  LE = 0x31,
  GE = 0x32,
  GT = 0x33,
  LT = 0x34,

  STORE = 0x35,
  LD_IND = 0x36,

  POP = 0x38,

  // Control Flow
  JZ = 0x39,
  JNZ = 0x3A, // Add JNZ (often used though 0x39 is enough)
  JMP = 0x3B,
  SPACE = 0x3C,
  CALL = 0x3D,
  FUNC = 0x3E,
  RET = 0x3F,
  EXIT = 0x40,

  INIT = 0x41,
  LD_GBUF = 0x42,
  MASK = 0x43,
  LOADALL = 0x44,

  // Inline Constants
  ADD_C = 0x45,
  SUB_C = 0x46,
  MUL_C = 0x47,
  DIV_C = 0x48,
  MOD_C = 0x49,
  SHL_C = 0x4A,
  SHR_C = 0x4B,
  EQ_C = 0x4C,
  NEQ_C = 0x4D,
  GT_C = 0x4E,
  LT_C = 0x4F,
  GE_C = 0x50,
  LE_C = 0x51,

  // Extended indirection (from reference)
  LD_IND_W = 0x52,
  LD_IND_D = 0x53,

  // Float Logic (0x54 - 0x68)
  F_ITOF = 0x54,
  F_FTOI = 0x55,
  F_ADD = 0x56,
  F_ADD_FI = 0x57,
  F_ADD_IF = 0x58,
  F_SUB = 0x59,
  F_SUB_FI = 0x5A,
  F_SUB_IF = 0x5B,
  F_MUL = 0x5C,
  F_MUL_FI = 0x5D,
  F_MUL_IF = 0x5E,
  F_DIV = 0x5F,
  F_DIV_FI = 0x60,
  F_DIV_IF = 0x61,
  F_NEG = 0x62,
  F_LT = 0x63,
  F_GT = 0x64,
  F_EQ = 0x65,
  F_NEQ = 0x66,
  F_LE = 0x67,
  F_GE = 0x68,

  F_FLAG = 0xAD, // Placeholder for func pointers in compiler
}

export enum SystemOp {
  putchar = 0x80,
  getchar = 0x81,
  printf = 0x82,
  strcpy = 0x83,
  strlen = 0x84,
  SetScreen = 0x85,
  UpdateLCD = 0x86,
  Delay = 0x87,
  WriteBlock = 0x88,
  Refresh = 0x89,
  TextOut = 0x8A,
  Block = 0x8B,
  Rectangle = 0x8C,
  exit = 0x8D,
  ClearScreen = 0x8E,
  abs = 0x8F,
  rand = 0x90,
  srand = 0x91,
  Locate = 0x92,
  Inkey = 0x93,
  Point = 0x94,
  GetPoint = 0x95,
  Line = 0x96,
  Box = 0x97,
  Circle = 0x98,
  Ellipse = 0x99,
  Beep = 0x9A,
  isalnum = 0x9B,
  isalpha = 0x9C,
  iscntrl = 0x9D,
  isdigit = 0x9E,
  isgraph = 0x9F,
  islower = 0xA0,
  isprint = 0xA1,
  ispunct = 0xA2,
  isspace = 0xA3,
  isupper = 0xA4,
  isxdigit = 0xA5,
  strcat = 0xA6,
  strchr = 0xA7,
  strcmp = 0xA8,
  strstr = 0xA9,
  tolower = 0xAA,
  toupper = 0xAB,
  memset = 0xAC,
  memcpy = 0xAD,
  fopen = 0xAE,
  fclose = 0xAF,
  fread = 0xB0,
  fwrite = 0xB1,
  fseek = 0xB2,
  ftell = 0xB3,
  feof = 0xB4,
  rewind = 0xB5,
  getc = 0xB6,
  putc = 0xB7,
  sprintf = 0xB8,
  MakeDir = 0xB9,
  DeleteFile = 0xBA,
  Getms = 0xBB,
  CheckKey = 0xBC,
  memmove = 0xBD,
  Crc16 = 0xBE,
  Secret = 0xBF,
  ChDir = 0xC0,
  FileList = 0xC1,
  GetTime = 0xC2,
  SetTime = 0xC3,
  GetWord = 0xC4,
  XDraw = 0xC5,
  ReleaseKey = 0xC6,
  GetBlock = 0xC7,
  Sin = 0xC8,
  Cos = 0xC9,
  FillArea = 0xCA,
  PutKey = 0xF1, // Moved in V3.0/TC800
  SetGraphMode = 0xCB, // Replaces old PutKey slot
  FindWord = 0xCC,
  PlayInit = 0xCD,
  PlayFile = 0xCE,
  PlayStops = 0xCF,
  SetVolume = 0xD0,
  PlaySleep = 0xD1,
  opendir = 0xD2,
  readdir = 0xD3,
  rewinddir = 0xD4,
  closedir = 0xD5,
  Refresh2 = 0xD6,
  open_key = 0xD7,
  close_key = 0xD8,
  PlayWordVoice = 0xD9,
  sysexecset = 0xDA,
  open_uart = 0xDB,
  close_uart = 0xDC,
  write_uart = 0xDD,
  read_uart = 0xDE,
  RefreshIcon = 0xDF,
  SetFgColor = 0xE0,
  SetBgColor = 0xE1,
  SetPalette = 0xE2,

  // Extended Dispatcher
  System = 0xD3, // Namespace overlap with readdir (check context)
  Math = 0xD4,   // Namespace overlap with rewinddir
}

/**
 * 0xD3 Namespace - System Core
 */
export enum SystemCoreOp {
  GetPID = 0x00,
  SetBrightness = 0x01,
  GetBrightness = 0x02,
  ComOpen = 0x03,
  ComClose = 0x04,
  ComWaitReady = 0x05,
  ComSetTimer = 0x06,
  ComGetc = 0x07,
  ComPutc = 0x08,
  ComRead = 0x09,
  ComWrite = 0x0A,
  ComXor = 0x0B,
  RamRead = 0x0C,
  DiskReclaim = 0x0D,
  DiskCheck = 0x0E,
  FlmDecode = 0x0F,
  SndPlay = 0x10,
  SndOpen = 0x11,
  SndClose = 0x12,
  SndIfEnd = 0x13,
  PY2GB = 0x14,
  SndPlayFile = 0x15,
  SndSetVolume = 0x16,
  SndGetVolume = 0x17,
  SndStop = 0x18,
  SndPause = 0x19,
  SndResume = 0x1A,
  Idle = 0x1B,
  GetVersion = 0x1C,
}

/**
 * 0xD4 Namespace - Math Framework
 */
export enum MathFrameworkOp {
  Conversion = 0x00,
  fadd = 0x02,
  fsub = 0x03,
  fmul = 0x04,
  fdiv = 0x05,
  f2i = 0x06,
  sin = 0x07,
  cos = 0x08,
  tan = 0x09,
  asin = 0x0A,
  acos = 0x0B,
  atan = 0x0C,
  sqrt = 0x0D,
  exp = 0x0E,
  log = 0x0F,
  str2f = 0x10,
  f2str = 0x11,
}

// Legacy MathOp for compatibility
export enum MathOp {
  itof = 0x01,
  fadd = 0x02,
  fsub = 0x03,
  fmul = 0x04,
  fdiv = 0x05,
  ftoi = 0x06,
  sin = 0x07,
  cos = 0x08,
  tan = 0x09,
  asin = 0x0A,
  acos = 0x0B,
  atan = 0x0C,
  sqrt = 0x0D,
  exp = 0x0E,
  log = 0x0F,
  atof = 0x10,
  fabs = 0x13,
}
