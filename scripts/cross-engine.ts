// Runs the determinism probe in Node, WebKit and Firefox and diffs the hashes.
// Run: npm run test:engines   (not part of `npm test`; Chromium is skipped: same V8 as Node)
import path from 'node:path';
import { build } from 'esbuild';
import { firefox, webkit, type BrowserType } from 'playwright';

type HashMap = Record<string, string>;

async function bundleProbe(): Promise<string> {
  const result = await build({
    entryPoints: [path.join(process.cwd(), 'src/lib/determinism/probe.ts')],
    bundle: true,
    write: false,
    format: 'iife',
    globalName: '__probe',
    footer: { js: 'globalThis.runProbe = __probe.runProbe;' },
    platform: 'browser',
    target: 'es2020',
    tsconfig: path.join(process.cwd(), 'tsconfig.json'),
    logLevel: 'warning',
  });
  return result.outputFiles[0].text;
}

async function runInBrowser(type: BrowserType, code: string): Promise<HashMap> {
  const browser = await type.launch();
  try {
    const page = await browser.newPage();
    await page.addScriptTag({ content: code });
    return await page.evaluate(() => (globalThis as unknown as { runProbe(): HashMap }).runProbe());
  } finally {
    await browser.close();
  }
}

function diff(name: string, base: HashMap, other: HashMap): string[] {
  const out: string[] = [];
  for (const key of new Set([...Object.keys(base), ...Object.keys(other)])) {
    if (base[key] !== other[key]) {
      out.push(`  ${name} mismatch: ${key}\n    node=${base[key]} ${name}=${other[key]}`);
    }
  }
  return out;
}

async function main() {
  const code = await bundleProbe();
  const node = (0, eval)(`${code}\n;globalThis.runProbe()`) as HashMap;
  const engines: { name: string; type: BrowserType }[] = [
    { name: 'webkit', type: webkit },
    { name: 'firefox', type: firefox },
  ];
  const results: Record<string, HashMap> = {};
  for (const { name, type } of engines) {
    try {
      results[name] = await runInBrowser(type, code);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (/Executable doesn't exist/.test(msg)) {
        console.error(`[engines] ${name} is not installed. Run: npx playwright install webkit firefox`);
        process.exit(2);
      }
      throw e;
    }
  }
  const total = Object.keys(node).length;
  let failed = false;
  console.log(`[engines] node: ${total} hashes`);
  for (const { name } of engines) {
    const problems = diff(name, node, results[name]);
    if (problems.length) {
      failed = true;
      console.log(`[engines] ${name}: ${problems.length} MISMATCH of ${total}`);
      for (const p of problems) console.log(p);
    } else {
      console.log(`[engines] ${name}: ${total}/${total} match node`);
    }
  }
  console.log(failed ? '[engines] FAIL: engines disagree' : '[engines] OK: all engines agree');
  process.exit(failed ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
