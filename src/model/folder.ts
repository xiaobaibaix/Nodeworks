import type { ProjectDoc, ProjectGraph } from './project';
import { graphLevelLabel, parseProjectDoc } from './project';
import { EMPTY_STYLE, normalizeStyle, type ProjectStyle } from './style';
import type { Graph, ResourceItem, UnitEdge, UnitNode } from './types';
import { baseName, extName, joinPath, type DirEntry, type ProjectFS } from '../fs/types';

export const PROJECT_FILE = 'project.json';
export const GRAPH_FILE = 'graph.json';
export const NODE_FILE = 'node.json';
export const NODES_DIR = 'nodes';
export const SUBGRAPH_DIR = 'subgraph';
export const RESOURCES_DIR = 'resources';

interface ProjectFile {
  version: 1;
  active: string;
  kinds: Graph['kinds'];
  graphs: { id: string; name: string; dir: string; level?: number; folderId?: string | null }[];
  folders?: { id: string; name: string; parentId: string | null }[];
  grouped?: boolean;
  /** 资源全局风格（图标/模型描述词的公共部分） */
  style?: ProjectStyle;
}

interface GraphFile {
  version: 1;
  id: string;
  name: string;
  nodeOrder: string[];
  edges: UnitEdge[];
}

/** 文件夹名里保留中文，只去掉文件系统不接受的字符；id 作为稳定后缀。 */
export function slugify(text: string, fallback = 'item'): string {
  const cleaned = text
    .trim()
    .replace(/[\\/:*?"<>|\u0000-\u001f]+/g, '-')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^[.-]+|[.-]+$/g, '')
    .slice(0, 40);
  return cleaned || fallback;
}

export function graphDirName(name: string, id: string): string {
  return `${slugify(name, 'graph')}__${id}`;
}

/** 图在 graphs/ 下的层级文件夹：一级矿 / 二级产物 / … / 其它。 */
export function graphLevelFolder(level?: number): string {
  return graphLevelLabel(level ?? 0);
}

function levelFromFolder(name: string): number {
  if (name === '其它') return 0;
  if (name === '一级矿') return 1;
  const m = /^(\d+)级产物$/.exec(name);
  return m ? Number(m[1]) : 0;
}

export function nodeDirName(node: Pick<UnitNode, 'id' | 'title'>): string {
  return `${slugify(node.title, 'node')}__${node.id}`;
}

function idFromDir(name: string): string {
  const at = name.lastIndexOf('__');
  return at >= 0 ? name.slice(at + 2) : name;
}

async function listDirs(fs: ProjectFS, path: string): Promise<DirEntry[]> {
  if (!(await fs.exists(path))) return [];
  return (await fs.list(path)).filter((entry) => entry.kind === 'directory');
}

export interface WriteOptions {
  /**
   * 读取资源字节并落进节点文件夹的 resources/。
   * 返回 null 表示这次拿不到，保留已有文件；不传则只写 JSON（快速自动同步）。
   */
  readResource?: (node: UnitNode, resource: ResourceItem) => Promise<Uint8Array | null>;
}

/** 节点文件夹内的资源文件名：id 前缀保证唯一，后缀保留扩展名。 */
export function resourceFileName(resource: ResourceItem): string {
  const source = resource.path || resource.label || 'file';
  const ext = extName(source);
  const stem = slugify(ext ? baseName(source).slice(0, -(ext.length + 1)) : baseName(source), 'file');
  return `${resource.id}-${stem}${ext ? `.${ext}` : ''}`;
}

/** 把整份项目写进目录；会清掉旧索引里已不存在的图/节点文件夹。 */
export async function writeProject(fs: ProjectFS, project: ProjectDoc, options: WriteOptions = {}): Promise<void> {
  const previous = await readProjectFile(fs);
  const expectedGraphDirs = new Set<string>();
  const index: ProjectFile['graphs'] = [];
  const kinds = project.graphs[0]?.graph.kinds ?? {};

  for (const pg of project.graphs) {
    const dir = joinPath(graphLevelFolder(pg.level), graphDirName(pg.name, pg.id));
    expectedGraphDirs.add(dir);
    index.push({ id: pg.id, name: pg.name, dir, level: pg.level ?? 0, folderId: pg.folderId ?? null });
    await writeGraphDir(fs, joinPath('graphs', dir), pg.graph, pg.id, pg.name, options);
  }

  const file: ProjectFile = {
    version: 1,
    active: project.active,
    kinds,
    graphs: index,
    folders: project.folders ?? [],
    grouped: project.grouped === true,
    style: project.style ?? EMPTY_STYLE,
  };
  await fs.writeText(PROJECT_FILE, `${JSON.stringify(file, null, 2)}\n`);

  for (const old of previous?.graphs ?? []) {
    if (!expectedGraphDirs.has(old.dir)) await fs.remove(joinPath('graphs', old.dir));
  }
}

async function writeGraphDir(
  fs: ProjectFS,
  dir: string,
  graph: Graph,
  id: string,
  name: string,
  options: WriteOptions,
): Promise<void> {
  const file: GraphFile = {
    version: 1,
    id,
    name,
    nodeOrder: graph.nodes.map((node) => node.id),
    edges: graph.edges,
  };
  await fs.writeText(joinPath(dir, GRAPH_FILE), `${JSON.stringify(file, null, 2)}\n`);

  const nodesDir = joinPath(dir, NODES_DIR);
  const expected = new Set<string>();
  for (const node of graph.nodes) {
    const nodeDir = nodeDirName(node);
    expected.add(nodeDir);
    await writeNodeDir(fs, joinPath(nodesDir, nodeDir), node, options);
  }

  for (const entry of await listDirs(fs, nodesDir)) {
    if (!expected.has(entry.name)) await fs.remove(joinPath(nodesDir, entry.name));
  }
}

async function writeNodeDir(
  fs: ProjectFS,
  dir: string,
  node: UnitNode,
  options: WriteOptions,
): Promise<void> {
  const { subgraph, ...rest } = node;
  const resources = node.resources?.map((resource) => structuredClone(resource));
  const used = new Set<string>();

  if (resources?.length) {
    // 顶层资源与它挂的视图都要写文件，清理时也都要算作「在用」
    const flattened: ResourceItem[] = [];
    const walk = (items: ResourceItem[]): void => {
      for (const item of items) {
        flattened.push(item);
        if (item.views?.length) walk(item.views);
      }
    };
    walk(resources);
    for (const resource of flattened) {
      const target = resource.file ?? joinPath(RESOURCES_DIR, resourceFileName(resource));
      if (options.readResource) {
        const bytes = await options.readResource(node, resource);
        if (bytes) {
          await fs.writeBytes(joinPath(dir, target), bytes);
          resource.file = target;
        }
      }
      if (resource.file) used.add(resource.file);
    }

    const resDir = joinPath(dir, RESOURCES_DIR);
    if (options.readResource && (await fs.exists(resDir))) {
      for (const entry of await fs.list(resDir)) {
        if (entry.kind === 'file' && !used.has(joinPath(RESOURCES_DIR, entry.name))) {
          await fs.remove(joinPath(resDir, entry.name));
        }
      }
    }
  }

  const file = { version: 1 as const, ...rest, ...(resources ? { resources } : {}) };
  await fs.writeText(joinPath(dir, NODE_FILE), `${JSON.stringify(file, null, 2)}\n`);
  if (subgraph) {
    await writeGraphDir(fs, joinPath(dir, SUBGRAPH_DIR), subgraph, node.id, node.title, options);
  } else {
    await fs.remove(joinPath(dir, SUBGRAPH_DIR));
  }
}

/** 从目录读回项目；节点/图的 id 以 JSON 为准，文件夹名只是给人看的。 */
export async function readProject(fs: ProjectFS): Promise<ProjectDoc> {
  const project = await readProjectFile(fs);
  if (!project) throw new Error(`不是目录项目：缺少 ${PROJECT_FILE}`);
  const kinds = project.kinds ?? {};

  const diskDirs = await listDirs(fs, 'graphs');
  const order: { id: string; name: string; dir: string; level?: number; folderId?: string | null }[] = [];
  const seen = new Set<string>();

  for (const entry of project.graphs) {
    if (seen.has(entry.dir)) continue;
    seen.add(entry.dir);
    if (await fs.exists(joinPath('graphs', entry.dir, GRAPH_FILE))) order.push(entry);
  }
  const discovered: string[] = [];
  for (const dir of diskDirs) {
    const first = dir.name;
    if (await fs.exists(joinPath('graphs', first, GRAPH_FILE))) {
      discovered.push(first);
      continue;
    }
    for (const nested of await listDirs(fs, joinPath('graphs', first))) {
      if (await fs.exists(joinPath('graphs', first, nested.name, GRAPH_FILE))) {
        discovered.push(joinPath(first, nested.name));
      }
    }
  }
  for (const dir of discovered) {
    if (seen.has(dir)) continue;
    if (await fs.exists(joinPath('graphs', dir, GRAPH_FILE))) {
      const base = dir.includes('/') ? baseName(dir) : dir;
      const folder = dir.includes('/') ? dir.slice(0, dir.indexOf('/')) : '';
      order.push({ id: idFromDir(base), name: '', dir, level: levelFromFolder(folder) });
    }
  }

  const graphs: ProjectGraph[] = [];
  for (const entry of order) {
    const read = await readGraphDir(fs, joinPath('graphs', entry.dir), kinds);
    if (!read) continue;
    graphs.push({
      id: entry.id || read.id,
      name: entry.name || read.name,
      graph: read.graph,
      level: typeof entry.level === 'number' ? entry.level : 0,
      folderId: typeof entry.folderId === 'string' ? entry.folderId : null,
    });
  }
  if (!graphs.length) throw new Error('目录项目里没有可读取的图');

  const active = graphs.some((pg) => pg.id === project.active) ? project.active : graphs[0].id;
  const parsed = parseProjectDoc({
    version: 1, active, graphs, folders: project.folders ?? [], grouped: project.grouped, style: project.style,
  });
  if (!parsed) {
    throw new Error(`目录项目校验失败：检查 ${NODE_FILE} / ${GRAPH_FILE} 里的端口与连线引用`);
  }
  return parsed;
}

async function readProjectFile(fs: ProjectFS): Promise<ProjectFile | null> {
  const text = await fs.readText(PROJECT_FILE);
  if (!text) return null;
  try {
    const raw = JSON.parse(text) as Partial<ProjectFile>;
    if (raw.version !== 1 || !Array.isArray(raw.graphs)) return null;
    return {
      version: 1,
      active: typeof raw.active === 'string' ? raw.active : '',
      kinds: raw.kinds && typeof raw.kinds === 'object' ? raw.kinds : {},
      style: normalizeStyle(raw.style),
      graphs: raw.graphs.filter(
        (entry): entry is ProjectFile['graphs'][number] =>
          !!entry && typeof entry.dir === 'string' && typeof entry.id === 'string',
      ),
      grouped: raw.grouped === true,
      folders: Array.isArray(raw.folders)
        ? raw.folders.filter(
          (f): f is { id: string; name: string; parentId: string | null } =>
            !!f && typeof f.id === 'string' && typeof f.name === 'string',
        ).map((f) => ({ id: f.id, name: f.name, parentId: typeof f.parentId === 'string' ? f.parentId : null }))
        : [],
    };
  } catch {
    return null;
  }
}

async function readGraphDir(
  fs: ProjectFS,
  dir: string,
  kinds: Graph['kinds'],
): Promise<{ id: string; name: string; graph: Graph } | null> {
  const text = await fs.readText(joinPath(dir, GRAPH_FILE));
  if (!text) return null;
  let raw: Partial<GraphFile>;
  try {
    raw = JSON.parse(text) as Partial<GraphFile>;
  } catch {
    throw new Error(`${joinPath(dir, GRAPH_FILE)} 不是合法 JSON`);
  }
  const nodesDir = joinPath(dir, NODES_DIR);
  const nodes: UnitNode[] = [];
  const rank = new Map((raw.nodeOrder ?? []).map((id, index) => [id, index]));

  for (const entry of await listDirs(fs, nodesDir)) {
    const nodeDir = joinPath(nodesDir, entry.name);
    const node = await readNodeDir(fs, nodeDir, entry.name, kinds);
    if (node) nodes.push(node);
  }
  nodes.sort((a, b) => {
    const ra = rank.get(a.id) ?? Number.MAX_SAFE_INTEGER;
    const rb = rank.get(b.id) ?? Number.MAX_SAFE_INTEGER;
    if (ra !== rb) return ra - rb;
    return a.title.localeCompare(b.title, 'zh-Hans-CN');
  });

  return {
    id: typeof raw.id === 'string' ? raw.id : idFromDir(dir.split('/').pop() ?? ''),
    name: typeof raw.name === 'string' ? raw.name : '',
    graph: {
      version: 1,
      kinds,
      nodes,
      edges: Array.isArray(raw.edges) ? raw.edges : [],
    },
  };
}

async function readNodeDir(
  fs: ProjectFS,
  dir: string,
  dirName: string,
  kinds: Graph['kinds'],
): Promise<UnitNode | null> {
  const text = await fs.readText(joinPath(dir, NODE_FILE));
  if (!text) return null;
  let raw: Partial<UnitNode>;
  try {
    raw = JSON.parse(text) as Partial<UnitNode>;
  } catch {
    throw new Error(`${joinPath(dir, NODE_FILE)} 不是合法 JSON`);
  }
  const id = typeof raw.id === 'string' && raw.id ? raw.id : idFromDir(dirName);
  const node: UnitNode = {
    id,
    title: typeof raw.title === 'string' ? raw.title : id,
    kind: raw.kind,
    props: raw.props ?? {},
    ports: raw.ports ?? [],
    pos: raw.pos ?? { x: 0, y: 0 },
    resources: raw.resources,
    linkGraph: raw.linkGraph,
    subgraphMap: raw.subgraphMap,
    boundaryPos: raw.boundaryPos,
  };

  const subDir = joinPath(dir, SUBGRAPH_DIR);
  if (await fs.exists(joinPath(subDir, GRAPH_FILE))) {
    const sub = await readGraphDir(fs, subDir, kinds);
    if (sub) node.subgraph = sub.graph;
  }
  return node;
}

export async function hasFolderProject(fs: ProjectFS): Promise<boolean> {
  return fs.exists(PROJECT_FILE);
}
