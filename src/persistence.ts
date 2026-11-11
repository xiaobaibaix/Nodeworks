import { parseGraph } from './model/schema';
import type { Graph } from './model/types';

const KEY = 'nodeworks.graph.v1';

export function loadCached(): Graph | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    return parseGraph(JSON.parse(raw));
  } catch {
    return null;
  }
}

export function saveCached(g: Graph): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(g));
  } catch {
    // 配额满了就放弃缓存；文件保存仍然可用
  }
}

export function downloadJson(data: unknown, filename: string): void {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function downloadGraph(g: Graph): void {
  downloadJson(g, 'project.graph.json');
}

function readJsonFile(): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json,application/json';
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) {
        reject(new Error('没有选择文件'));
        return;
      }
      try {
        resolve(JSON.parse(await file.text()));
      } catch (error) {
        reject(error instanceof Error ? error : new Error(String(error)));
      }
    };
    input.click();
  });
}

export async function pickJsonFile(): Promise<unknown> {
  return readJsonFile();
}

export function pickGraphFile(): Promise<Graph> {
  return readJsonFile().then((raw) => parseGraph(raw));
}
