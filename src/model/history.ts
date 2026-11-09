import type { Graph } from './types';

export interface Entry {
  label: string;
  run: (g: Graph) => Graph;
  revert: (g: Graph) => Graph;
  /** 同一字段的连续编辑按此键合并，避免每敲一次回车产生一条历史 */
  mergeKey?: string;
  at: number;
}

export interface EntryInput {
  label: string;
  run: (g: Graph) => Graph;
  revert: (g: Graph) => Graph;
  mergeKey?: string;
}

export const HISTORY_LIMIT = 100;
export const MERGE_WINDOW_MS = 500;

/**
 * 追加一条历史。若与上一条同 mergeKey 且在 500ms 内，则合并：
 * 保留最早的 revert、采用最新的 run，一次撤销回到这一串编辑之前。
 */
export function pushEntry(past: Entry[], entry: Entry): Entry[] {
  const last = past[past.length - 1];
  if (
    entry.mergeKey &&
    last &&
    last.mergeKey === entry.mergeKey &&
    entry.at - last.at <= MERGE_WINDOW_MS
  ) {
    return [
      ...past.slice(0, -1),
      { ...entry, revert: last.revert },
    ].slice(-HISTORY_LIMIT);
  }
  return [...past, entry].slice(-HISTORY_LIMIT);
}
