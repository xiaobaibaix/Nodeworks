import { z } from 'zod';
import type { Graph } from './types';

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

export const NodeSchema = z.object({
  id: z.string().min(1),
  kind: z.string().optional(),
  title: z.string(),
  props: z.record(z.string(), PropSchema),
  ports: z.array(PortSchema),
  pos: z.object({ x: z.number(), y: z.number() }),
  subgraph: z.unknown().optional(),
});

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

export const GraphSchema = z.object({
  version: z.literal(1),
  nodes: z.array(NodeSchema),
  edges: z.array(EdgeSchema),
  kinds: z.record(z.string(), KindSchema),
});

export function parseGraph(input: unknown): Graph {
  const result = GraphSchema.safeParse(input);
  if (!result.success) {
    const first = result.error.issues[0];
    const path = first?.path.join('.') ?? '(root)';
    throw new Error(`图数据不合法：${path} ${first?.message ?? ''}`.trim());
  }
  return result.data as Graph;
}
