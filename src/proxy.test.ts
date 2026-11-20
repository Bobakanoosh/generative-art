import { describe, expect, it } from 'vitest';
import { NextRequest } from 'next/server';
import { proxy } from './proxy';

const call = (path: string) => proxy(new NextRequest(`http://localhost${path}`));

describe('proxy', () => {
  it('passes known pieces through', () => {
    const res = call('/art/flow-ribbons?g=anything');
    expect(res.status).toBe(200);
    expect(res.headers.get('x-middleware-next')).toBe('1');
  });

  it('rewrites unknown slugs to the not-found page with a 404 status', () => {
    for (const path of ['/art/nope', '/art/%E2%9C%93', '/art/%E0%A4%A']) {
      const res = call(path);
      expect(res.status).toBe(404);
      expect(res.headers.get('x-middleware-rewrite')).toContain('/_not-found');
    }
  });
});
