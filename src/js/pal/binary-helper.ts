/* eslint-disable no-param-reassign */

type TypedArrayCtor =
  | Uint8ArrayConstructor
  | Int8ArrayConstructor
  | Uint16ArrayConstructor
  | Int16ArrayConstructor
  | Uint32ArrayConstructor
  | Int32ArrayConstructor
  | Float32ArrayConstructor;

const typeDefine: Record<string, string> = {
  '1': 'Uint8',
  '2': 'Uint16',
  '4': 'Uint32',
  u8: 'Uint8',
  UCHAR: 'Uint8',
  BYTE: 'Uint8',
  i8: 'Int8',
  CHAR: 'Int8',
  u16: 'Uint16',
  WORD: 'Uint16',
  USHORT: 'Uint16',
  i16: 'Int16',
  SHORT: 'Int16',
  u32: 'Uint32',
  UINT: 'Uint32',
  UINT32: 'Uint32',
  DWORD: 'Uint32',
  i32: 'Int32',
  INT: 'Int32',
  BOOL: 'Int32',
  FLOAT: 'Float32'
};

const sizeMap: Record<string, number> = {
  Uint8: 1,
  Int8: 1,
  Uint16: 2,
  Int16: 2,
  Uint32: 4,
  Int32: 4,
  Float32: 4
};

const typeMap: Record<string, TypedArrayCtor> = {
  Uint8Array,
  Int8Array,
  Uint16Array,
  Int16Array,
  Uint32Array,
  Int32Array,
  Float32Array
} as any;

function convertType(type: string) {
  return typeDefine[type] || type;
}

function typeToSize(type: string) {
  type = convertType(type);
  return sizeMap[type] || null;
}

function typeToArray(type: string, len: number) {
  type = convertType(type);
  return new (typeMap[type] as TypedArrayCtor)(len);
}

function sizeToArray(type: any, baseArr: Uint8Array, len: number, offset: number) {
  // prettier-ignore
  switch (type.BYTES_PER_ELEMENT) {
    case 1: return baseArr.subarray(offset, offset + len);
    case 2: return new Uint16Array(baseArr.buffer, baseArr.byteOffset + offset, len);
    case 4: return new Uint32Array(baseArr.buffer, baseArr.byteOffset + offset, len);
    default: return new typeMap[type]().subarray(offset, offset + len);
  }
}

function filterProperty(arr: any[]) {
  const a: any = arr;
  a.name = a.name || 'data';
  a.offset = 0;
  const props: any[] = [];
  arr.forEach((item) => {
    if (typeof item === 'string') {
      item = item.split('|');
    }
    const type = convertType(item[1]);
    item.size = typeToSize(type) * (item[2] || 1) || 0;
    if (item[0] == null) {
      item[0] = 'field_' + Math.random();
    }
    if (item.length === 3 && ('' + item[2]).indexOf('*') === -1) {
      item[2] = parseInt(item[2], 10);
    }
    props.push(item);
  });
  props.forEach((item) => {
    item.offset = a.offset;
    a.offset += item.size;
  });
  a.push = function(...args: any[]) {
    const rt = Array.prototype.push.apply(this, args);
    filterProperty(this);
    return rt;
  };
  a.size = arr.reduce((cur, pre) => cur + (pre.size || 0), 0);
  a.byteLength = a.size;
  a.BYTES_PER_ELEMENT = 1;
  return a;
}

function resolveStruct(str: string) {
  const arr: any[] = [];
  str.split(/\s+/).forEach((item) => {
    const el = item.split('|');
    arr.push(el);
  });
  return arr;
}

export const StructStore: Record<string, any> = {};

export class BinaryReader {
  private _dataview: DataView;
  littleEndian: boolean;

  constructor(buffer: ArrayBuffer, byteOffset?: number, byteLength?: number, littleEndian?: boolean) {
    const byteOffsetReal = byteOffset || 0;
    const byteLengthReal = byteLength || buffer.byteLength;
    this._dataview = new DataView(buffer, byteOffsetReal, byteLengthReal);
    this.littleEndian = !!littleEndian;
  }
}

