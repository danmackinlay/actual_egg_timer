/**
 * Just enough CBOR (RFC 8949) for App Attest: Apple's attestation and
 * assertion objects, and the COSE key and extensions inside authenticator
 * data. Definite lengths only - Apple writes nothing else - and anything this
 * does not know is refused with an error rather than skipped, because what it
 * reads decides whether an egg is trusted.
 *
 * The encoder is the decoder's mirror for the same subset, so the tests can
 * build assertions the way a phone does.
 */

export type Cbor =
  | number
  | bigint
  | string
  | boolean
  | null
  | undefined
  | Uint8Array
  | Cbor[]
  | Map<Cbor, Cbor>;

export class CborError extends Error {}

interface Read {
  value: Cbor;
  end: number;
}

/** The first CBOR item in `bytes` from `offset`, and where it ends: authenticator
 *  data holds a COSE key followed by an extensions map, and the second can
 *  only be found by reading the first. */
export function decodeFirst(bytes: Uint8Array, offset = 0): Read {
  return item(bytes, offset, 0);
}

/** Exactly one CBOR item, filling `bytes`. */
export function decode(bytes: Uint8Array): Cbor {
  const r = item(bytes, 0, 0);
  if (r.end !== bytes.length) throw new CborError(`${bytes.length - r.end} bytes after the item`);
  return r.value;
}

const MAX_DEPTH = 16;

function need(bytes: Uint8Array, at: number, n: number): void {
  if (at + n > bytes.length) throw new CborError('truncated');
}

/** The argument of a head byte: its length, count or value. */
function argument(bytes: Uint8Array, at: number, info: number): { n: number | bigint; end: number } {
  if (info < 24) return { n: info, end: at };
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  switch (info) {
    case 24: need(bytes, at, 1); return { n: view.getUint8(at), end: at + 1 };
    case 25: need(bytes, at, 2); return { n: view.getUint16(at), end: at + 2 };
    case 26: need(bytes, at, 4); return { n: view.getUint32(at), end: at + 4 };
    case 27: {
      need(bytes, at, 8);
      const big = view.getBigUint64(at);
      return { n: big <= BigInt(Number.MAX_SAFE_INTEGER) ? Number(big) : big, end: at + 8 };
    }
    default: throw new CborError(`indefinite or reserved length (${info})`);
  }
}

function length(n: number | bigint, bytes: Uint8Array, at: number): number {
  if (typeof n === 'bigint' || n > bytes.length - at) throw new CborError('length past the end');
  return n;
}

function item(bytes: Uint8Array, at: number, depth: number): Read {
  if (depth > MAX_DEPTH) throw new CborError('nested too deep');
  need(bytes, at, 1);
  const head = bytes[at];
  const major = head >> 5;
  const info = head & 0x1f;
  if (major === 7) return simple(bytes, at + 1, info);
  const a = argument(bytes, at + 1, info);
  switch (major) {
    case 0: return { value: a.n, end: a.end };
    case 1: return { value: typeof a.n === 'bigint' ? -1n - a.n : -1 - a.n, end: a.end };
    case 2: {
      const n = length(a.n, bytes, a.end);
      return { value: bytes.slice(a.end, a.end + n), end: a.end + n };
    }
    case 3: {
      const n = length(a.n, bytes, a.end);
      const text = new TextDecoder('utf-8', { fatal: true }).decode(bytes.subarray(a.end, a.end + n));
      return { value: text, end: a.end + n };
    }
    case 4: {
      const n = length(a.n, bytes, a.end);
      const out: Cbor[] = [];
      let p = a.end;
      for (let i = 0; i < n; i++) {
        const r = item(bytes, p, depth + 1);
        out.push(r.value);
        p = r.end;
      }
      return { value: out, end: p };
    }
    case 5: {
      const n = length(a.n, bytes, a.end);
      const out = new Map<Cbor, Cbor>();
      let p = a.end;
      for (let i = 0; i < n; i++) {
        const k = item(bytes, p, depth + 1);
        const v = item(bytes, k.end, depth + 1);
        if (k.value instanceof Uint8Array || Array.isArray(k.value) || k.value instanceof Map) {
          throw new CborError('a map key that is not a number or a string');
        }
        if (out.has(k.value)) throw new CborError('a repeated map key');
        out.set(k.value, v.value);
        p = v.end;
      }
      return { value: out, end: p };
    }
    case 6: return item(bytes, a.end, depth + 1); // a tag: the item it tags
    default: throw new CborError(`major type ${major}`);
  }
}

function simple(bytes: Uint8Array, at: number, info: number): Read {
  switch (info) {
    case 20: return { value: false, end: at };
    case 21: return { value: true, end: at };
    case 22: return { value: null, end: at };
    case 23: return { value: undefined, end: at };
    case 26: {
      need(bytes, at, 4);
      return { value: new DataView(bytes.buffer, bytes.byteOffset).getFloat32(at), end: at + 4 };
    }
    case 27: {
      need(bytes, at, 8);
      return { value: new DataView(bytes.buffer, bytes.byteOffset).getFloat64(at), end: at + 8 };
    }
    default: throw new CborError(`simple value ${info}`);
  }
}

/* ---------------------------------------------------------------- encoding */

function head(major: number, n: number): number[] {
  if (n < 24) return [(major << 5) | n];
  if (n < 0x100) return [(major << 5) | 24, n];
  if (n < 0x10000) return [(major << 5) | 25, n >> 8, n & 0xff];
  if (n < 0x100000000) return [(major << 5) | 26, (n >>> 24) & 0xff, (n >> 16) & 0xff, (n >> 8) & 0xff, n & 0xff];
  throw new CborError('too long to encode');
}

/** CBOR for the decoder's subset: whole numbers that fit in 32 bits, strings,
 *  byte strings, arrays, maps, booleans and null. */
export function encode(value: Cbor): Uint8Array {
  const out: number[] = [];
  const put = (v: Cbor): void => {
    if (typeof v === 'number') {
      if (!Number.isInteger(v)) throw new CborError('only whole numbers');
      if (v >= 0) out.push(...head(0, v));
      else out.push(...head(1, -1 - v));
    } else if (typeof v === 'string') {
      const b = new TextEncoder().encode(v);
      out.push(...head(3, b.length), ...b);
    } else if (v instanceof Uint8Array) {
      out.push(...head(2, v.length), ...v);
    } else if (Array.isArray(v)) {
      out.push(...head(4, v.length));
      for (const x of v) put(x);
    } else if (v instanceof Map) {
      out.push(...head(5, v.size));
      for (const [k, x] of v) {
        put(k);
        put(x);
      }
    } else if (v === false) out.push(0xf4);
    else if (v === true) out.push(0xf5);
    else if (v === null) out.push(0xf6);
    else throw new CborError(`cannot encode ${typeof v}`);
  };
  put(value);
  return Uint8Array.from(out);
}
