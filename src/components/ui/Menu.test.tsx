// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { Menu, type MenuItem } from './Menu';

afterEach(cleanup);

function setup(overrides: Partial<{ items: MenuItem[]; disabled: boolean }> = {}) {
  const pick = vi.fn();
  const go = vi.fn();
  const items: MenuItem[] = overrides.items ?? [
    { type: 'heading', label: 'Length' },
    { type: 'radio', label: '5 s', checked: false, onSelect: () => pick('5'), keepOpen: true },
    { type: 'radio', label: '10 s', checked: true, onSelect: () => pick('10'), keepOpen: true },
    { type: 'action', label: 'Record MP4', onSelect: () => go('mp4') },
    { type: 'action', label: 'Record GIF', onSelect: () => go('gif'), disabled: true },
  ];
  render(
    <>
      <Menu label="Record a clip" items={items} disabled={overrides.disabled}>
        Record
      </Menu>
      <button type="button">outside</button>
    </>,
  );
  const trigger = screen.getByRole('button', { name: 'Record a clip' });
  return { trigger, pick, go };
}

describe('Menu', () => {
  it('is a menu button: closed, then opens on click with focus on the checked item', () => {
    const { trigger } = setup();
    expect(trigger.getAttribute('aria-haspopup')).toBe('menu');
    expect(trigger.getAttribute('aria-expanded')).toBe('false');
    expect(screen.queryByRole('menu')).toBeNull();
    fireEvent.click(trigger);
    expect(trigger.getAttribute('aria-expanded')).toBe('true');
    const menu = screen.getByRole('menu');
    expect(trigger.getAttribute('aria-controls')).toBe(menu.id);
    const ten = screen.getByRole('menuitemradio', { name: '10 s' });
    expect(ten.getAttribute('aria-checked')).toBe('true');
    expect(document.activeElement).toBe(ten);
  });

  it('wraps each headed section in a group labelled by its heading; items before any heading stay ungrouped', () => {
    const { trigger } = setup({
      items: [
        { type: 'action', label: 'Loose', onSelect: () => {} },
        { type: 'heading', label: 'Length' },
        { type: 'radio', label: '5 s', checked: true, onSelect: () => {}, keepOpen: true },
        { type: 'heading', label: 'Format' },
        { type: 'action', label: 'Record GIF', onSelect: () => {} },
      ],
    });
    fireEvent.click(trigger);
    const menu = screen.getByRole('menu');
    const groups = within(menu).getAllByRole('group');
    expect(groups).toHaveLength(2);
    const names = groups.map((g) => document.getElementById(g.getAttribute('aria-labelledby')!)!.textContent);
    expect(names).toEqual(['Length', 'Format']);
    expect(within(groups[0]).getByRole('menuitemradio', { name: '5 s' })).toBeTruthy();
    expect(within(groups[1]).getByRole('menuitem', { name: 'Record GIF' })).toBeTruthy();
    expect(screen.getByRole('menuitem', { name: 'Loose' }).closest('[role="group"]')).toBeNull();
    // Arrow keys still move across groups.
    fireEvent.keyDown(menu, { key: 'ArrowDown' });
    expect(document.activeElement).toBe(screen.getByRole('menuitem', { name: 'Record GIF' }));
  });

  it('arrow keys, Home and End move between enabled items (wrapping, skipping disabled)', () => {
    const { trigger } = setup();
    fireEvent.click(trigger);
    const menu = screen.getByRole('menu');
    fireEvent.keyDown(menu, { key: 'ArrowDown' });
    expect(document.activeElement).toBe(screen.getByRole('menuitem', { name: 'Record MP4' }));
    fireEvent.keyDown(menu, { key: 'ArrowDown' }); // GIF is disabled: wraps to the first
    expect(document.activeElement).toBe(screen.getByRole('menuitemradio', { name: '5 s' }));
    fireEvent.keyDown(menu, { key: 'ArrowUp' });
    expect(document.activeElement).toBe(screen.getByRole('menuitem', { name: 'Record MP4' }));
    fireEvent.keyDown(menu, { key: 'Home' });
    expect(document.activeElement).toBe(screen.getByRole('menuitemradio', { name: '5 s' }));
    fireEvent.keyDown(menu, { key: 'End' });
    expect(document.activeElement).toBe(screen.getByRole('menuitem', { name: 'Record MP4' }));
  });

  it('a keepOpen radio selects and stays open; an action runs, closes and refocuses the trigger', () => {
    const { trigger, pick, go } = setup();
    fireEvent.click(trigger);
    fireEvent.click(screen.getByRole('menuitemradio', { name: '5 s' }));
    expect(pick).toHaveBeenCalledWith('5');
    expect(screen.getByRole('menu')).toBeTruthy();
    fireEvent.click(screen.getByRole('menuitem', { name: 'Record MP4' }));
    expect(go).toHaveBeenCalledWith('mp4');
    expect(screen.queryByRole('menu')).toBeNull();
    expect(document.activeElement).toBe(trigger);
  });

  it('a disabled item does nothing', () => {
    const { trigger, go } = setup();
    fireEvent.click(trigger);
    const gif = screen.getByRole('menuitem', { name: 'Record GIF' });
    expect(gif.getAttribute('aria-disabled')).toBe('true');
    fireEvent.click(gif);
    expect(go).not.toHaveBeenCalled();
    expect(screen.getByRole('menu')).toBeTruthy();
  });

  it('Escape closes and returns focus; a pointer down outside closes', () => {
    const { trigger } = setup();
    fireEvent.click(trigger);
    fireEvent.keyDown(screen.getByRole('menu'), { key: 'Escape' });
    expect(screen.queryByRole('menu')).toBeNull();
    expect(document.activeElement).toBe(trigger);
    fireEvent.click(trigger);
    fireEvent.pointerDown(screen.getByRole('button', { name: 'outside' }));
    expect(screen.queryByRole('menu')).toBeNull();
  });

  it('ArrowUp/ArrowDown on the trigger open it; a disabled trigger does not open', () => {
    const { trigger } = setup();
    fireEvent.keyDown(trigger, { key: 'ArrowUp' });
    expect(screen.getByRole('menu')).toBeTruthy();
    cleanup();
    const { trigger: off } = setup({ disabled: true });
    fireEvent.click(off);
    expect(screen.queryByRole('menu')).toBeNull();
  });
});