// Dynamically add type getter/setter wrappers on BinaryReader
['Uint8', 'Int8', 'Uint16', 'Int16', 'Uint32', 'Int32', 'Float32'].forEach((type) => {
  const funcName = type;
  if (!(BinaryReader.prototype as any)['get' + funcName]) {
    (BinaryReader.prototype as any)['get' + funcName] = function(byteOffset: number, littleEndian?: boolean) {
      return (this as any)._dataview['get' + funcName](byteOffset, littleEndian != null ? littleEndian : (this as any).littleEndian);
    };
    (BinaryReader.prototype as any)['set' + funcName] = function(byteOffset: number, value: number, littleEndian?: boolean) {
      return (this as any)._dataview['set' + funcName](byteOffset, value, littleEndian != null ? littleEndian : (this as any).littleEndian);
    };
  }
});

// type aliases for compatibility
['Uint8', 'Int8', 'Uint16', 'Int16', 'Uint32', 'Int32', 'Float32'].forEach((type) => {
  const realType = convertType(type);
  (BinaryReader.prototype as any)['get' + type] = (BinaryReader.prototype as any)['get' + realType];
  (BinaryReader.prototype as any)['set' + type] = (BinaryReader.prototype as any)['set' + realType];
});

export const LPBYTE = Uint8Array;
export const LPWORD = Uint16Array;
export const LPDWORD = Uint32Array;
export const LPSTR = Uint8Array;
export const LPGAMEPAD = Uint32Array;

export function defineStruct(typename: string, define: string | any[]) {
  define = Array.isArray(define) ? define : resolveStruct(define);
  StructStore[typename] = function(buf: any) {
    if (buf instanceof ArrayBuffer || ArrayBuffer.isView(buf)) {
      const arr = filterProperty(define as any);
      const tarr: any = (buf as any).buffer
        ? new LPBYTE((buf as any).buffer, (buf as any).byteOffset || 0, (buf as any).byteLength || (buf as any).length)
        : new LPBYTE(buf as ArrayBuffer);
      for (let i = 0; i < arr.length; i++) {
        const field = arr[i];
        let ret: any = null;
        const offset = field.offset;
        let len = field[2] || 1;
        const Type: any = typeMap[field[1]] || LPBYTE;
        if (typeof len === 'string' && ('' + len).indexOf('*') >= 0) {
          const l = len.split('*');
          const len1 = parseInt(l[0], 10);
          const len2 = parseInt(l[1], 10);
          ret = new Array(len1);
          for (let i2 = 0; i2 < len1; i2++) {
            const obj = sizeToArray(Type, tarr, len2, offset + i2 * Type.BYTES_PER_ELEMENT * len2);
            ret[i2] = obj;
          }
          (ret as any).uint8Array = tarr.subarray(offset, offset + Type.BYTES_PER_ELEMENT * len1 * len2);
        } else if (len > 1) {
          ret = sizeToArray(Type, tarr, len, offset);
          ret.uint8Array = tarr.subarray(offset, offset + Type.BYTES_PER_ELEMENT * len);
        } else {
          ret = sizeToArray(Type, tarr, 1, offset)[0];
        }
        (this as any)[field[0]] = ret;
      }
      (this as any).uint8Array = tarr;
    } else {
      let arr: any[] = filterProperty(define as any);
      arr = arr.map((item) => {
        let ret;
        const len = item[2] || 1;
        if ((item[1] as string).indexOf('@') === 0) {
          ret = new (StructStore[(item[1] as string).substr(1)])(len);
        } else if (typeof len === 'string' && ('' + len).indexOf('*') > 0) {
          const l = (len as string).split('*');
          const len1 = parseInt(l[0], 10);
          const len2 = parseInt(l[1], 10);
          ret = new Array(len1);
          for (let i = 0; i < len1; i++) {
            const sub = typeToArray(item[1], len2);
            ret[i] = sub;
          }
        } else if (len > 1) {
          ret = typeToArray(item[1], len);
        } else {
          ret = 0;
        }
        (ret as any).fieldName = item[0];
        return ret;
      });
      const arrFunc: any = function() {
        const args = arguments;
        arr.forEach((item, i) => {
          this[arr[i].fieldName] = args[i] || (item instanceof Array ? [] : item);
        });
      };
      arrFunc.byteLength = (define as any).byteLength;
      arrFunc.BYTES_PER_ELEMENT = (define as any).BYTES_PER_ELEMENT;
      arrFunc.prototype = arr;
      StructStore[typename] = arrFunc;
      return arrFunc;
    }
  };
  StructStore[typename].define = filterProperty(define as any);
  StructStore[typename].size = (define as any).size;
  StructStore[typename].byteLength = (define as any).size;
  StructStore[typename].prototype = filterProperty(define as any);
  StructStore[typename].fieldCount = (define as any).length;
  return StructStore[typename];
}

