import { describe, expect, it } from 'vitest';
import { HISTORY_LIMIT, MERGE_WINDOW_MS, pushEntry, type Entry } from '../src/model/history';
import type { Graph } from '../src/model/types';

const id = (g: Graph) => g;

function entry(at: number, mergeKey?: string, tag = 'x'): Entry {
  return { label: tag, mergeKey, at, run: id, revert: id };
}

describe('历史合并', () => {
  it('同 mergeKey 且在窗口内合并：保留最早 revert、采用最新 run', () => {
    const first = entry(1000, 'prop:a:name');
    const second = entry(1300, 'prop:a:name');
    const list = pushEntry(pushEntry([], first), second);
    expect(list).toHaveLength(1);
    expect(list[0].revert).toBe(first.revert);
    expect(list[0].run).toBe(second.run);
  });

  it('超过 500ms 不合并', () => {
    const first = entry(1000, 'prop:a:name');
    const second = entry(1000 + MERGE_WINDOW_MS + 1, 'prop:a:name');
    expect(pushEntry(pushEntry([], first), second)).toHaveLength(2);
  });

  it('不同 mergeKey 不合并', () => {
    const first = entry(1000, 'prop:a:name');
    const second = entry(1100, 'prop:a:value');
    expect(pushEntry(pushEntry([], first), second)).toHaveLength(2);
  });

  it('没有 mergeKey 的条目永不合并', () => {
    expect(pushEntry(pushEntry([], entry(1000)), entry(1001))).toHaveLength(2);
  });

  it('历史上限裁剪掉最老的条目', () => {
    let list: Entry[] = [];
    for (let i = 0; i < HISTORY_LIMIT + 5; i += 1) list = pushEntry(list, entry(i));
    expect(list).toHaveLength(HISTORY_LIMIT);
    expect(list[0].at).toBe(5);
    expect(list[list.length - 1].at).toBe(HISTORY_LIMIT + 4);
  });
});
