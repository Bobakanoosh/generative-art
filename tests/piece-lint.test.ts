import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { ESLint } from 'eslint';

const repoRoot = path.resolve(__dirname, '..');
const eslint = new ESLint({ cwd: repoRoot });

async function errors(code: string, filePath: string) {
  const [res] = await eslint.lintText(code, { filePath: path.join(repoRoot, filePath) });
  return res.messages.filter((m) => m.severity === 2);
}

const PIECE = 'src/pieces/x/v1/index.ts';
const banned = [
  'Math.random()',
  'Math.sin(1)',
  'Math.pow(2,2)',
  'Date.now()',
  'new Date()',
  'performance.now()',
  'ctx.getImageData(0,0,1,1)',
  "ctx['getImageData'](0,0,1,1)",
  '(() => { const { getImageData } = ctx; return getImageData; })()',
  "Math['sin'](1)",
  '(() => { const { sin } = Math; return sin; })()',
  'crypto.getRandomValues(new Uint8Array(4))',
  'crypto.randomUUID()',
  'globalThis.crypto.randomUUID()',
  'window.crypto.getRandomValues(new Uint8Array(4))',
  'globalThis.Math.random()',
  'window.Math.sin(1)',
  "globalThis.Math['cos'](1)",
  "globalThis['Math'].random()",
  'self.Math.pow(2,2)',
  '(() => { const { sin } = globalThis.Math; return sin; })()',
  'globalThis.Date.now()',
  'window.performance.now()',
];
const BANNED_MATH = ['random','sin','cos','tan','asin','acos','atan','atan2','sinh','cosh','tanh','exp','expm1','log','log1p','log2','log10','pow','cbrt','hypot'];
const allowed = ['Math.sqrt(2)', 'Math.floor(1.5)', 'Math.PI', 'globalThis.Math.sqrt(2)', 'window.Math.PI'];
const ALLOWED_MATH = ['sqrt','abs','floor','ceil','round','trunc','min','max','sign','fround','imul'];

describe('pieces lint guard', () => {
  for (const code of banned) {
    it(`rejects ${code} in pieces`, async () => {
      const e = await errors(`export const a = ${code};\n`, PIECE);
      expect(e.length).toBeGreaterThanOrEqual(1);
    });
    it(`allows ${code} outside pieces`, async () => {
      const e = await errors(`export const a = ${code};\n`, 'src/lib/x.ts');
      expect(e.filter((m) => /no-restricted/.test(m.ruleId ?? ''))).toHaveLength(0);
    });
  }
  for (const code of allowed) {
    it(`allows ${code} in pieces`, async () => {
      expect(await errors(`export const a = ${code};\n`, PIECE)).toHaveLength(0);
    });
  }
  for (const m of BANNED_MATH) {
    it(`rejects Math.${m} (dot, bracket, destructure)`, async () => {
      for (const code of [`Math.${m}(1)`, `Math['${m}'](1)`, `(() => { const { ${m} } = Math; return ${m}; })()`]) {
        expect((await errors(`export const a = ${code};
`, PIECE)).length, code).toBeGreaterThanOrEqual(1);
      }
    });
  }
  for (const m of BANNED_MATH) {
    it(`rejects globalThis.Math.${m} / window.Math.${m}`, async () => {
      for (const code of [`globalThis.Math.${m}(1)`, `window.Math['${m}'](1)`]) {
        expect((await errors(`export const a = ${code};
`, PIECE)).length, code).toBeGreaterThanOrEqual(1);
      }
    });
  }
  for (const m of ALLOWED_MATH) {
    it(`allows Math.${m}`, async () => {
      expect(await errors(`export const a = Math.${m}(1);
`, PIECE)).toHaveLength(0);
    });
  }
});
