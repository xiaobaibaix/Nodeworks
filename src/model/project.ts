import { emptyGraph } from './ops';
import { GraphSchema } from './schema';
import { EMPTY_STYLE, normalizeStyle, type ProjectStyle } from './style';
import type { Graph, KindDef } from './types';

export interface ProjectGraph {
  id: string;
  name: string;
  graph: Graph;
  /** 产物层级：1 = 一级原料，2 = 二级产物……0/缺省 = 未分层（机器、索引等）。 */
  level?: number;
  /** 所在分组（逻辑文件夹）；缺省按 level 归到默认分组。 */
  folderId?: string | null;
}

/** 图列表里的逻辑分组，可嵌套，类似文件夹。 */
export interface ProjectFolder {
  id: string;
  name: string;
  parentId: string | null;
}

/** 一个 project 管多张根图；图之间共享顶层 kinds（子图内部仍各存一份）。 */
export interface ProjectDoc {
  version: 1;
  active: string;
  graphs: ProjectGraph[];
  folders?: ProjectFolder[];
  /** 已启用分组（避免删空后被层级迁移重新建组） */
  grouped?: boolean;
  /** 资源全局风格：所有图标/模型的生成描述词都挂在它下面 */
  style?: ProjectStyle;
}

export const PROJECT_LIMIT = 200;

export function projectGraphId(): string {
  return `pg_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
}

export function mergeKinds(graphs: ProjectGraph[]): Record<string, KindDef> {
  const merged: Record<string, KindDef> = {};
  for (const pg of graphs) Object.assign(merged, pg.graph.kinds);
  return merged;
}

/** 所有图共用同一份 kinds：先并集，再回写到每张图。 */
export function unifyKinds(project: ProjectDoc): ProjectDoc {
  const merged = mergeKinds(project.graphs);
  return {
    ...project,
    graphs: project.graphs.map((pg) => ({ ...pg, graph: { ...pg.graph, kinds: merged } })),
  };
}

export function normalizeProject(project: ProjectDoc): ProjectDoc {
  const graphs = project.graphs
    .filter((pg) => pg && typeof pg.id === 'string' && pg.graph)
    .map((pg) => ({
      ...pg,
      name: pg.name || '未命名图',
      level: typeof pg.level === 'number' && Number.isFinite(pg.level) ? Math.max(0, Math.round(pg.level)) : 0,
    }));
  if (graphs.length === 0) {
    graphs.push({ id: projectGraphId(), name: '主图', graph: emptyGraph(), level: 0 });
  }
  graphs.sort((a, b) => {
    const la = a.level ?? 0;
    const lb = b.level ?? 0;
    return (la || 99) - (lb || 99) || a.name.localeCompare(b.name, 'zh');
  });

  const grouped = project.grouped === true || (project.folders?.length ?? 0) > 0;
  const folders: ProjectFolder[] = [];
  const seen = new Set<string>();
  for (const f of project.folders ?? []) {
    if (!f || typeof f.id !== 'string' || !f.id || seen.has(f.id)) continue;
    seen.add(f.id);
    folders.push({
      id: f.id,
      name: (typeof f.name === 'string' && f.name.trim()) || '未命名分组',
      parentId: typeof f.parentId === 'string' ? f.parentId : null,
    });
  }
  for (const f of folders) {
    if (f.parentId && !seen.has(f.parentId)) f.parentId = null;
  }
  for (const f of folders) {
    let cur = f.parentId;
    let guard = 0;
    while (cur && guard++ < folders.length) {
      if (cur === f.id) { f.parentId = null; break; }
      cur = folders.find((x) => x.id === cur)?.parentId ?? null;
    }
  }

  for (const pg of graphs) {
    const level = pg.level ?? 0;
    const has = pg.folderId && folders.some((f) => f.id === pg.folderId);
    if (!has) {
      if (!grouped) {
        const id = `f_lv_${level}`;
        if (!folders.some((f) => f.id === id)) {
          folders.push({ id, name: graphLevelLabel(level), parentId: null });
        }
        pg.folderId = id;
      } else {
        pg.folderId = null;
      }
    }
  }

  const active = graphs.some((pg) => pg.id === project.active) ? project.active : graphs[0].id;
  return unifyKinds({
    version: 1, active, graphs, folders, grouped: grouped || folders.length > 0,
    style: normalizeStyle(project.style),
  });
}

export function projectFromGraph(graph: Graph, name = '主图'): ProjectDoc {
  const id = projectGraphId();
  return { version: 1, active: id, graphs: [{ id, name, graph }], folders: [], style: { ...EMPTY_STYLE } };
}

/** 取项目风格；老项目没有这一段时给空风格。 */
export function projectStyle(project: ProjectDoc): ProjectStyle {
  return project.style ?? EMPTY_STYLE;
}

/** 把当前编辑中的图写回 project，并让共享 kinds 覆盖所有图。 */
export function syncActive(project: ProjectDoc, graph: Graph, active = project.active): ProjectDoc {
  const graphs = project.graphs.map((pg) => (pg.id === active ? { ...pg, graph } : pg));
  return unifyKinds({ ...project, active, graphs });
}

export function activeGraph(project: ProjectDoc): ProjectGraph {
  return project.graphs.find((pg) => pg.id === project.active) ?? project.graphs[0];
}

export function addGraph(project: ProjectDoc, name?: string, folderId?: string | null): { project: ProjectDoc; id: string } {
  if (project.graphs.length >= PROJECT_LIMIT) return { project, id: project.active };
  const id = projectGraphId();
  const kinds = mergeKinds(project.graphs);
  const graph: Graph = { ...emptyGraph(), kinds };
  const next = {
    ...project,
    active: id,
    graphs: [
      ...project.graphs,
      {
        id,
        name: name?.trim() || `图 ${project.graphs.length + 1}`,
        graph,
        level: project.graphs.find((pg) => pg.id === project.active)?.level ?? 1,
        folderId: folderId ?? project.graphs.find((pg) => pg.id === project.active)?.folderId ?? null,
      },
    ],
  };
  return { project: unifyKinds(next), id };
}

export function projectFolderId(): string {
  return `f_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
}

