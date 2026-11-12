import { describe, expect, it } from 'vitest';
import {
  PROVIDERS_KEY,
  activateProvider,
  activeProvider,
  loadProviders,
  newProvider,
  normalizeProviders,
  saveProviders,
  type ProviderConfig,
} from '../src/model/providers';

function fakeStorage() {
  const map = new Map<string, string>();
  return {
    map,
    getItem: (key: string) => map.get(key) ?? null,
    setItem: (key: string, value: string) => {
      map.set(key, value);
    },
  };
}

function provider(patch: Partial<ProviderConfig> = {}): ProviderConfig {
  return {
    id: 'p1',
    name: '图片服务',
    capability: 'image',
    baseUrl: 'https://ark.cn-beijing.volces.com/api/v3',
    model: 'doubao-seedream-5-0-pro',
    apiKey: 'ark-test',
    active: false,
    ...patch,
  };
}

describe('全局生成服务配置', () => {
  it('normalizeProviders 丢弃非对象并补齐缺省字段', () => {
    const list = normalizeProviders([
      null,
      'x',
      { id: 'a', capability: 'model3d', active: true },
      { name: '只有名字' },
    ]);
    expect(list).toHaveLength(2);
    expect(list[0]).toMatchObject({
      id: 'a',
      capability: 'model3d',
      active: true,
      baseUrl: '',
      model: '',
      apiKey: '',
    });
    expect(list[1].capability).toBe('image');
    expect(list[1].id).toBeTruthy();
  });

  it('loadProviders 容忍坏 JSON 与缺失存储', () => {
    expect(loadProviders(fakeStorage())).toEqual([]);
    const bad = fakeStorage();
    bad.setItem(PROVIDERS_KEY, '{oops');
    expect(loadProviders(bad)).toEqual([]);
  });

  it('saveProviders / loadProviders 往返', () => {
    const storage = fakeStorage();
    const list = [provider(), provider({ id: 'p2', capability: 'model3d' })];
    saveProviders(list, storage);
    expect(loadProviders(storage)).toEqual(list);
  });

  it('activateProvider 让同一能力只留一条启用', () => {
    const list = [
      provider({ id: 'a', active: true }),
      provider({ id: 'b' }),
      provider({ id: 'c', capability: 'model3d', active: true }),
    ];
    const next = activateProvider(list, 'b');
    expect(next.find((p) => p.id === 'a')!.active).toBe(false);
    expect(next.find((p) => p.id === 'b')!.active).toBe(true);
    // 不同能力互不影响
    expect(next.find((p) => p.id === 'c')!.active).toBe(true);
  });

  it('activeProvider 没有启用时取该能力第一条', () => {
    const list = [provider({ id: 'a' }), provider({ id: 'b' })];
    expect(activeProvider(list, 'image')?.id).toBe('a');
    expect(activeProvider(list, 'model3d')).toBeUndefined();
  });

  it('newProvider 按能力给默认名且默认未启用', () => {
    expect(newProvider('model3d')).toMatchObject({ capability: 'model3d', active: false });
    expect(newProvider('image').name).toBe('新图片服务');
  });
});
