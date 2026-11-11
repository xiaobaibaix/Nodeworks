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
  /** 嵌套子图；坐标与 id 都在子图内部作用域 */
  subgraph?: Graph;
  /** 父端口 id → 子图内部端点，用于子图边界映射 */
  subgraphMap?: Record<string, Endpoint>;
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
