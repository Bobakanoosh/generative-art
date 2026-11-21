// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import type { ParamSchema } from '@/lib/piece/types';
import ParamPanel from './ParamPanel';

afterEach(cleanup);

const schema: ParamSchema = {
  count: { kind: 'integer', default: 10, min: 1, max: 20, label: 'Count', description: 'How many.', group: 'Shape' },
  size: { kind: 'number', default: 0.5, min: 0, max: 1, step: 0.1, label: 'Size', group: 'Shape' },
  on: { kind: 'boolean', default: true, label: 'Enabled', group: 'Style' },
  bg: { kind: 'color', default: '#000000', label: 'Background', group: 'Color' },
  pal: { kind: 'palette', default: ['#111111', '#222222'], minColors: 2, maxColors: 3, label: 'Palette', group: 'Color' },
  mode: { kind: 'select', default: 'a', options: ['a', 'b'], label: 'Mode', group: 'Style' },
  tags: { kind: 'multiselect', default: ['x'], options: ['x', 'y'], minSelected: 1, label: 'Tags' },
};
const params = { count: 10, size: 0.5, on: true, bg: '#000000', pal: ['#111111', '#222222'], mode: 'a', tags: ['x'] };

function setup() {
  const onChange = vi.fn();
  render(<ParamPanel schema={schema} params={params} onChange={onChange} />);
  return onChange;
}

describe('ParamPanel', () => {
  it('groups controls in first-appearance order under labelled groups', () => {
    setup();
    const groups = screen.getAllByRole('group').filter((g) => g.hasAttribute('data-param-group'));
    const names = groups.map((g) => document.getElementById(g.getAttribute('aria-labelledby')!)!.textContent);
    expect(names).toEqual(['Shape', 'Style', 'Color', 'General']);
    for (const name of names) expect(screen.getByRole('group', { name: name! })).toBeTruthy();
    expect(within(groups[0]).getByRole('slider', { name: 'Count' })).toBeTruthy();
    expect(within(groups[1]).getByRole('switch', { name: 'Enabled' })).toBeTruthy();
    expect(within(groups[3]).getByRole('group', { name: 'Tags' })).toBeTruthy();
  });

  it('group headings use ui-label colour (--muted), not a fainter override, for contrast', () => {
    setup();
    for (const g of screen.getAllByRole('group').filter((el) => el.hasAttribute('data-param-group'))) {
      const heading = document.getElementById(g.getAttribute('aria-labelledby')!)!;
      expect(heading.classList.contains('ui-label')).toBe(true);
      expect(heading.className).not.toMatch(/text-/);
    }
  });

  it('maps each kind to its control', () => {
    setup();
    expect(screen.getByRole('slider', { name: 'Size' })).toBeTruthy();
    expect(screen.getByRole('textbox', { name: 'Size value' })).toBeTruthy();
    expect((screen.getByLabelText('Background') as HTMLInputElement).type).toBe('color');
    expect(screen.getByRole('radiogroup', { name: 'Mode' })).toBeTruthy();
    expect(screen.getByLabelText('Color 1')).toBeTruthy();
    expect(screen.getByText('How many.')).toBeTruthy();
  });

  it('reports changes as (key, value, live)', () => {
    const onChange = setup();
    const count = screen.getByRole('slider', { name: 'Count' });
    fireEvent.input(count, { target: { value: '12' } });
    fireEvent.pointerUp(count);
    expect(onChange.mock.calls).toEqual([
      ['count', 12, true],
      ['count', 12, false],
    ]);
    onChange.mockClear();
    fireEvent.click(screen.getByRole('switch', { name: 'Enabled' }));
    expect(onChange).toHaveBeenLastCalledWith('on', false, false);
    fireEvent.click(screen.getByRole('radio', { name: 'b' }));
    expect(onChange).toHaveBeenLastCalledWith('mode', 'b', false);
    fireEvent.click(screen.getByRole('button', { name: 'y' }));
    expect(onChange).toHaveBeenLastCalledWith('tags', ['x', 'y'], false);
    fireEvent.click(screen.getByRole('button', { name: 'Add color' }));
    expect(onChange).toHaveBeenLastCalledWith('pal', ['#111111', '#222222', '#222222'], false);
  });

  it('integer sliders step by 1; number sliders use the schema step', () => {
    setup();
    expect((screen.getByRole('slider', { name: 'Count' }) as HTMLInputElement).step).toBe('1');
    expect((screen.getByRole('slider', { name: 'Size' }) as HTMLInputElement).step).toBe('0.1');
  });
});
