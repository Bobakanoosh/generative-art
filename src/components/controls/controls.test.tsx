// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { Slider } from './Slider';
import { NumberInput } from './NumberInput';
import { Toggle } from './Toggle';
import { ColorSwatch } from './ColorSwatch';
import { Segmented } from './Segmented';
import { Chips } from './Chips';
import { PaletteEditor } from './PaletteEditor';

afterEach(cleanup);

/** Fire a native `input` (React's onChange for range/text) with a new value. */
function inputValue(el: HTMLElement, value: string) {
  fireEvent.input(el, { target: { value } });
}

describe('Slider', () => {
  const setup = (onChange = vi.fn()) => {
    render(<Slider id="s" label="Length" value={300} min={50} max={800} step={1} onChange={onChange} />);
    return { onChange, range: screen.getByRole('slider', { name: 'Length' }) as HTMLInputElement };
  };

  it('is a labelled native range with the schema bounds', () => {
    const { range } = setup();
    expect(range.type).toBe('range');
    expect(range.min).toBe('50');
    expect(range.max).toBe('800');
    expect(range.step).toBe('1');
    expect(range.value).toBe('300');
  });

  it('emits live values while dragging and exactly one commit on release', () => {
    const { onChange, range } = setup();
    fireEvent.pointerDown(range);
    inputValue(range, '310');
    inputValue(range, '320');
    expect(onChange.mock.calls).toEqual([
      [310, true],
      [320, true],
    ]);
    fireEvent.pointerUp(range);
    fireEvent.change(range); // the native change after pointerup must not commit again
    expect(onChange.mock.calls.slice(2)).toEqual([[320, false]]);
  });

  it('commits on the native change event when no pointerup arrives', () => {
    const { onChange, range } = setup();
    inputValue(range, '400');
    // jsdom/React: dispatch a bare native change event (as a browser does after a drag).
    range.dispatchEvent(new Event('change', { bubbles: true }));
    expect(onChange.mock.calls).toEqual([
      [400, true],
      [400, false],
    ]);
  });

  it('arrow keys commit on keyup', () => {
    const { onChange, range } = setup();
    fireEvent.keyDown(range, { key: 'ArrowRight' });
    inputValue(range, '301');
    fireEvent.keyUp(range, { key: 'ArrowRight' });
    expect(onChange.mock.calls).toEqual([
      [301, true],
      [301, false],
    ]);
  });

  it('commits once on pointercancel (the browser took the drag over)', () => {
    const { onChange, range } = setup();
    fireEvent.pointerDown(range);
    inputValue(range, '350');
    fireEvent.pointerCancel(range);
    fireEvent.pointerUp(range);
    range.dispatchEvent(new Event('change', { bubbles: true }));
    expect(onChange.mock.calls).toEqual([
      [350, true],
      [350, false],
    ]);
  });

  it('commits once on blur when focus leaves mid-change', () => {
    const { onChange, range } = setup();
    fireEvent.keyDown(range, { key: 'ArrowRight' });
    inputValue(range, '301');
    fireEvent.blur(range);
    fireEvent.keyUp(range, { key: 'ArrowRight' });
    expect(onChange.mock.calls).toEqual([
      [301, true],
      [301, false],
    ]);
  });

  it('pointercancel or blur without a drag commits nothing', () => {
    const { onChange, range } = setup();
    fireEvent.pointerCancel(range);
    fireEvent.blur(range);
    expect(onChange).not.toHaveBeenCalled();
  });

  it('a release without any drag commits nothing', () => {
    const { onChange, range } = setup();
    fireEvent.pointerUp(range);
    fireEvent.keyUp(range, { key: 'Tab' });
    expect(onChange).not.toHaveBeenCalled();
  });

  it('shows the value in an editable number box that commits', () => {
    const { onChange } = setup();
    const box = screen.getByRole('textbox', { name: 'Length value' }) as HTMLInputElement;
    expect(box.value).toBe('300');
    inputValue(box, '500');
    fireEvent.keyDown(box, { key: 'Enter' });
    expect(onChange).toHaveBeenLastCalledWith(500, false);
  });

  it('renders the description under the label when given', () => {
    render(<Slider id="d" label="Alpha" description="Opacity of each segment." value={0.1} min={0} max={1} step={0.01} onChange={() => {}} />);
    const range = screen.getByRole('slider', { name: 'Alpha' });
    expect(range.getAttribute('aria-describedby')).toBeTruthy();
    expect(document.getElementById(range.getAttribute('aria-describedby')!)!.textContent).toBe('Opacity of each segment.');
  });
});

