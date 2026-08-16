import { describe, expect, it } from 'vitest';
import { buildListEmbed, formatTable, formatTickGap, formatTicks, truncate } from './helpers.js';

describe('formatTicks', () => {
  it('formats sub-minute times', () => {
    // 2893 ticks / 64 = 45.203125 s
    expect(formatTicks(2893)).toBe('0:45.203');
  });

  it('formats minute times', () => {
    // 4480 ticks = 70 s
    expect(formatTicks(4480)).toBe('1:10.000');
  });

  it('formats hour times with padded minutes', () => {
    // 1 h 2 min 3.5 s = 3723.5 s = 238304 ticks
    expect(formatTicks(238304)).toBe('1:02:03.500');
  });

  it('formats zero', () => {
    expect(formatTicks(0)).toBe('0:00.000');
  });
});

describe('formatTickGap', () => {
  it('drops the minutes for gaps under a minute', () => {
    // 77 ticks = 1.203125 s
    expect(formatTickGap(77)).toBe('+1.203');
  });

  it('keeps the clock format for gaps of a minute or more', () => {
    // 4161 ticks = 65.015625 s
    expect(formatTickGap(4161)).toBe('+1:05.016');
  });

  it('formats a zero gap', () => {
    expect(formatTickGap(0)).toBe('+0.000');
  });
});

describe('truncate', () => {
  it('keeps short values unchanged', () => {
    expect(truncate('surf_utopia', 20)).toBe('surf_utopia');
  });

  it('cuts long values with an ellipsis at the requested width', () => {
    expect(truncate('surf_verylongmapname', 10)).toBe('surf_very…');
    expect(truncate('surf_verylongmapname', 10)).toHaveLength(10);
  });
});

describe('formatTable', () => {
  it('aligns columns by the widest cell including the header', () => {
    const lines = formatTable(
      [{ header: 'Map' }, { header: 'Points', align: 'right' }],
      [
        ['surf_utopia', '50'],
        ['surf_1', '123'],
      ],
    );
    expect(lines).toEqual(['Map          Points', 'surf_utopia      50', 'surf_1          123']);
  });

  it('renders an empty header cell as padding only', () => {
    const lines = formatTable(
      [{ header: '', align: 'right' }, { header: 'Player' }],
      [['#1', 'alice']],
    );
    expect(lines).toEqual(['    Player', '#1  alice']);
  });
});

describe('buildListEmbed', () => {
  it('wraps lines in a code block by default', () => {
    const embed = buildListEmbed({ title: 'Test', lines: ['a', 'b'] });
    expect(embed.data.description).toBe('```\na\nb\n```');
    expect(embed.data.title).toBe('Test');
  });

  it('supports plain markdown lines', () => {
    const embed = buildListEmbed({ title: 'Test', lines: ['**a**'], codeBlock: false });
    expect(embed.data.description).toBe('**a**');
  });

  it('sets the footer when given', () => {
    const embed = buildListEmbed({ title: 'Test', lines: ['a'], footer: 'note' });
    expect(embed.data.footer?.text).toBe('note');
  });

  it('summarizes lines that would exceed the description limit', () => {
    const lines = Array.from({ length: 100 }, (_, i) => `line-${i}`.padEnd(100, 'x'));
    const embed = buildListEmbed({ title: 'Test', lines });
    const description = embed.data.description ?? '';
    expect(description.length).toBeLessThanOrEqual(4096);
    expect(description).toMatch(/… and \d+ more/);
  });

  it('keeps all lines when they fit', () => {
    const lines = Array.from({ length: 25 }, (_, i) => `line-${i}`);
    const embed = buildListEmbed({ title: 'Test', lines });
    expect(embed.data.description).toContain('line-24');
    expect(embed.data.description).not.toContain('more');
  });
});
