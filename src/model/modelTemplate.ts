import type { ResourceItem, UnitNode } from './types';
import { uid } from './ops';

export type ModelSlot = 'mesh' | 'basecolor' | 'normal' | 'orm' | 'lod' | 'collision';

export interface SlotDef {
  key: ModelSlot;
  label: string;
  type: ResourceItem['type'];
  path: string;
  group: '基础' | '场景';
  required: boolean;
  hint: string;
}

/**
 * 引擎无关的模型资源通配表。
 * 最低配：模型文件（mesh + material）+ 基础色 / 法线 / ORM 三张图；
 * 场景件可选 LOD 与碰撞网格；角色骨骼/动画不是独立文件，记在 mesh 资源的 meta.rigged 上。
 */
export const MODEL_SLOTS: SlotDef[] = [
  {
    key: 'mesh',
    label: '模型（网格 + 材质）',
    type: 'model',
    path: 'assets/model.glb',
    group: '基础',
    required: true,
    hint: '网格与材质槽通常随模型文件导入；材质参数、贴图槽由引擎读取。',
  },
  {
    key: 'basecolor',
    label: '基础色',
    type: 'image',
    path: 'assets/model_basecolor.png',
    group: '基础',
    required: true,
    hint: 'Albedo / BaseColor，sRGB。',
  },
  {
    key: 'normal',
    label: '法线',
    type: 'image',
    path: 'assets/model_normal.png',
    group: '基础',
    required: true,
    hint: 'Normal，线性色彩空间。',
  },
  {
    key: 'orm',
    label: 'ORM（AO / 粗糙 / 金属）',
    type: 'image',
    path: 'assets/model_orm.png',
    group: '基础',
    required: true,
    hint: 'AO、Roughness、Metallic 打包在一张图里，线性色彩空间。',
  },
  {
    key: 'lod',
    label: 'LOD',
    type: 'model',
    path: 'assets/model_lod.glb',
    group: '场景',
    required: false,
    hint: '场景件可选：低模层级，引擎按距离切换。',
  },
  {
    key: 'collision',
    label: '碰撞',
    type: 'model',
    path: 'assets/model_collision.glb',
    group: '场景',
    required: false,
    hint: '场景件可选：碰撞网格（如 UE 的 UCX_ 前缀）。',
  },
];

const SLOT_KEYS = new Set<string>(MODEL_SLOTS.map((d) => d.key));

/** 识别资源项属于哪个通配槽；老数据没有 slot 时按标签/路径猜。 */
export function slotOf(r: ResourceItem): ModelSlot | null {
  if (r.slot && SLOT_KEYS.has(r.slot)) return r.slot as ModelSlot;
  const s = `${r.label} ${r.path}`.toLowerCase();
  if (s.includes('normal') || s.includes('法线')) return 'normal';
  if (s.includes('basecolor') || s.includes('base_color') || s.includes('albedo') || s.includes('diffuse') || s.includes('基础色')) return 'basecolor';
  if (/(^|[_\-\s])orm([_\-\s.]|$)/.test(s) || /(^|[_\-\s])ao([_\-\s.]|$)/.test(s)) return 'orm';
  if (s.includes('lod')) return 'lod';
  if (s.includes('collision') || s.includes('碰撞') || s.includes('ucx')) return 'collision';
  if (r.type === 'model') return 'mesh';
  return null;
}

export function slotsPresent(node: UnitNode): Partial<Record<ModelSlot, ResourceItem>> {
  const out: Partial<Record<ModelSlot, ResourceItem>> = {};
  for (const r of node.resources ?? []) {
    const slot = slotOf(r);
    if (slot && !out[slot]) out[slot] = r;
  }
  return out;
}

export function isRigged(node: UnitNode): boolean {
  const mesh = slotsPresent(node).mesh;
  return mesh?.meta?.rigged === true;
}

export function hasSceneSlots(node: UnitNode): boolean {
  const have = slotsPresent(node);
  return Boolean(have.lod || have.collision);
}

/** 按通配表补齐缺失的资源项（返回新资源，不改 node）。 */
export function templateResources(node: UnitNode, opts: { rig: boolean; scene: boolean }): ResourceItem[] {
  const have = slotsPresent(node);
  return MODEL_SLOTS.filter((def) => {
    if (have[def.key]) return false;
    if (!def.required && !opts.scene) return false;
    return true;
  }).map((def) => ({
    id: uid('r'),
    type: def.type,
    label: def.label,
    path: def.path,
    slot: def.key,
  }));
}

export interface ChecklistRow {
  key: string;
  label: string;
  group: '基础' | '角色' | '场景';
  state: 'ok' | 'missing' | 'optional';
  hint: string;
}

export function modelChecklist(node: UnitNode): ChecklistRow[] {
  const have = slotsPresent(node);
  const rows: ChecklistRow[] = MODEL_SLOTS.map((def) => ({
    key: def.key,
    label: def.label,
    group: def.group,
    state: have[def.key] ? 'ok' : def.required ? 'missing' : 'optional',
    hint: def.hint,
  }));
  rows.push({
    key: 'rig',
    label: '骨骼 / 蒙皮 / 动画',
    group: '角色',
    state: isRigged(node) ? 'ok' : 'optional',
    hint: '角色才有；骨骼与动画随模型文件，勾选「角色」后记在 mesh 资源的 meta.rigged。',
  });
  return rows;
}
