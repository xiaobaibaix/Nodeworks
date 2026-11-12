/** 文件系统抽象：目录项目读写只依赖这一层，测试用内存实现。 */

export interface DirEntry {
  name: string;
  kind: 'file' | 'directory';
}

export interface ProjectFS {
  readText(path: string): Promise<string | null>;
  writeText(path: string, text: string): Promise<void>;
  readBytes(path: string): Promise<Uint8Array | null>;
  writeBytes(path: string, bytes: Uint8Array): Promise<void>;
  list(path: string): Promise<DirEntry[]>;
  remove(path: string): Promise<void>;
  exists(path: string): Promise<boolean>;
}

export function normalizePath(path: string): string {
  return path
    .split('/')
    .filter((part) => part && part !== '.')
    .join('/');
}

export function joinPath(...parts: string[]): string {
  return normalizePath(parts.filter(Boolean).join('/'));
}

export function parentPath(path: string): string {
  const parts = normalizePath(path).split('/');
  parts.pop();
  return parts.join('/');
}

export function baseName(path: string): string {
  const parts = normalizePath(path).split('/');
  return parts[parts.length - 1] ?? '';
}

export function extName(path: string): string {
  const name = baseName(path);
  const dot = name.lastIndexOf('.');
  return dot > 0 ? name.slice(dot + 1).toLowerCase() : '';
}
