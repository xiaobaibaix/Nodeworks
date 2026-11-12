import {
  baseName, joinPath, normalizePath, parentPath, type DirEntry, type ProjectFS,
} from './types';

type FileData = string | Uint8Array;

/**
 * 内存实现：单测与「导出前预览」用。
 * 目录是隐式存在的——只要有文件落在某个前缀下，就认为该目录存在。
 */
export class MemoryFS implements ProjectFS {
  readonly files = new Map<string, FileData>();
  private readonly dirs = new Set<string>();

  async readText(path: string): Promise<string | null> {
    const data = this.files.get(normalizePath(path));
    if (data === undefined) return null;
    return typeof data === 'string' ? data : new TextDecoder().decode(data);
  }

  async writeText(path: string, text: string): Promise<void> {
    const key = normalizePath(path);
    this.files.set(key, text);
    this.markParents(key);
  }

  async readBytes(path: string): Promise<Uint8Array | null> {
    const data = this.files.get(normalizePath(path));
    if (data === undefined) return null;
    return typeof data === 'string' ? new TextEncoder().encode(data) : data;
  }

  async writeBytes(path: string, bytes: Uint8Array): Promise<void> {
    const key = normalizePath(path);
    this.files.set(key, bytes);
    this.markParents(key);
  }

  async list(path: string): Promise<DirEntry[]> {
    const dir = normalizePath(path);
    const prefix = dir ? `${dir}/` : '';
    const entries = new Map<string, DirEntry>();
    for (const key of this.files.keys()) {
      if (!key.startsWith(prefix)) continue;
      const rest = key.slice(prefix.length);
      const [head, ...tail] = rest.split('/');
      if (!head) continue;
      entries.set(head, { name: head, kind: tail.length ? 'directory' : 'file' });
    }
    for (const key of this.dirs) {
      if (!key.startsWith(prefix)) continue;
      const rest = key.slice(prefix.length);
      if (!rest) continue;
      const [head, ...tail] = rest.split('/');
      if (!head) continue;
      const entry = entries.get(head);
      if (!entry || tail.length) entries.set(head, { name: head, kind: 'directory' });
    }
    return [...entries.values()].sort((a, b) => a.name.localeCompare(b.name));
  }

  async remove(path: string): Promise<void> {
    const key = normalizePath(path);
    this.files.delete(key);
    this.dirs.delete(key);
    for (const file of [...this.files.keys()]) {
      if (file.startsWith(`${key}/`)) this.files.delete(file);
    }
    for (const dir of [...this.dirs]) {
      if (dir.startsWith(`${key}/`)) this.dirs.delete(dir);
    }
  }

  async exists(path: string): Promise<boolean> {
    const key = normalizePath(path);
    if (this.files.has(key) || this.dirs.has(key)) return true;
    const prefix = `${key}/`;
    for (const file of this.files.keys()) if (file.startsWith(prefix)) return true;
    return false;
  }

  private markParents(path: string): void {
    let dir = parentPath(path);
    while (dir) {
      this.dirs.add(dir);
      dir = parentPath(dir);
    }
  }
}

/** 测试/诊断用：把项目目录打印成按路径排序的 JSON 快照。 */
export async function dumpFS(fs: ProjectFS, root = ''): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  const walk = async (dir: string): Promise<void> => {
    for (const entry of await fs.list(dir)) {
      const path = joinPath(dir, entry.name);
      if (entry.kind === 'directory') await walk(path);
      else out[path] = (await fs.readText(path)) ?? '';
    }
  };
  await walk(root);
  return out;
}

export { baseName };
