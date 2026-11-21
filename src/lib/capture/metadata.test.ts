import { describe, expect, it } from 'vitest';
import { goodCapture } from './fixtures';
import { captureMetadata } from './metadata';
import { canonicalCapture, captureId } from './record';
import { loadCapture, memoryStore } from './store';

describe('captureMetadata', () => {
  it('uses the capture PNG route as the OG and Twitter image for a stored capture', async () => {
    const store = memoryStore();
    const json = canonicalCapture(goodCapture());
    const id = await captureId(json);
    await store.put(id, json);

    const meta = await captureMetadata(id, (x) => loadCapture(x, store), 'https://art.example');
    expect(meta).not.toBeNull();
    const image = { url: `/api/render/c/${id}?w=1200`, width: 1200, height: 1200, alt: 'Murmuration' };
    expect(meta!.title).toBe('Murmuration');
    expect(meta!.metadataBase?.toString()).toBe('https://art.example/');
    expect(meta!.openGraph?.images).toEqual([image]);
    expect(meta!.twitter?.images).toEqual([image]);
    expect((meta!.twitter as { card?: string }).card).toBe('summary_large_image');
  });

  it('returns null for unknown and malformed ids', async () => {
    const store = memoryStore();
    expect(await captureMetadata('AAAAAAAAAAAA', (x) => loadCapture(x, store), 'https://art.example')).toBeNull();
    expect(await captureMetadata('bad!', (x) => loadCapture(x, store), 'https://art.example')).toBeNull();
  });
});
