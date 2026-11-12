/** 把 Node 的 fs 适配成目录项目用的 ProjectFS（MCP 只走这一条路）。 */
import {
  existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync,
} from 'node:fs';
import { dirname, join } from 'node:path';
import { normalizePath, type DirEntry, type ProjectFS } from '../src/fs/types';

function missing(error: unknown): boolean {
  const code = (error as { code?: string }).code;
  return code === 'ENOENT' || code === 'ENOTDIR' || code === 'EISDIR';
}

export class NodeFS implements ProjectFS {
  constructor(private readonly root: string) {}

  private abs(path: string): string {
    return join(this.root, normalizePath(path));
  }

  async readText(path: string): Promise<string | null> {
    try {
      return readFileSync(this.abs(path), 'utf8');
    } catch (error) {
      if (missing(error)) return null;
      throw error;
    }
  }

  async writeText(path: string, text: string): Promise<void> {
    const target = this.abs(path);
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, text, 'utf8');
  }

  async readBytes(path: string): Promise<Uint8Array | null> {
    try {
      return new Uint8Array(readFileSync(this.abs(path)));
    } catch (error) {
      if (missing(error)) return null;
      throw error;
    }
  }

  async writeBytes(path: string, bytes: Uint8Array): Promise<void> {
    const target = this.abs(path);
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, bytes);
  }

  async list(path: string): Promise<DirEntry[]> {
    try {
      return readdirSync(this.abs(path), { withFileTypes: true })
        .map((entry) => ({ name: entry.name, kind: entry.isDirectory() ? 'directory' as const : 'file' as const }))
        .sort((a, b) => a.name.localeCompare(b.name));
    } catch (error) {
      if (missing(error)) return [];
      throw error;
    }
  }

  async remove(path: string): Promise<void> {
    rmSync(this.abs(path), { recursive: true, force: true });
  }

  async exists(path: string): Promise<boolean> {
    try {
      statSync(this.abs(path));
      return true;
    } catch {
      return false;
    }
  }
}

export function isDirectory(path: string): boolean {
  try {
    return statSync(path).isDirectory();
  } catch {
    return existsSync(path) && false;
  }
}
