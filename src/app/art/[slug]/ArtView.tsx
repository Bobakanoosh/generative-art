'use client';

import { useMemo, useState } from 'react';
import type { Generation, PieceDefinition } from '@/lib/piece/types';
import { useGeneration } from '@/lib/piece/useGeneration';
import { printHref } from '@/lib/print/paper';
import { isLive } from '@/lib/live/live';
import { pngDownloadWidth } from '@/lib/render/downloadWidth';
import { latestVersion } from '@/pieces';
import { Button } from '@/components/ui/Button';
import { Icon } from '@/components/ui/Icon';
import { IconButton } from '@/components/ui/IconButton';
import ArtCanvas from './ArtCanvas';
import LiveCanvas from './LiveCanvas';
import ParamPanel from './ParamPanel';
import { ActionRows, CopyLinkRow, PanelHeader, PieceLayout, rowClass } from './PieceLayout';
import VideoExport from './VideoExport';

interface ArtViewProps {
  slug: string;
  initialCode: string | null;
  initialSeed: string;
}

export default function ArtView({ slug, initialCode, initialSeed }: ArtViewProps) {
  const { piece, state, code, renderDelayMs, regenerate, randomize, reset, setParam, dismissIssues, goLive } =
    useGeneration(slug, initialCode, initialSeed);
  const latest = latestVersion(slug);
  const isOutdated = latest !== undefined && latest > state.gen.v;
  // Endless/interactive generations run live; one with a stop step n is a captured moment (a build to n).
  const live = useMemo(() => {
    try {
      return isLive(piece, state.gen);
    } catch {
      return false; // setup threw: the build canvas shows the error
    }
  }, [piece, state.gen]);
  const runningLive = live && state.gen.n === undefined;

  return (
    <PieceLayout
      stage={
        <>
          {isOutdated && (
            <p role="status" className="w-full max-w-3xl border border-line-strong bg-surface px-3 py-2 text-[13px] text-muted">
              A newer version of this piece exists.{' '}
              {/* Plain <a>: a full load re-initialises the generation from the URL. */}
              <a href={`/art/${slug}`} className="text-fg underline decoration-1 underline-offset-4 hover:decoration-fg/60">
                View the latest
              </a>
            </p>
          )}
          {state.issues.length > 0 && <IssuesNotice issues={state.issues} onDismiss={dismissIssues} />}
          {runningLive ? (
            <LiveCanvas slug={slug} piece={piece} gen={state.gen} delayMs={renderDelayMs} />
          ) : (
            <ArtCanvas piece={piece} gen={state.gen} motion={state.motion} delayMs={renderDelayMs}>
              {live && (
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[13px]">
                  <span className="text-muted">
                    A captured moment at step <span className="font-mono tabular-nums">{state.gen.n}</span>.
                  </span>
                  <Button variant="quiet" size="sm" onClick={goLive} title="Run this piece live from the start">
                    <Icon name="play" size={14} />
                    Go live
                  </Button>
                </div>
              )}
            </ArtCanvas>
          )}
        </>
      }
      panel={
        <>
          <PanelHeader title={piece.title} description={piece.description} meta={`v${state.gen.v} · seed ${state.gen.s}`} />
          <PrimaryActions onRegenerate={regenerate} onRandomize={randomize} onReset={reset} />
          <div className="mt-8">
            <ParamPanel schema={piece.schema} params={state.gen.p} onChange={setParam} />
          </div>
          <SecondaryActions
            piece={piece}
            gen={state.gen}
            slug={slug}
            code={code}
            seed={state.gen.s}
            live={runningLive}
            pngWidth={pngDownloadWidth(live, state.gen.n)}
          />
        </>
      }
    />
  );
}

/** Issues shown before the rest fold behind a toggle: a long list would take the art's height. */
const ISSUES_SHOWN = 3;

/** What a share link got wrong (clamped, missing or unknown params), dismissable. */
function IssuesNotice({ issues, onDismiss }: { issues: string[]; onDismiss(): void }) {
  const [expanded, setExpanded] = useState(false);
  const hidden = issues.length - ISSUES_SHOWN;
  const shown = expanded || hidden <= 0 ? issues : issues.slice(0, ISSUES_SHOWN);
  return (
    <div role="alert" className="flex w-full max-w-3xl items-start gap-3 border border-line-strong bg-surface px-3 py-2 text-[13px]">
      <div className="flex-1">
        <ul className="list-none space-y-0.5">
          {shown.map((issue, i) => (
            <li key={i}>{issue}</li>
          ))}
        </ul>
        {hidden > 0 && (
          <button
            type="button"
            aria-expanded={expanded}
            onClick={() => setExpanded((e) => !e)}
            className="mt-1 cursor-pointer text-muted underline decoration-1 underline-offset-4 transition-colors duration-150 ease-out hover:text-fg"
          >
            {expanded ? 'Show fewer' : `Show ${hidden} more`}
          </button>
        )}
      </div>
      <IconButton icon="close" label="Dismiss notice" size="sm" onClick={onDismiss} />
    </div>
  );
}

function PrimaryActions(props: { onRegenerate(): void; onRandomize(): void; onReset(): void }) {
  return (
    <div className="mt-6 flex items-center gap-2">
      <Button variant="primary" className="flex-1" onClick={props.onRegenerate} title="New seed, same settings">
        <Icon name="dice" size={16} />
        Regenerate
      </Button>
      <Button variant="quiet" className="flex-1" onClick={props.onRandomize} title="New seed and random settings">
        <Icon name="shuffle" size={16} />
        Randomize
      </Button>
      <IconButton icon="reset" label="Reset settings to defaults" onClick={props.onReset} />
    </div>
  );
}

function SecondaryActions(props: {
  piece: PieceDefinition;
  gen: Generation;
  slug: string;
  code: string;
  seed: string;
  /** Running live: build-only exports (PNG, video, print) are hidden; Capture is in the live bar. */
  live: boolean;
  /** Download width: smaller for long live moments, which the server renders by replaying every step. */
  pngWidth: number;
}) {
  const { slug, code, seed } = props;
  const pngHref = `/api/render?slug=${encodeURIComponent(slug)}&g=${code}&w=${props.pngWidth}`;

  return (
    <ActionRows>
      {/* Built from the code, not location.href: the address bar lags param tweaks by the URL debounce. */}
      <CopyLinkRow url={() => `${window.location.origin}/art/${encodeURIComponent(slug)}?g=${code}`} />
      {!props.live && (
        <>
          <a className={rowClass} href={pngHref} download={`${slug}-${seed}.png`}>
            <Icon name="download" size={16} />
            Download PNG
          </a>
          <VideoExport piece={props.piece} gen={props.gen} slug={slug} />
          <a className={rowClass} href={printHref(slug, code)}>
            <Icon name="print" size={16} />
            Print or save as PDF
          </a>
        </>
      )}
    </ActionRows>
  );
}
