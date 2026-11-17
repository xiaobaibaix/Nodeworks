import type { Graph, ResourceItem, ResourceType, UnitNode } from './types';
import { uid } from './ops';

/** 资源栏固定只有三种容器，每种最多一个。 */
export const RESOURCE_CONTAINERS: { type: ResourceType; label: string }[] = [
  { type: 'image', label: '图标' },
  { type: 'model', label: '模型' },
  { type: 'audio', label: '音频' },
];

const CONTAINER_TYPES = new Set<ResourceType>(['image', 'model', 'audio']);

export function isContainer(r: ResourceItem): boolean {
  return Boolean(r.group && CONTAINER_TYPES.has(r.type));
}

export function containerOf(node: UnitNode, type: ResourceType): ResourceItem | undefined {
  return node.resources?.find((r) => isContainer(r) && r.type === type);
}

export function containerLabel(type: ResourceType): string {
  return RESOURCE_CONTAINERS.find((c) => c.type === type)?.label ?? '资源';
}

/** 把旧数据里的扁平资源收进对应容器；已有容器则把游离项补进去。 */
function normalizeNode(node: UnitNode): UnitNode {
  const list = node.resources;
  if (!list?.length) return node;
  const containers = list.filter(isContainer);
  const rest = list.filter((r) => !isContainer(r));
  const next: ResourceItem[] = [];
  for (const { type, label } of RESOURCE_CONTAINERS) {
    const existing = containers.find((c) => c.type === type);
    const flats = rest.filter((r) => r.type === type);
    if (existing) {
      if (flats.length) {
        existing.views = [...(existing.views ?? []), ...flats];
      }
      next.push(existing);
    } else if (flats.length) {
      next.push({
        id: uid('r'),
        type,
        label,
        path: '',
        group: true,
        views: flats,
      });
    }
  }
  for (const r of rest) if (!CONTAINER_TYPES.has(r.type)) next.push(r);
  return { ...node, resources: next };
}

export function withResourceContainers(graph: Graph): Graph {
  return {
    ...graph,
    nodes: graph.nodes.map((node) => {
      const normalized = normalizeNode(node);
      return normalized.subgraph
        ? { ...normalized, subgraph: withResourceContainers(normalized.subgraph) }
        : normalized;
    }),
  };
}

/** 按容器展平成树遍历顺序，depth 用于缩进展示。 */
export function flattenResources(node: UnitNode): { resource: ResourceItem; depth: number }[] {
  const out: { resource: ResourceItem; depth: number }[] = [];
  const walk = (items: ResourceItem[] | undefined, depth: number) => {
    for (const item of items ?? []) {
      out.push({ resource: item, depth });
      if (item.views?.length) walk(item.views, depth + 1);
    }
  };
  walk(node.resources, 0);
  return out;
}