describe('NumberInput', () => {
  const setup = (props: Partial<Parameters<typeof NumberInput>[0]> = {}) => {
    const onChange = vi.fn();
    render(<NumberInput id="n" label="Speed" value={1.6} min={0.5} max={4} step={0.05} onChange={onChange} {...props} />);
    return { onChange, box: screen.getByRole('textbox', { name: 'Speed' }) as HTMLInputElement };
  };

  it('is a text box (no spinner) with numeric input mode, showing step precision', () => {
    const { box } = setup();
    expect(box.type).toBe('text');
    expect(box.inputMode).toBe('decimal');
    expect(box.value).toBe('1.60');
  });

  it('Enter commits the typed value', () => {
    const { onChange, box } = setup();
    inputValue(box, '2.5');
    fireEvent.keyDown(box, { key: 'Enter' });
    expect(onChange).toHaveBeenCalledExactlyOnceWith(2.5, false);
  });

  it('blur commits', () => {
    const { onChange, box } = setup();
    inputValue(box, '3');
    fireEvent.blur(box);
    expect(onChange).toHaveBeenCalledExactlyOnceWith(3, false);
  });

  it('clamps to the bounds', () => {
    const { onChange, box } = setup();
    inputValue(box, '99');
    fireEvent.keyDown(box, { key: 'Enter' });
    expect(onChange).toHaveBeenLastCalledWith(4, false);
    inputValue(box, '-3');
    fireEvent.keyDown(box, { key: 'Enter' });
    expect(onChange).toHaveBeenLastCalledWith(0.5, false);
  });

  it('rounds integers', () => {
    const onChange = vi.fn();
    render(<NumberInput id="i" label="Birds" value={600} min={100} max={1500} step={1} integer onChange={onChange} />);
    const box = screen.getByRole('textbox', { name: 'Birds' }) as HTMLInputElement;
    inputValue(box, '612.7');
    fireEvent.keyDown(box, { key: 'Enter' });
    expect(onChange).toHaveBeenCalledExactlyOnceWith(613, false);
  });

  it('Escape reverts the draft without committing', () => {
    const { onChange, box } = setup();
    inputValue(box, '3.3');
    fireEvent.keyDown(box, { key: 'Escape' });
    expect(box.value).toBe('1.60');
    fireEvent.blur(box);
    expect(onChange).not.toHaveBeenCalled();
  });

  it('ignores empty or non-numeric input and restores the value', () => {
    const { onChange, box } = setup();
    inputValue(box, 'abc');
    fireEvent.keyDown(box, { key: 'Enter' });
    expect(onChange).not.toHaveBeenCalled();
    expect(box.value).toBe('1.60');
  });

  it('an unchanged value commits nothing', () => {
    const { onChange, box } = setup();
    fireEvent.keyDown(box, { key: 'Enter' });
    fireEvent.blur(box);
    expect(onChange).not.toHaveBeenCalled();
  });

  it('follows a new value from outside (same instance, re-rendered)', () => {
    const props = { id: 'n', label: 'Speed', min: 0.5, max: 4, step: 0.05, onChange: () => {} };
    const { rerender } = render(<NumberInput {...props} value={1.6} />);
    const box = screen.getByRole('textbox', { name: 'Speed' }) as HTMLInputElement;
    expect(box.value).toBe('1.60');
    rerender(<NumberInput {...props} value={2} />);
    expect(screen.getByRole('textbox', { name: 'Speed' })).toBe(box); // not remounted
    expect(box.value).toBe('2.00');
  });
});

