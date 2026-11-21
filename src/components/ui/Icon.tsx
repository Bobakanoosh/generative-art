import type { ReactNode } from 'react';

/**
 * A small, hand-drawn icon set: 20×20 grid, 1.5 px stroke in currentColor,
 * round caps and joins. Decorative only (aria-hidden); the control that holds
 * an icon carries the label.
 */
export const ICON_NAMES = [
  'play',
  'pause',
  'replay',
  'skip',
  'restart',
  'capture',
  'record',
  'stop',
  'download',
  'print',
  'link',
  'check',
  'close',
  'shuffle',
  'dice',
  'reset',
  'chevron-down',
  'arrow-left',
  'video',
] as const;

export type IconName = (typeof ICON_NAMES)[number];

const dot = (cx: number, cy: number, r = 1) => <circle key={`${cx},${cy}`} cx={cx} cy={cy} r={r} fill="currentColor" stroke="none" />;

const PATHS: Record<IconName, ReactNode> = {
  play: <path d="M6.5 4.5v11l9-5.5z" />,
  pause: <path d="M7 4.5v11M13 4.5v11" />,
  replay: (
    <>
      <path d="M4 10a6 6 0 1 0 1.76-4.24L4 7.5" />
      <path d="M4 4v3.5h3.5" />
    </>
  ),
  skip: <path d="M5 4.5v11l7.5-5.5zM15 4.5v11" />,
  restart: <path d="M5 4.5v11M15 4.5v11L7.5 10z" />,
  capture: (
    <>
      <path d="M3.5 7V3.5H7M13 3.5h3.5V7M16.5 13v3.5H13M7 16.5H3.5V13" />
      <circle cx="10" cy="10" r="2.5" />
    </>
  ),
  record: <circle cx="10" cy="10" r="4.5" fill="currentColor" stroke="none" />,
  stop: <rect x="5.5" y="5.5" width="9" height="9" rx="1" fill="currentColor" stroke="none" />,
  download: <path d="M10 3.5v9M6 9l4 4 4-4M4 16.5h12" />,
  print: (
    <>
      <path d="M6 7.5v-4h8v4" />
      <path d="M6 14H4.5a1 1 0 0 1-1-1V8.5a1 1 0 0 1 1-1h11a1 1 0 0 1 1 1V13a1 1 0 0 1-1 1H14" />
      <path d="M6 11.5h8v5H6z" />
    </>
  ),
  link: (
    <>
      <path d="M8.5 11.5a3 3 0 0 0 4.24 0l2.5-2.5A3 3 0 0 0 11 4.76l-.75.75" />
      <path d="M11.5 8.5a3 3 0 0 0-4.24 0l-2.5 2.5A3 3 0 0 0 9 15.24l.75-.75" />
    </>
  ),
  check: <path d="M4.5 10.5 8 14l7.5-8" />,
  close: <path d="M5 5l10 10M15 5 5 15" />,
  shuffle: <path d="M3.5 6.5h3l7 7h3M3.5 13.5h3l7-7h3M14.5 4.5l2 2-2 2M14.5 11.5l2 2-2 2" />,
  dice: (
    <>
      <rect x="3.5" y="3.5" width="13" height="13" rx="2" />
      {dot(7, 7)}
      {dot(10, 10)}
      {dot(13, 13)}
    </>
  ),
  reset: <path d="M4.5 7.5h8a4 4 0 0 1 0 8H8M7.5 4.5l-3 3 3 3" />,
  'chevron-down': <path d="M5.5 8 10 12.5 14.5 8" />,
  'arrow-left': <path d="M16 10H4.5M9 5.5 4.5 10 9 14.5" />,
  video: (
    <>
      <rect x="2.5" y="5.5" width="10" height="9" rx="1" />
      <path d="M12.5 9l5-2.5v7l-5-2.5" />
    </>
  ),
};

export function Icon({ name, size = 20 }: { name: IconName; size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      data-icon={name}
      className="shrink-0"
    >
      {PATHS[name]}
    </svg>
  );
}
