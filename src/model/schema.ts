import { z } from 'zod';
import type { Graph, UnitNode } from './types';

export const PropSchema = z.object({
  value: z.unknown(),
  type: z.string().optional(),
  editor: z.string().optional(),
  unit: z.string().optional(),
  required: z.boolean().optional(),
});

export const PortSchema = z.object({
  id: z.string().min(1),
  dir: z.enum(['in', 'out']),
  label: z.string(),
  capacity: z.enum(['one', 'many']),
  type: z.string().optional(),
});

export const EndpointSchema = z.object({
  node: z.string().min(1),
  port: z.string().min(1),
});

const NodeBase = z.object({
  id: z.string().min(1),
  kind: z.string().optional(),
  title: z.string(),
  props: z.record(z.string(), PropSchema),
  ports: z.array(PortSchema),
  pos: z.object({ x: z.number(), y: z.number() }),
  subgraph: z.lazy(() => GraphSchema).optional(),
  subgraphMap: z.record(z.string(), EndpointSchema).optional(),
  resources: z
    .array(
      z.object({
        id: z.string().min(1),
        type: z.enum(['image', 'model', 'audio', 'other']),
        label: z.string(),
        path: z.string(),
        meta: z.record(z.string(), z.union([z.string(), z.number(), z.boolean()])).optional(),
      }),
    )
    .optional(),
  boundaryPos: z
    .object({
      in: z.object({ x: z.number(), y: z.number() }).optional(),
      out: z.object({ x: z.number(), y: z.number() }).optional(),
    })
    .optional(),
});

function checkSubgraphMap(node: z.infer<typeof NodeBase>, ctx: z.RefinementCtx): void {
  if (!node.subgraphMap) return;
  for (const [portId, endpoint] of Object.entries(node.subgraphMap)) {
    const port = node.ports.find((p) => p.id === portId);
    if (!port) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['subgraphMap', portId],
        message: `映射引用了不存在的端口 ${portId}`,
      });
      continue;
    }
    const inner = node.subgraph?.nodes.find((n) => n.id === endpoint.node);
    const innerPort = inner?.ports.find((p) => p.id === endpoint.port);
    if (!inner || !innerPort) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['subgraphMap', portId],
        message: `映射指向不存在的内部端点 ${endpoint.node}.${endpoint.port}`,
      });
      continue;
    }
    if (innerPort.dir !== port.dir) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['subgraphMap', portId],
        message: `映射两端方向不一致（父端口 ${port.dir} / 内部端口 ${innerPort.dir}）`,
      });
    }
  }
}

export const NodeSchema: z.ZodType<UnitNode> = z.lazy(() =>
  NodeBase.superRefine(checkSubgraphMap),
) as unknown as z.ZodType<UnitNode>;

export const EdgeSchema = z.object({
  id: z.string().min(1),
  from: z.object({ node: z.string(), port: z.string() }),
  to: z.object({ node: z.string(), port: z.string() }),
  label: z.string().optional(),
  props: z.record(z.string(), PropSchema).optional(),
  orphan: z.boolean().optional(),
});

export const KindSchema = z.object({
  name: z.string(),
  color: z.string().optional(),
  defaults: z.record(z.string(), PropSchema).optional(),
  ports: z.array(PortSchema.omit({ id: true })).optional(),
});

export const GraphSchema: z.ZodType<Graph> = z.lazy(() =>
  z.object({
    version: z.literal(1),
    nodes: z.array(NodeSchema),
    edges: z.array(EdgeSchema),
    kinds: z.record(z.string(), KindSchema),
  }),
) as unknown as z.ZodType<Graph>;

export function parseGraph(input: unknown): Graph {
  const result = GraphSchema.safeParse(input);
  if (!result.success) {
    const first = result.error.issues[0];
    const path = first?.path.join('.') ?? '(root)';
    throw new Error(`图数据不合法：${path} ${first?.message ?? ''}`.trim());
  }
  return result.data as Graph;
}

/** 给新子图用的空图；kinds 单独一份，进入后可独立维护模板。 */
export function emptySubgraph(): Graph {
  return { version: 1, nodes: [], edges: [], kinds: {} };
}
