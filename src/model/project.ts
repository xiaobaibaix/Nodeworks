import { emptyGraph } from './ops';
import { GraphSchema } from './schema';
import { EMPTY_STYLE, normalizeStyle, type ProjectStyle } from './style';
import type { Graph, KindDef } from './types';

export interface ProjectGraph {
  id: string;
  name: string;
  graph: Graph;
}

/** 一个 project 管多张根图；图之间共享顶层 kinds（子图内部仍各存一份）。 */
export interface ProjectDoc {
  version: 1;
  active: string;
  graphs: ProjectGraph[];
  /** 资源全局风格：所有图标/模型的生成描述词都挂在它下面 */
  style?: ProjectStyle;
}

export const PROJECT_LIMIT = 24;

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
    .map((pg) => ({ ...pg, name: pg.name || '未命名图' }));
  if (graphs.length === 0) {
    graphs.push({ id: projectGraphId(), name: '主图', graph: emptyGraph() });
  }
  const active = graphs.some((pg) => pg.id === project.active) ? project.active : graphs[0].id;
  return unifyKinds({ version: 1, active, graphs, style: normalizeStyle(project.style) });
}

export function projectFromGraph(graph: Graph, name = '主图'): ProjectDoc {
  const id = projectGraphId();
  return { version: 1, active: id, graphs: [{ id, name, graph }], style: { ...EMPTY_STYLE } };
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

export function addGraph(project: ProjectDoc, name?: string): { project: ProjectDoc; id: string } {
  if (project.graphs.length >= PROJECT_LIMIT) return { project, id: project.active };
  const id = projectGraphId();
  const kinds = mergeKinds(project.graphs);
  const graph: Graph = { ...emptyGraph(), kinds };
  const next = {
    ...project,
    active: id,
    graphs: [...project.graphs, { id, name: name?.trim() || `图 ${project.graphs.length + 1}`, graph }],
  };
  return { project: unifyKinds(next), id };
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
    });
  }
  return normalizeProject({
    version: 1,
    active: typeof doc.active === 'string' ? doc.active : graphs[0].id,
    graphs,
    style: normalizeStyle(doc.style),
  });
}