describe('Toggle', () => {
  function Harness({ onChange }: { onChange(v: boolean, live?: boolean): void }) {
    const [on, setOn] = useState(true);
    return (
      <Toggle
        id="t"
        label="Fade in"
        value={on}
        onChange={(v, live) => {
          setOn(v);
          onChange(v, live);
        }}
      />
    );
  }

  it('is a switch with aria-checked', () => {
    render(<Harness onChange={() => {}} />);
    const sw = screen.getByRole('switch', { name: 'Fade in' });
    expect(sw.tagName).toBe('BUTTON');
    expect(sw.getAttribute('aria-checked')).toBe('true');
  });

  it('flips on click', () => {
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);
    const sw = screen.getByRole('switch', { name: 'Fade in' });
    fireEvent.click(sw);
    expect(onChange).toHaveBeenLastCalledWith(false, false);
    expect(sw.getAttribute('aria-checked')).toBe('false');
  });

  it('flips with Space and with Enter, once each', () => {
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);
    const sw = screen.getByRole('switch', { name: 'Fade in' });
    fireEvent.keyDown(sw, { key: ' ' });
    fireEvent.keyUp(sw, { key: ' ' });
    expect(sw.getAttribute('aria-checked')).toBe('false');
    fireEvent.keyDown(sw, { key: 'Enter' });
    expect(sw.getAttribute('aria-checked')).toBe('true');
    expect(onChange).toHaveBeenCalledTimes(2);
  });
});

describe('ColorSwatch', () => {
  it('wraps a labelled colour input and shows the hex', () => {
    render(<ColorSwatch id="c" label="Background" value="#0f1117" onChange={() => {}} />);
    const input = screen.getByLabelText('Background') as HTMLInputElement;
    expect(input.type).toBe('color');
    expect(input.value).toBe('#0f1117');
    expect(screen.getByText('#0f1117')).toBeTruthy();
  });

  it('draws live while picking and commits on change', () => {
    const onChange = vi.fn();
    render(<ColorSwatch id="c" label="Background" value="#0f1117" onChange={onChange} />);
    const input = screen.getByLabelText('Background') as HTMLInputElement;
    inputValue(input, '#ff0000');
    input.dispatchEvent(new Event('change', { bubbles: true }));
    expect(onChange.mock.calls).toEqual([
      ['#ff0000', true],
      ['#ff0000', false],
    ]);
  });

  it('can hide the hex text (palette swatches)', () => {
    render(<ColorSwatch id="c" label="Color 1" value="#abcdef" hideHex onChange={() => {}} />);
    expect(screen.queryByText('#abcdef')).toBeNull();
  });
});

describe('Segmented', () => {
  function Harness({ options, onChange }: { options: string[]; onChange(v: string): void }) {
    const [v, setV] = useState(options[0]);
    return (
      <Segmented
        id="m"
        label="Mode"
        value={v}
        options={options}
        onChange={(x) => {
          setV(x);
          onChange(x);
        }}
      />
    );
  }

  it('is a radiogroup with the selection checked and only it tabbable', () => {
    render(<Harness options={['lines', 'dots']} onChange={() => {}} />);
    expect(screen.getByRole('radiogroup', { name: 'Mode' })).toBeTruthy();
    const lines = screen.getByRole('radio', { name: 'lines' });
    const dots = screen.getByRole('radio', { name: 'dots' });
    expect(lines.getAttribute('aria-checked')).toBe('true');
    expect(dots.getAttribute('aria-checked')).toBe('false');
    expect(lines.tabIndex).toBe(0);
    expect(dots.tabIndex).toBe(-1);
  });

  it('click selects', () => {
    const onChange = vi.fn();
    render(<Harness options={['lines', 'dots']} onChange={onChange} />);
    fireEvent.click(screen.getByRole('radio', { name: 'dots' }));
    expect(onChange).toHaveBeenCalledExactlyOnceWith('dots');
  });

  it('arrow keys move the selection and focus, wrapping', () => {
    const onChange = vi.fn();
    render(<Harness options={['a', 'b', 'c']} onChange={onChange} />);
    const a = screen.getByRole('radio', { name: 'a' });
    a.focus();
    fireEvent.keyDown(a, { key: 'ArrowRight' });
    expect(onChange).toHaveBeenLastCalledWith('b');
    expect(document.activeElement).toBe(screen.getByRole('radio', { name: 'b' }));
    fireEvent.keyDown(document.activeElement!, { key: 'ArrowDown' });
    expect(onChange).toHaveBeenLastCalledWith('c');
    fireEvent.keyDown(document.activeElement!, { key: 'ArrowRight' });
    expect(onChange).toHaveBeenLastCalledWith('a');
    fireEvent.keyDown(document.activeElement!, { key: 'ArrowLeft' });
    expect(onChange).toHaveBeenLastCalledWith('c');
  });

  it('uses a native select for more than four options', () => {
    const onChange = vi.fn();
    render(<Segmented id="m" label="Shape" value="a" options={['a', 'b', 'c', 'd', 'e']} onChange={onChange} />);
    expect(screen.queryByRole('radiogroup')).toBeNull();
    const select = screen.getByRole('combobox', { name: 'Shape' }) as HTMLSelectElement;
    fireEvent.change(select, { target: { value: 'd' } });
    expect(onChange).toHaveBeenCalledExactlyOnceWith('d', false);
  });
});

