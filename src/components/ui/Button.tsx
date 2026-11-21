import type { AnchorHTMLAttributes, ButtonHTMLAttributes, ReactNode, Ref } from 'react';

export type ButtonVariant = 'primary' | 'quiet' | 'ghost';
export type ButtonSize = 'sm' | 'md';

type CommonProps = {
  variant?: ButtonVariant;
  size?: ButtonSize;
  className?: string;
  children: ReactNode;
};

export type ButtonProps = CommonProps &
  (
    | ({ href: string } & Omit<AnchorHTMLAttributes<HTMLAnchorElement>, 'href' | 'className' | 'children'> & { disabled?: boolean })
    | ({ href?: undefined; ref?: Ref<HTMLButtonElement> } & Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'type' | 'className' | 'children'>)
  );

const BASE =
  'inline-flex select-none items-center justify-center gap-2 whitespace-nowrap rounded-xs font-sans leading-none ' +
  'transition-colors duration-150 ease-out disabled:cursor-not-allowed disabled:opacity-40 ' +
  'aria-disabled:cursor-not-allowed aria-disabled:opacity-40';

const VARIANTS: Record<ButtonVariant, string> = {
  primary: 'bg-fg text-bg hover:bg-fg/85',
  quiet: 'border border-line-strong text-fg hover:border-fg/50 hover:bg-fg/5',
  ghost: 'text-muted hover:text-fg',
};

const SIZES: Record<ButtonSize, string> = {
  sm: 'h-7 px-2.5 text-[13px]',
  md: 'h-9 px-3.5 text-sm',
};

export function buttonClass(variant: ButtonVariant = 'quiet', size: ButtonSize = 'md', extra = ''): string {
  return `${BASE} ${VARIANTS[variant]} ${SIZES[size]}${extra ? ` ${extra}` : ''}`;
}

/** A text button: `<a>` when given `href`, otherwise `<button type="button">`. */
export function Button(props: ButtonProps) {
  const { variant, size, className, children } = props;
  const cls = buttonClass(variant, size, className);
  if (props.href !== undefined) {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { variant: _v, size: _s, className: _c, children: _ch, href, disabled, ...rest } = props;
    if (disabled) {
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { onClick: _onClick, ...inert } = rest;
      return (
        <a {...inert} aria-disabled="true" tabIndex={-1} className={cls}>
          {children}
        </a>
      );
    }
    return (
      <a {...rest} href={href} className={cls}>
        {children}
      </a>
    );
  }
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { variant: _v, size: _s, className: _c, children: _ch, href: _h, ...rest } = props;
  return (
    <button {...rest} type="button" className={cls}>
      {children}
    </button>
  );
}
