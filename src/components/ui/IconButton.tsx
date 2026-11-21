import { Icon, type IconName } from './Icon';

export type IconButtonProps = {
  icon: IconName;
  /** Accessible name, also shown as the tooltip. */
  label: string;
  onClick?(): void;
  /** Toggle state; omit for a plain action button. */
  pressed?: boolean;
  disabled?: boolean;
  size?: 'sm' | 'md';
};

/** A square icon-only button: 32 px (28 px for `sm`). */
export function IconButton({ icon, label, onClick, pressed, disabled, size = 'md' }: IconButtonProps) {
  const box = size === 'sm' ? 'size-7' : 'size-8';
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      aria-pressed={pressed === undefined ? undefined : pressed}
      disabled={disabled}
      onClick={onClick}
      className={
        `${box} inline-flex shrink-0 items-center justify-center rounded-xs text-muted ` +
        'transition-colors duration-150 ease-out hover:bg-fg/5 hover:text-fg ' +
        'aria-pressed:bg-fg/10 aria-pressed:text-fg disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent'
      }
    >
      <Icon name={icon} size={size === 'sm' ? 16 : 18} />
    </button>
  );
}
