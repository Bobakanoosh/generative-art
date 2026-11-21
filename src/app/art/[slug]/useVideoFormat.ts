'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { onIdle, once } from '@/lib/video/deferredProbe';
import { browserCodecProbe, pickVideoFormat } from '@/lib/video/encode';

/** 'unknown' until the deferred codec probe resolves; record buttons stay usable meanwhile. */
export type VideoProbe = 'unknown' | 'mp4' | 'webm' | 'none';

/**
 * Which video container this browser can encode. The probe imports mediabunny
 * (~760 KB): it runs once, when the browser is idle or the viewer
 * hovers/focuses a record button (`startProbe`), never during the page load.
 */
export function useVideoFormat(aspect: number): {
  probe: VideoProbe;
  startProbe(): Promise<'mp4' | 'webm' | null>;
} {
  const [probe, setProbe] = useState<VideoProbe>('unknown');
  const mounted = useRef(true);
  const runProbe = useMemo(() => once(() => pickVideoFormat(browserCodecProbe(aspect)).catch(() => null)), [aspect]);
  const startProbe = useCallback(async () => {
    const format = await runProbe();
    if (mounted.current) setProbe(format ?? 'none');
    return format;
  }, [runProbe]);

  useEffect(() => {
    mounted.current = true;
    const cancel = onIdle(() => void startProbe(), window);
    return () => {
      mounted.current = false;
      cancel();
    };
  }, [startProbe]);

  return { probe, startProbe };
}
