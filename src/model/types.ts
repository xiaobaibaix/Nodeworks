export type PortDir = 'in' | 'out';
export type PortCapacity = 'one' | 'many';

export interface PropMeta {
  value: unknown;
  type?: string;
  editor?: string;
  unit?: string;
  required?: boolean;
}

export type PropBag = Record<string, PropMeta>;

export interface UnitPort {
  id: string;
  dir: PortDir;
  label: string;
  capacity: PortCapacity;
  type?: string;
}

export interface UnitNode {
  id: string;
  kind?: string;
  title: string;
  props: PropBag;
  ports: UnitPort[];
  pos: { x: number; y: number };
  subgraph?: unknown;
}

export interface Endpoint {
  node: string;
  port: string;
}

export interface UnitEdge {
  id: string;
  from: Endpoint;
  to: Endpoint;
  label?: string;
  props?: PropBag;
  orphan?: boolean;
}

export interface KindDef {
  name: string;
  color?: string;
  defaults?: PropBag;
  ports?: Array<Omit<UnitPort, 'id'>>;
}

export interface Graph {
  version: 1;
  nodes: UnitNode[];
  edges: UnitEdge[];
  kinds: Record<string, KindDef>;
}