export function addFolder(
  project: ProjectDoc,
  name: string,
  parentId: string | null = null,
): { project: ProjectDoc; id: string } {
  const folders = project.folders ?? [];
  const id = projectFolderId();
  const parent = parentId && folders.some((f) => f.id === parentId) ? parentId : null;
  return {
    project: normalizeProject({
      ...project,
      folders: [...folders, { id, name: name.trim() || '新建分组', parentId: parent }],
      grouped: true,
    }),
    id,
  };
}

export function renameFolder(project: ProjectDoc, id: string, name: string): ProjectDoc {
  const trimmed = name.trim();
  if (!trimmed) return project;
  return normalizeProject({
    ...project,
    folders: (project.folders ?? []).map((f) => (f.id === id ? { ...f, name: trimmed } : f)),
  });
}

export function removeFolder(project: ProjectDoc, id: string): ProjectDoc {
  const folder = (project.folders ?? []).find((f) => f.id === id);
  if (!folder) return project;
  const parent = folder.parentId;
  const folders = (project.folders ?? [])
    .filter((f) => f.id !== id)
    .map((f) => (f.parentId === id ? { ...f, parentId: parent } : f));
  const graphs = project.graphs.map((pg) =>
    pg.folderId === id ? { ...pg, folderId: parent ?? null } : pg,
  );
  return normalizeProject({ ...project, folders, graphs, grouped: true });
}

export function moveGraphToFolder(project: ProjectDoc, graphId: string, folderId: string | null): ProjectDoc {
  return normalizeProject({
    grouped: true,
    ...project,
    graphs: project.graphs.map((pg) =>
      pg.id === graphId ? { ...pg, folderId } : pg,
    ),
  });
}

export function renameGraph(project: ProjectDoc, id: string, name: string): ProjectDoc {
  const trimmed = name.trim();
  if (!trimmed) return project;
  return {
    ...project,
    graphs: project.graphs.map((pg) => (pg.id === id ? { ...pg, name: trimmed } : pg)),
  };
}

export function removeGraph(project: ProjectDoc, id: string): ProjectDoc {
  if (project.graphs.length <= 1) return project;
  const graphs = project.graphs.filter((pg) => pg.id !== id);
  const active = graphs.some((pg) => pg.id === project.active) ? project.active : graphs[0].id;
  return { ...project, active, graphs };
}

export function switchGraph(project: ProjectDoc, id: string): ProjectDoc | null {
  if (!project.graphs.some((pg) => pg.id === id)) return null;
  return { ...project, active: id };
}

/** 解析 project.json（多图）；任何一张图不合法就整份拒绝，返回 null。 */
export function parseProjectDoc(raw: unknown): ProjectDoc | null {
  if (!raw || typeof raw !== 'object') return null;
  const doc = raw as Partial<ProjectDoc>;
  if (doc.version !== 1 || !Array.isArray(doc.graphs) || doc.graphs.length === 0) return null;
  const graphs: ProjectGraph[] = [];
  for (const item of doc.graphs) {
    if (!item || typeof item.id !== 'string') return null;
    const result = GraphSchema.safeParse(item.graph);
    if (!result.success) return null;
    graphs.push({
      id: item.id,
      name: typeof item.name === 'string' && item.name ? item.name : '未命名图',
      graph: result.data as Graph,
      level: typeof item.level === 'number' ? item.level : 0,
      folderId: typeof item.folderId === 'string' ? item.folderId : null,
    });
  }
  return normalizeProject({
    version: 1,
    active: typeof doc.active === 'string' ? doc.active : graphs[0].id,
    graphs,
    folders: Array.isArray(doc.folders) ? doc.folders : [],
    grouped: doc.grouped === true,
    style: normalizeStyle(doc.style),
  });
}


/** 图的层级标题：0 = 未分层，1 = 一级矿，2 起为产物。 */
export function graphLevelLabel(level: number): string {
  if (level <= 0) return '其它';
  if (level === 1) return '一级矿';
  const names = ['', '一级矿', '二级产物', '三级产物', '四级产物', '五级产物', '六级产物', '七级产物', '八级产物', '九级产物', '十级产物'];
  return names[level] ?? `${level}级产物`;
}
