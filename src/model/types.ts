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

export type ResourceType = 'image' | 'model' | 'audio' | 'other';

/** 单元上的资源项：图标、模型等外部资产，只登记类型/名称/相对路径，文件不进 json。 */
export interface ResourceItem {
  id: string;
  type: ResourceType;
  label: string;
  path: string;
  /** 通配槽位：mesh / basecolor / normal / orm / lod / collision（见 modelTemplate） */
  slot?: string;
  meta?: Record<string, string | number | boolean>;
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
  /** 资源项容器：可动态增删的图片/模型/音频等外部资产登记 */
  resources?: ResourceItem[];
  /** 子图层里「外层输入/输出」代理的摆放位置（子图坐标），缺省由布局计算 */
  boundaryPos?: {
    in?: { x: number; y: number };
    out?: { x: number; y: number };
  };
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