describe('Chips', () => {
  it('toggles chips with aria-pressed, keeping option order', () => {
    const onChange = vi.fn();
    render(<Chips id="k" label="Shapes" value={['c']} options={['a', 'b', 'c']} onChange={onChange} />);
    expect(screen.getByRole('group', { name: 'Shapes' })).toBeTruthy();
    const a = screen.getByRole('button', { name: 'a' });
    expect(a.getAttribute('aria-pressed')).toBe('false');
    expect(screen.getByRole('button', { name: 'c' }).getAttribute('aria-pressed')).toBe('true');
    fireEvent.click(a);
    expect(onChange).toHaveBeenCalledExactlyOnceWith(['a', 'c'], false);
  });

  it('deselects a chip', () => {
    const onChange = vi.fn();
    render(<Chips id="k" label="Shapes" value={['a', 'c']} options={['a', 'b', 'c']} onChange={onChange} />);
    fireEvent.click(screen.getByRole('button', { name: 'a' }));
    expect(onChange).toHaveBeenCalledExactlyOnceWith(['c'], false);
  });

  it('cannot go below minSelected: the last chips are disabled with an explanation', () => {
    const onChange = vi.fn();
    render(<Chips id="k" label="Shapes" value={['b']} options={['a', 'b', 'c']} minSelected={1} onChange={onChange} />);
    const b = screen.getByRole('button', { name: 'b' });
    expect(b.getAttribute('aria-disabled')).toBe('true');
    expect(b.title).toBe('At least 1 must stay selected');
    fireEvent.click(b);
    expect(onChange).not.toHaveBeenCalled();
    // Unselected chips stay enabled.
    expect(screen.getByRole('button', { name: 'a' }).getAttribute('aria-disabled')).toBeNull();
  });
});

