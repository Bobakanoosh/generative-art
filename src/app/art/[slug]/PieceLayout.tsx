'use client';

import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode, type Ref, type RefObject } from 'react';
import { Icon } from '@/components/ui/Icon';
import { artBitmapWidth, artFrameWidth, stageExtraPx } from './artFrame';

const COPIED_MS = 1500;

/**
 * The piece-page shell, shared by the piece page, a stored capture and their
 * loading placeholders: the stage (art centred, never scrolls on desktop) and
 * a 360 px panel that scrolls on its own. Below lg: stage, then the panel in
 * normal flow.
 */
export function PieceLayout({
  stage,
  panel,
  panelLabel = 'Piece settings',
}: {
  stage: ReactNode;
  panel: ReactNode;
  panelLabel?: string;
}) {
  const stageRef = useRef<HTMLElement>(null);
  useStageExtra(stageRef);
  return (
    <div className="flex flex-1 flex-col lg:grid lg:h-[calc(100dvh-var(--header-h))] lg:flex-none lg:grid-cols-[minmax(0,1fr)_360px] lg:grid-rows-[minmax(0,1fr)] lg:overflow-hidden">
      <section
        ref={stageRef}
        aria-label="Artwork"
        className="flex min-w-0 flex-col items-center justify-center gap-3 px-4 pt-4 pb-8 [container-type:inline-size] sm:px-6 lg:min-h-0 lg:p-8"
      >
        {stage}
      </section>
      {/* Contained scroll: wheeling the panel never scrolls the page. `relative` keeps sr-only regions inside it. */}
      <aside
        aria-label={panelLabel}
        className="scroll-thin relative border-t border-line lg:min-h-0 lg:overflow-y-auto lg:overscroll-contain lg:border-t-0 lg:border-l"
      >
        <div className="flex min-h-full flex-col px-4 pt-7 pb-8 sm:px-6">{panel}</div>
      </aside>
    </div>
  );
}

/** Server render has no layout; skip the measuring there without React's useLayoutEffect warning. */
const useIsoLayoutEffect = typeof window === 'undefined' ? useEffect : useLayoutEffect;

/**
 * Measures what else is on the stage besides the art and its bar row (notices
 * above, lines under the bar) and sets it as `--stage-extra` on the stage, which
 * `artFrameWidth` subtracts from the art's height. Re-measures when any stage
 * child or frame child resizes, appears or goes.
 */
function useStageExtra(ref: RefObject<HTMLElement | null>) {
  useIsoLayoutEffect(() => {
    const stage = ref.current;
    if (!stage) return;
    let last = -1;
    const measure = () => {
      const art = stage.querySelector<HTMLElement>('[data-art-frame] > :first-child');
      const kids = Array.from(stage.children);
      let extra = 0;
      if (art && kids.length) {
        const rects = kids.map((k) => k.getBoundingClientRect());
        const top = Math.min(...rects.map((r) => r.top));
        const bottom = Math.max(...rects.map((r) => r.bottom));
        extra = stageExtraPx({ contentHeight: bottom - top, artHeight: art.getBoundingClientRect().height });
      }
      if (extra !== last) {
        last = extra;
        stage.style.setProperty('--stage-extra', `${extra}px`);
      }
    };
    measure();
    if (typeof ResizeObserver === 'undefined') return;
    const resize = new ResizeObserver(measure);
    /** Stage children and art-frame children are what `measure` reads; a frame's children come with it. */
    const watch = (el: Element) => {
      resize.observe(el);
      if (el.matches('[data-art-frame]')) for (const kid of el.children) resize.observe(kid);
    };
    const relevant = (parent: Node) => parent === stage || (parent instanceof Element && parent.matches('[data-art-frame]'));
    for (const el of stage.children) watch(el);
    // Only additions/removals directly on the stage or a frame matter; deeper DOM churn (bars, menus) is ignored.
    const mutations = new MutationObserver((records) => {
      let changed = false;
      for (const r of records) {
        if (!relevant(r.target)) continue;
        changed = true;
        for (const n of r.addedNodes) if (n instanceof Element) watch(n);
        for (const n of r.removedNodes) if (n instanceof Element) resize.unobserve(n);
      }
      if (changed) measure();
    });
    mutations.observe(stage, { childList: true, subtree: true });
    return () => {
      resize.disconnect();
      mutations.disconnect();
    };
  }, [ref]);
}

