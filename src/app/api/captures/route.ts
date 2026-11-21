import { captureLimiter, clientIp } from '@/lib/capture/rateLimit';
import { MAX_CAPTURE_BYTES, canonicalCapture, captureId, validateCapture } from '@/lib/capture/record';
import { defaultCaptureStore } from '@/lib/capture/store';

const NO_STORE = { 'Cache-Control': 'no-store' };

function err(error: string, status: number, extra: Record<string, string> = {}) {
  return Response.json({ error }, { status, headers: { ...NO_STORE, ...extra } });
}

/** Reads the body as text, stopping once it exceeds the cap. null = too large. */
async function readLimited(request: Request): Promise<string | null> {
  const declared = Number(request.headers.get('content-length'));
  if (Number.isFinite(declared) && declared > MAX_CAPTURE_BYTES) return null;
  if (!request.body) return '';
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > MAX_CAPTURE_BYTES) {
      await reader.cancel();
      return null;
    }
    chunks.push(value);
  }
  const all = new Uint8Array(total);
  let off = 0;
  for (const c of chunks) {
    all.set(c, off);
    off += c.byteLength;
  }
  return new TextDecoder().decode(all);
}

export async function POST(request: Request) {
  if (!captureLimiter.take(clientIp(request.headers))) {
    return err('Too many captures; try again later', 429, { 'Retry-After': '600' });
  }
  const store = defaultCaptureStore();
  if (!store) return err('Capture saving is not configured', 503);

  const text = await readLimited(request);
  if (text === null) return err('Capture too large', 413);
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return err('Invalid JSON', 400);
  }
  const checked = validateCapture(raw);
  if (!checked.ok) return err(checked.error, 400);

  const json = canonicalCapture(checked.capture);
  const id = await captureId(json);
  try {
    if ((await store.get(id)) !== null) {
      return Response.json({ id, url: `/c/${id}` }, { status: 200, headers: NO_STORE });
    }
    await store.put(id, json);
  } catch {
    return err('Could not save capture', 500);
  }
  return Response.json({ id, url: `/c/${id}` }, { status: 201, headers: NO_STORE });
}