export function readString(buf: Uint8Array, offset: number, len?: number) {
  len = len || buf.length - offset;
  let str = '';
  for (let i = 0; i < len; i++) {
    if (buf[offset + i] === 0) {
      break;
    }
    str += String.fromCharCode(buf[offset + i]);
  }
  return str;
}

export function readBytes(buf: Uint8Array, offset: number, len: number) {
  return buf.subarray(offset, offset + len);
}

export function read2Bytes(buf: Uint8Array, offset: number, littleEndian = true) {
  const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  return dv.getUint16(offset, littleEndian);
}

export function read4Bytes(buf: Uint8Array, offset: number, littleEndian = true) {
  const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  return dv.getUint32(offset, littleEndian);
}

export function SWAP16(x: number) {
  return ((x & 0xff) << 8) | ((x >> 8) & 0xff);
}

export function SWAP32(x: number) {
  return ((x & 0xff) << 24) | ((x & 0xff00) << 8) | ((x >> 8) & 0xff00) | ((x >> 24) & 0xff);
}

export function isCopyable(x: any) {
  if (!x || typeof x !== 'object') {
    return false;
  }
  if (ArrayBuffer.isView(x)) {
    return true;
  }
  if (Array.isArray(x) && x.length && ArrayBuffer.isView(x[0])) {
    return true;
  }
  return false;
}

export function clone(src: any) {
  if (ArrayBuffer.isView(src)) {
    return (src as any).slice();
  }
  if (Array.isArray(src)) {
    if (src.length && ArrayBuffer.isView(src[0])) {
      return src.map((obj) => (obj as any).slice());
    }
    return src.map((obj) => clone(obj));
  }
  if (src && typeof src === 'object') {
    const ret: any = {};
    Object.keys(src).forEach((key) => {
      ret[key] = clone(src[key]);
    });
    return ret;
  }
  return src;
}

// Provide globals for compatibility
const GLOBAL_SCOPE: any = typeof globalThis !== 'undefined' ? globalThis : (typeof global !== 'undefined' ? global : {});
GLOBAL_SCOPE.BinaryReader = BinaryReader;
GLOBAL_SCOPE.LPBYTE = LPBYTE;
GLOBAL_SCOPE.LPWORD = LPWORD;
GLOBAL_SCOPE.LPDWORD = LPDWORD;
GLOBAL_SCOPE.LPSTR = LPSTR;
GLOBAL_SCOPE.LPGAMEPAD = LPGAMEPAD;
GLOBAL_SCOPE.defineStruct = defineStruct;
GLOBAL_SCOPE.readString = readString;
GLOBAL_SCOPE.readBytes = readBytes;
GLOBAL_SCOPE.read2Bytes = read2Bytes;
GLOBAL_SCOPE.read4Bytes = read4Bytes;
GLOBAL_SCOPE.SWAP16 = SWAP16;
GLOBAL_SCOPE.SWAP32 = SWAP32;
GLOBAL_SCOPE.clone = clone;