/**
 * The art frame: the art box at the piece's aspect, then the 40 px bar row
 * (and anything under it). Sized by `artFrameWidth`, the same for the
 * canvases and the placeholder.
 */
export function ArtFrame({
  aspect,
  style,
  sizerRef,
  children,
}: {
  aspect: number;
  style?: CSSProperties;
  /** Measure this for the canvas bitmap: the art width ignoring stage notices (`artBitmapWidth`). */
  sizerRef?: Ref<HTMLDivElement>;
  children: ReactNode;
}) {
  return (
    <div data-art-frame="" className="flex max-w-full flex-col gap-2" style={{ ...style, width: artFrameWidth(aspect) }}>
      {children}
      {/* Out of flow, zero height: no gap, no layout effect. */}
      <div
        ref={sizerRef}
        data-art-sizer=""
        aria-hidden="true"
        className="pointer-events-none invisible absolute h-0"
        style={{ width: artBitmapWidth(aspect) }}
      />
    </div>
  );
}

/** Loading stand-in with the loaded view's exact box: art at the aspect, an empty bar row. */
export function StagePlaceholder({ aspect, label }: { aspect: number; label: string }) {
  return (
    <ArtFrame aspect={aspect}>
      <div
        role="img"
        aria-label={label}
        aria-busy="true"
        className="w-full animate-pulse bg-surface motion-reduce:animate-none"
        style={{ aspectRatio: String(aspect) }}
      />
      <div aria-hidden="true" className="h-10" />
    </ArtFrame>
  );
}

/** Panel heading block: optional eyebrow, serif title, description, mono meta line. */
export function PanelHeader({
  eyebrow,
  title,
  description,
  meta,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  meta?: ReactNode;
}) {
  return (
    <header>
      {eyebrow && <p className="ui-label mb-3">{eyebrow}</p>}
      <h1 className="font-serif text-[28px] leading-[1.1] text-fg">{title}</h1>
      {description && <p className="mt-2 text-sm leading-relaxed text-muted">{description}</p>}
      {meta && <p className="mt-3 font-mono text-xs tabular-nums text-faint">{meta}</p>}
    </header>
  );
}

/** A quiet full-width action row in the panel: icon, label, hairline above. */
export const rowClass =
  'flex h-10 w-full cursor-pointer items-center gap-3 border-t border-line px-0.5 text-left text-[13px] text-muted ' +
  'transition-colors duration-150 ease-out hover:text-fg disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:text-muted';

/**
 * The secondary action rows block. Pinned to the bottom of the panel by default
 * (under the params); `pinned={false}` keeps it right under what comes before,
 * for a panel with no params (the capture page).
 */
export function ActionRows({ children, pinned = true }: { children: ReactNode; pinned?: boolean }) {
  return (
    <div data-action-rows="" className={pinned ? 'mt-auto pt-10' : 'mt-8'}>
      <div className="border-b border-line">{children}</div>
    </div>
  );
}

/** "Copy link" row: copies `url()` and shows a check and "Copied" for 1.5 s. */
export function CopyLinkRow({ url }: { url(): string }) {
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);

  const copy = async () => {
    const href = url();
    try {
      await navigator.clipboard.writeText(href);
      setCopied(true);
      clearTimeout(timer.current);
      timer.current = setTimeout(() => setCopied(false), COPIED_MS);
    } catch {
      window.prompt('Copy this link:', href);
    }
  };

  return (
    <button type="button" className={rowClass} onClick={copy} aria-live="polite">
      <Icon name={copied ? 'check' : 'link'} size={16} />
      {copied ? 'Copied' : 'Copy link'}
    </button>
  );
}
