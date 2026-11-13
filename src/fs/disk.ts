import {
  baseName, normalizePath, parentPath, type DirEntry, type ProjectFS,
} from './types';

function notFound(error: unknown): boolean {
  return error instanceof DOMException && error.name === 'NotFoundError';
}

/** 名字被另一种类型占用（例如把目录当文件打开）也按“不存在”处理。 */
function wrongType(error: unknown): boolean {
  return (
    (error instanceof DOMException && (error.name === 'TypeMismatchError' || error.name === 'NotFoundError')) ||
    error instanceof TypeError
  );
}

/** 通过 File System Access API 读写用户选中的目录。 */
export class DiskFS implements ProjectFS {
  constructor(readonly root: FileSystemDirectoryHandle) {}

  async readText(path: string): Promise<string | null> {
    const bytes = await this.readBytes(path);
    return bytes ? new TextDecoder().decode(bytes) : null;
  }

  async writeText(path: string, text: string): Promise<void> {
    await this.writeBytes(path, new TextEncoder().encode(text));
  }

  async readBytes(path: string): Promise<Uint8Array | null> {
    try {
      const parent = await this.tryDir(parentPath(path));
      if (!parent) return null;
      const handle = await parent.getFileHandle(baseName(path));
      const file = await handle.getFile();
      return new Uint8Array(await file.arrayBuffer());
    } catch (error) {
      if (wrongType(error)) return null;
      throw error;
    }
  }

  async writeBytes(path: string, bytes: Uint8Array): Promise<void> {
    const key = normalizePath(path);
    const parent = await this.dir(parentPath(key), true);
    const handle = await parent.getFileHandle(baseName(key), { create: true });
    const writable = await handle.createWritable();
    await writable.write(bytes as unknown as BufferSource);
    await writable.close();
  }

  async list(path: string): Promise<DirEntry[]> {
    const handle = await this.dir(normalizePath(path));
    const entries: DirEntry[] = [];
    for await (const entry of handle.values()) {
      entries.push({ name: entry.name, kind: entry.kind });
    }
    return entries.sort((a, b) => a.name.localeCompare(b.name));
  }

  async remove(path: string): Promise<void> {
    const key = normalizePath(path);
    if (!key) return;
    const parent = await this.tryDir(parentPath(key));
    if (!parent) return;
    try {
      await parent.removeEntry(baseName(key), { recursive: true });
    } catch (error) {
      if (!notFound(error)) throw error;
    }
  }

  async exists(path: string): Promise<boolean> {
    const key = normalizePath(path);
    if (!key) return true;
    const parent = await this.tryDir(parentPath(key));
    if (!parent) return false;
    try {
      await parent.getFileHandle(baseName(key));
      return true;
    } catch (error) {
      if (!wrongType(error)) throw error;
    }
    try {
      await parent.getDirectoryHandle(baseName(key));
      return true;
    } catch (error) {
      if (!wrongType(error)) throw error;
      return false;
    }
  }

  private async tryDir(path: string): Promise<FileSystemDirectoryHandle | null> {
    let handle = this.root;
    for (const part of normalizePath(path).split('/').filter(Boolean)) {
      try {
        handle = await handle.getDirectoryHandle(part);
      } catch (error) {
        if (wrongType(error)) return null;
        throw error;
      }
    }
    return handle;
  }

  private async dir(path: string): Promise<FileSystemDirectoryHandle>;
  private async dir(path: string, create: true): Promise<FileSystemDirectoryHandle>;
  private async dir(path: string, create = false): Promise<FileSystemDirectoryHandle> {
    let handle = this.root;
    for (const part of normalizePath(path).split('/').filter(Boolean)) {
      try {
        handle = await handle.getDirectoryHandle(part, { create });
      } catch (error) {
        if (notFound(error)) throw new Error(`目录不存在：${path}`);
        throw error;
      }
    }
    return handle;
  }
}

export async function pickProjectDirectory(): Promise<DiskFS | null> {
  if (typeof window === 'undefined' || !window.showDirectoryPicker) return null;
  const handle = await window.showDirectoryPicker({ mode: 'readwrite' });
  return new DiskFS(handle);
}
