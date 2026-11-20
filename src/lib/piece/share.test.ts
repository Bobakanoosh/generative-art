import { describe, expect, it } from 'vitest';
import { MAX_STOP_STEP, decodeGeneration, encodeGeneration, newSeed } from './share';
import flowRibbonsV1 from '@/pieces/flow-ribbons/v1';

const b64u = (s: string) => Buffer.from(s, 'utf8').toString('base64url');

describe('share codes', () => {
  it('round-trips', () => {
    const g = { v: 1, s: 'abc123', p: { a: 1, b: 'x', c: [1, 2] } };
    const code = encodeGeneration(g);
    expect(code).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(decodeGeneration(code)).toEqual(g);
    const g2 = { ...g, n: 600 };
    expect(decodeGeneration(encodeGeneration(g2))).toEqual(g2);
  });
  it('round-trips unicode', () => {
    const g = { v: 2, s: 'séed✓', p: { t: 'héllo ✓' } };
    expect(decodeGeneration(encodeGeneration(g))).toEqual(g);
  });
  it('matches Node base64url', () => {
    const g = { v: 1, s: 'abc', p: {} };
    expect(encodeGeneration(g)).toBe(b64u(JSON.stringify(g)));
  });
  it('rejects malformed codes', () => {
    expect(decodeGeneration('!!!')).toBeNull();
    expect(decodeGeneration('e30')).toBeNull();
    expect(decodeGeneration(b64u('[1]'))).toBeNull();
    expect(decodeGeneration(b64u('{"v":"1","s":"a","p":{}}'))).toBeNull();
    expect(decodeGeneration(b64u('not json'))).toBeNull();
    expect(decodeGeneration(b64u('{"v":1,"s":"","p":{}}'))).toBeNull();
    expect(decodeGeneration(b64u('{"v":1,"s":"a","p":[]}'))).toBeNull();
    expect(decodeGeneration(b64u('{"v":1,"s":"a","p":{},"n":-1}'))).toBeNull();
    expect(decodeGeneration(b64u('{"v":0,"s":"a","p":{}}'))).toBeNull();
    expect(decodeGeneration(b64u(`{"v":1,"s":"${'a'.repeat(65)}","p":{}}`))).toBeNull();
  });
  it('caps the stop step n at MAX_STOP_STEP', () => {
    expect(MAX_STOP_STEP).toBe(100_000);
    expect(decodeGeneration(b64u(`{"v":1,"s":"a","p":{},"n":${MAX_STOP_STEP}}`))).toEqual({ v: 1, s: 'a', p: {}, n: MAX_STOP_STEP });
    expect(decodeGeneration(b64u(`{"v":1,"s":"a","p":{},"n":${MAX_STOP_STEP + 1}}`))).toBeNull();
    expect(decodeGeneration(b64u('{"v":1,"s":"a","p":{},"n":1e300}'))).toBeNull();
  });
  it('rejects unknown top-level keys', () => {
    expect(decodeGeneration(b64u('{"v":1,"s":"a","p":{},"x":1}'))).toBeNull();
    expect(decodeGeneration(b64u('{"v":1,"s":"a","p":{},"n":3,"extra":null}'))).toBeNull();
    // keys inside p are the schema's business, not the decoder's
    expect(decodeGeneration(b64u('{"v":1,"s":"a","p":{"x":1}}'))).toEqual({ v: 1, s: 'a', p: { x: 1 } });
  });
  it('rejects non-canonical base64url spellings (trailing bits)', () => {
    const code = b64u('{"v":1,"s":"a","p":{}}'); // 22 bytes -> length % 4 === 2, 4 spare bits
    expect(decodeGeneration(code)).not.toBeNull();
    const last = code[code.length - 1];
    const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
    const tweaked = code.slice(0, -1) + ALPHABET[ALPHABET.indexOf(last) + 1];
    expect(Buffer.from(tweaked, 'base64url').toString()).toBe('{"v":1,"s":"a","p":{}}');
    expect(decodeGeneration(tweaked)).toBeNull();
  });
  it('rejects a leading byte-order mark', () => {
    expect(decodeGeneration(b64u('\uFEFF{"v":1,"s":"a","p":{}}'))).toBeNull();
  });
  it('still decodes every featured code canonically', () => {
    for (const code of flowRibbonsV1.featured) {
      const g = decodeGeneration(code);
      expect(g).not.toBeNull();
      expect(encodeGeneration(g!)).toBe(code);
    }
  });
  it('newSeed', () => {
    const a = newSeed();
    expect(a).toMatch(/^[a-z0-9]{10}$/);
    expect(newSeed()).not.toBe(a);
  });
});