describe('PaletteEditor', () => {
  const PRESETS = [
    ['#111111', '#222222', '#333333', '#444444', '#555555'],
    ['#aa0000', '#bb0000', '#cc0000', '#dd0000', '#ee0000'],
  ];

  function Harness(props: { initial: string[]; min?: number; max?: number; onChange?(c: string[], live?: boolean): void }) {
    const [colors, setColors] = useState(props.initial);
    return (
      <PaletteEditor
        id="p"
        label="Palette"
        value={colors}
        presets={PRESETS}
        minColors={props.min}
        maxColors={props.max}
        onChange={(c, live) => {
          setColors(c);
          props.onChange?.(c, live);
        }}
      />
    );
  }

  it('renders one swatch per colour', () => {
    render(<Harness initial={PRESETS[0]} />);
    for (let i = 1; i <= 5; i++) expect(screen.getByLabelText(`Color ${i}`)).toBeTruthy();
  });

  it('presets are a radio group; the matching one is checked; clicking one sets the palette', () => {
    const onChange = vi.fn();
    render(<Harness initial={PRESETS[0]} onChange={onChange} />);
    expect(screen.getByRole('radiogroup', { name: 'Palette presets' })).toBeTruthy();
    const p1 = screen.getByRole('radio', { name: 'Preset 1' });
    const p2 = screen.getByRole('radio', { name: 'Preset 2' });
    expect(p1.getAttribute('aria-checked')).toBe('true');
    fireEvent.click(p2);
    expect(onChange).toHaveBeenCalledExactlyOnceWith(PRESETS[1], false);
    expect(p2.getAttribute('aria-checked')).toBe('true');
    expect((screen.getByLabelText('Color 1') as HTMLInputElement).value).toBe('#aa0000');
  });

  it('arrow keys move between presets', () => {
    const onChange = vi.fn();
    render(<Harness initial={PRESETS[0]} onChange={onChange} />);
    const p1 = screen.getByRole('radio', { name: 'Preset 1' });
    p1.focus();
    fireEvent.keyDown(p1, { key: 'ArrowRight' });
    expect(onChange).toHaveBeenLastCalledWith(PRESETS[1], false);
    expect(document.activeElement).toBe(screen.getByRole('radio', { name: 'Preset 2' }));
  });

  it('editing a swatch replaces that colour (live while picking)', () => {
    const onChange = vi.fn();
    render(<Harness initial={PRESETS[0]} onChange={onChange} />);
    inputValue(screen.getByLabelText('Color 2'), '#ffffff');
    expect(onChange).toHaveBeenLastCalledWith(['#111111', '#ffffff', '#333333', '#444444', '#555555'], true);
  });

  it('adds up to maxColors', () => {
    const onChange = vi.fn();
    render(<Harness initial={['#111111', '#222222', '#333333']} min={2} max={4} onChange={onChange} />);
    const add = screen.getByRole('button', { name: 'Add color' }) as HTMLButtonElement;
    fireEvent.click(add);
    expect(onChange).toHaveBeenLastCalledWith(['#111111', '#222222', '#333333', '#333333'], false);
    expect(add.disabled).toBe(true);
    fireEvent.click(add);
    expect(onChange).toHaveBeenCalledTimes(1);
  });

  it('removes any colour with its own control, down to minColors', () => {
    const onChange = vi.fn();
    render(<Harness initial={['#111111', '#222222', '#333333', '#444444']} min={2} max={5} onChange={onChange} />);
    expect(screen.getAllByRole('button', { name: /^Remove color \d$/ })).toHaveLength(4);
    fireEvent.click(screen.getByRole('button', { name: 'Remove color 2' })); // a middle one
    expect(onChange).toHaveBeenLastCalledWith(['#111111', '#333333', '#444444'], false);
    expect((screen.getByLabelText('Color 2') as HTMLInputElement).value).toBe('#333333');
    fireEvent.click(screen.getByRole('button', { name: 'Remove color 1' })); // the first
    expect(onChange).toHaveBeenLastCalledWith(['#333333', '#444444'], false);
    // At minColors: no remove controls left.
    expect(screen.queryByRole('button', { name: /^Remove color/ })).toBeNull();
    expect(onChange).toHaveBeenCalledTimes(2);
  });

  it('remove controls are keyboard reachable and focus stays in the palette after a removal', () => {
    const onChange = vi.fn();
    render(<Harness initial={['#111111', '#222222', '#333333', '#444444']} min={2} max={5} onChange={onChange} />);
    const remove3 = screen.getByRole('button', { name: 'Remove color 3' }) as HTMLButtonElement;
    expect(remove3.tagName).toBe('BUTTON');
    expect(remove3.tabIndex).toBe(0);
    remove3.focus();
    fireEvent.click(remove3); // Enter/Space on a focused <button> clicks it
    expect(onChange).toHaveBeenLastCalledWith(['#111111', '#222222', '#444444'], false);
    // The colour that moved into slot 3 now owns the focused control.
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Remove color 3' }));
    fireEvent.click(document.activeElement as HTMLElement);
    expect(onChange).toHaveBeenLastCalledWith(['#111111', '#222222'], false);
    // At minColors the controls are gone: focus falls back to a swatch, not the page.
    expect(document.activeElement).toBe(screen.getByLabelText('Color 2'));
  });

  it('hides add/remove when the size is fixed', () => {
    render(<Harness initial={PRESETS[0]} min={5} max={5} />);
    expect(screen.queryByRole('button', { name: 'Add color' })).toBeNull();
    expect(screen.queryByRole('button', { name: /^Remove color/ })).toBeNull();
  });
});
