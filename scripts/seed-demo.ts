/**
 * 生成示例项目：examples/steel/（目录项目）与 examples/steel.project.json（单文件）。
 *
 * 用法：
 *   node_modules/.pnpm/node_modules/.bin/esbuild scripts/seed-demo.ts --bundle \
 *     --platform=node --format=esm --target=node20 --outfile=/tmp/seed-demo.mjs
 *   node /tmp/seed-demo.mjs
 *
 * 图标从 /tmp/steel-icons 读取（不存在时跳过资源字节，只写资源元数据）。
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { createEdge, createNode, createPort } from '../src/model/ops';
import { writeProject } from '../src/model/folder';
import { NodeFS } from '../mcp/node-fs';
import type { Graph, KindDef, ResourceItem, UnitNode } from '../src/model/types';
import type { ProjectDoc } from '../src/model/project';

const ROOT = process.cwd();
const OUT = `${ROOT}/examples/steel`;

type PropVal = {
  value: string | number | boolean | string[];
  type: 'string' | 'number' | 'boolean' | 'json';
  unit?: string;
};
const num = (value: number, unit?: string): PropVal => ({ value, type: 'number', ...(unit ? { unit } : {}) });
const str = (value: string): PropVal => ({ value, type: 'string' });
const json = (value: string[]): PropVal => ({ value, type: 'json' });

const kinds: Record<string, KindDef> = {
  item: {
    name: '物品',
    color: '#7dc4ff',
    defaults: { value: num(0, 'cr'), tier: num(1) },
    ports: [
      { dir: 'in', label: '输入', capacity: 'many' },
      { dir: 'out', label: '输出', capacity: 'many' },
    ],
  },
  recipe: {
    name: '配方',
    color: '#ffbe5c',
    defaults: { cycle: num(1, 's'), power: num(0, 'kW') },
    ports: [
      { dir: 'in', label: '原料', capacity: 'many' },
      { dir: 'out', label: '产物', capacity: 'many' },
    ],
  },
  machine: {
    name: '机器',
    color: '#9ae6b4',
    defaults: { footprint: str('1x1'), power: num(0, 'kW') },
    ports: [
      { dir: 'in', label: '输入', capacity: 'many' },
      { dir: 'out', label: '输出', capacity: 'many' },
    ],
  },
};

function item(
  title: string,
  x: number,
  y: number,
  props: Record<string, PropVal>,
  opts: { out?: string; inLabel?: string; resources?: ResourceItem[] } = {},
): UnitNode {
  const n = createNode(title, { x, y });
  n.kind = 'item';
  n.props = props;
  if (opts.inLabel) n.ports.push(createPort('in', opts.inLabel));
  if (opts.out) n.ports.push(createPort('out', opts.out));
  if (opts.resources) n.resources = opts.resources;
  return n;
}

function machine(title: string, x: number, y: number, props: Record<string, PropVal>): UnitNode {
  const n = createNode(title, { x, y });
  n.kind = 'machine';
  n.props = props;
  n.ports.push(createPort('in', '电力'));
  n.ports.push(createPort('out', '机器'));
  return n;
}

function recipe(
  title: string,
  x: number,
  y: number,
  props: Record<string, PropVal>,
  ins: string[],
  outs: string[],
): UnitNode {
  const n = createNode(title, { x, y });
  n.kind = 'recipe';
  n.props = props;
  for (const label of ins) n.ports.push(createPort('in', label));
  for (const label of outs) n.ports.push(createPort('out', label));
  return n;
}

const plateIcon: ResourceItem = {
  id: 'r_plate_icon',
  type: 'image',
  label: '钢板图标',
  path: 'assets/steel/plate.png',
};
const furnaceIcon: ResourceItem = {
  id: 'r_furnace_icon',
  type: 'image',
  label: '炼钢炉图标',
  path: 'assets/steel/furnace.png',
};

const iron = item(
  '铁矿石',
  40,
  60,
  { value: num(3, 'cr'), tier: num(1), tags: json(['ore', 'metal']), hardness: num(5.5) },
  { out: '铁矿' },
);
const coal = item(
  '煤矿',
  40,
  300,
  { value: num(2, 'cr'), tier: num(1), tags: json(['ore', 'fuel']), calorific: num(27, 'MJ/kg') },
  { out: '煤' },
);
const flux = item(
  '石灰石',
  40,
  540,
  { value: num(2, 'cr'), tier: num(1), tags: json(['flux']) },
  { out: '石灰石' },
);

const furnace = machine('炼钢炉', 40, 780, {
  footprint: str('3x3'),
  power: num(480, 'kW'),
  heat: num(1600, '°C'),
  workers: num(4),
  tier: num(2),
});

const steel = recipe(
  '炼钢（碱性氧气转炉）',
  380,
  120,
  {
    cycle: num(12, 's'),
    power: num(480, 'kW'),
    batch: num(2),
    temperature: num(1600, '°C'),
    yield: num(0.92),
  },
  ['铁矿', '煤', '石灰石', '机器'],
  ['钢水', '炉渣'],
);

const caster = machine('连铸机', 380, 760, {
  footprint: str('2x3'),
  power: num(200, 'kW'),
  speed: num(1.2, 'x'),
  tier: num(2),
});
const cast = recipe('连铸', 720, 120, { cycle: num(8, 's'), power: num(200, 'kW'), batch: num(2) }, ['钢水', '机器'], ['钢坯']);
const slag = item('炉渣', 720, 420, { value: num(1, 'cr'), tier: num(1), tags: json(['waste']) }, { inLabel: '炉渣' });

const roller = machine('热轧机', 720, 760, {
  footprint: str('4x2'),
  power: num(320, 'kW'),
  speed: num(2, 'x'),
  tier: num(3),
});
const roll = recipe('热轧', 1060, 120, { cycle: num(6, 's'), power: num(320, 'kW'), batch: num(2) }, ['钢坯', '机器'], ['钢板']);
const plate = item(
  '钢板',
  1400,
  120,
  { value: num(48, 'cr'), tier: num(3), tags: json(['metal', 'plate']), thickness: num(6, 'mm') },
  { inLabel: '钢板', resources: [plateIcon] },
);
furnace.resources = [furnaceIcon];

const all = [iron, coal, flux, furnace, steel, slag, cast, caster, roller, roll, plate];

const outPort = (n: UnitNode, label: string): string => {
  const p = n.ports.find((x) => x.dir === 'out' && x.label === label);
  if (!p) throw new Error(`no out ${n.title}.${label}`);
  return p.id;
};
const inPort = (n: UnitNode, label: string): string => {
  const p = n.ports.find((x) => x.dir === 'in' && x.label === label);
  if (!p) throw new Error(`no in ${n.title}.${label}`);
  return p.id;
};

function link(
  from: UnitNode,
  fromLabel: string,
  to: UnitNode,
  toLabel: string,
  label?: string,
  ratio?: number,
) {
  const e = createEdge({ node: from.id, port: outPort(from, fromLabel) }, { node: to.id, port: inPort(to, toLabel) });
  if (label) e.label = label;
  if (ratio !== undefined) e.props = { ratio: num(ratio) };
  return e;
}

const edges = [
  link(iron, '铁矿', steel, '铁矿', '2 : 1', 2),
  link(coal, '煤', steel, '煤', '1 : 1', 1),
  link(flux, '石灰石', steel, '石灰石', '1 : 1', 1),
  link(furnace, '机器', steel, '机器', 'runs-on'),
  link(steel, '钢水', cast, '钢水', '2 : 1', 2),
  link(caster, '机器', cast, '机器', 'runs-on'),
  link(steel, '炉渣', slag, '炉渣'),
  link(cast, '钢坯', roll, '钢坯', '2 : 1', 2),
  link(roller, '机器', roll, '机器', 'runs-on'),
  link(roll, '钢板', plate, '钢板', '2 : 1', 2),
];

const graph: Graph = {
  version: 1,
  nodes: all,
  edges,
  kinds,
};

const project: ProjectDoc = {
  version: 1,
  active: 'g_steel',
  graphs: [{ id: 'g_steel', name: '炼钢产线', graph }],
};

const iconDir = '/tmp/steel-icons';
const bytes: Record<string, Uint8Array> = {};
if (existsSync(`${iconDir}/plate.png`)) bytes.r_plate_icon = new Uint8Array(readFileSync(`${iconDir}/plate.png`));
if (existsSync(`${iconDir}/furnace.png`)) bytes.r_furnace_icon = new Uint8Array(readFileSync(`${iconDir}/furnace.png`));

await writeProject(new NodeFS(OUT), project, {
  readResource: async (_node, resource) => bytes[resource.id] ?? null,
});

const jsonText = `${JSON.stringify(project, null, 2)}\n`;
writeFileSync(`${ROOT}/examples/steel.project.json`, jsonText);
mkdirSync(`${ROOT}/public/examples`, { recursive: true });
writeFileSync(`${ROOT}/public/examples/steel.project.json`, jsonText);
console.log(
  `wrote ${OUT} (${all.length} nodes, ${edges.length} edges); examples/steel.project.json ${(jsonText.length / 1024).toFixed(1)} kB`,
);
