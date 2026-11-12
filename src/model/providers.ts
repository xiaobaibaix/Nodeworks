/**
 * 全局生成服务配置（类似 CC Switch）：存在浏览器 localStorage，不进项目文件。
 * 键值会以明文保存在本机；项目里只记录对服务的引用。
 */

export type Capability = 'image' | 'model3d';

export interface ProviderConfig {
  id: string;
  name: string;
  capability: Capability;
  /** 接口根，如 https://ark.cn-beijing.volces.com/api/v3 */
  baseUrl: string;
  /** 服务端模型 id，如 doubao-seedream-5-0-pro */
  model: string;
  apiKey: string;
  /** 同一能力下同时只有一个启用 */
  active: boolean;
  note?: string;
}

export const PROVIDERS_KEY = 'nodeworks.providers.v1';

export const CAPABILITY_LABEL: Record<Capability, string> = {
  image: '图片',
  model3d: '3D 模型',
};

export function isCapability(value: unknown): value is Capability {
  return value === 'image' || value === 'model3d';
}

function newId(): string {
  return `p_${Math.random().toString(36).slice(2, 9)}`;
}

export function newProvider(capability: Capability = 'image'): ProviderConfig {
  return {
    id: newId(),
    name: capability === 'model3d' ? '新 3D 服务' : '新图片服务',
    capability,
    baseUrl: '',
    model: '',
    apiKey: '',
    active: false,
  };
}

/** 容错读入一条服务配置；不是对象或没有可用字段就返回 null。 */
export function normalizeProvider(raw: unknown): ProviderConfig | null {
  if (!raw || typeof raw !== 'object') return null;
  const rec = raw as Record<string, unknown>;
  const str = (key: string): string => (typeof rec[key] === 'string' ? (rec[key] as string) : '');
  const capability = isCapability(rec.capability) ? rec.capability : 'image';
  return {
    id: str('id') || newId(),
    name: str('name') || CAPABILITY_LABEL[capability],
    capability,
    baseUrl: str('baseUrl'),
    model: str('model'),
    apiKey: str('apiKey'),
    active: rec.active === true,
    note: typeof rec.note === 'string' ? rec.note : undefined,
  };
}

export function normalizeProviders(raw: unknown): ProviderConfig[] {
  if (!Array.isArray(raw)) return [];
  const out: ProviderConfig[] = [];
  for (const item of raw) {
    const provider = normalizeProvider(item);
    if (provider) out.push(provider);
  }
  return out;
}

type StorageLike = Pick<Storage, 'getItem' | 'setItem'>;

function storageOf(storage?: StorageLike): StorageLike | null {
  if (storage) return storage;
  return typeof localStorage === 'undefined' ? null : localStorage;
}

export function loadProviders(storage?: StorageLike): ProviderConfig[] {
  const store = storageOf(storage);
  if (!store) return [];
  try {
    const text = store.getItem(PROVIDERS_KEY);
    return text ? normalizeProviders(JSON.parse(text)) : [];
  } catch {
    return [];
  }
}

export function saveProviders(list: ProviderConfig[], storage?: StorageLike): void {
  const store = storageOf(storage);
  if (!store) return;
  try {
    store.setItem(PROVIDERS_KEY, JSON.stringify(list));
  } catch {
    // 隐私模式 / 配额满：配置留在内存里，刷新后丢失
  }
}

export function activeProvider(list: ProviderConfig[], capability: Capability): ProviderConfig | undefined {
  const ofCap = list.filter((p) => p.capability === capability);
  return ofCap.find((p) => p.active) ?? ofCap[0];
}

/** 启用某条服务：同能力的其它服务自动取消启用。 */
export function activateProvider(list: ProviderConfig[], id: string): ProviderConfig[] {
  const target = list.find((p) => p.id === id);
  if (!target) return list;
  return list.map((p) =>
    p.capability === target.capability ? { ...p, active: p.id === id } : p,
  );
}
