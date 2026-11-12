import { describe, expect, it } from 'vitest';
import {
  generateResource,
  imagesEndpoint,
  openAICompatibleImageGenerator,
  parseImageResponse,
  registerGenerator,
} from '../src/model/generation';
import type { ProviderConfig } from '../src/model/providers';

function provider(patch: Partial<ProviderConfig> = {}): ProviderConfig {
  return {
    id: 'p1',
    name: '火山 Seedream',
    capability: 'image',
    baseUrl: 'https://ark.cn-beijing.volces.com/api/v3',
    model: 'doubao-seedream-5-0-pro',
    apiKey: 'ark-test',
    active: true,
    ...patch,
  };
}

/** 最小的 Response 替身，够生成器用。 */
function response(json: unknown, ok = true, status = 200): Response {
  return {
    ok,
    status,
    statusText: ok ? 'OK' : 'Bad Request',
    json: async () => json,
    text: async () => JSON.stringify(json),
    arrayBuffer: async () => new ArrayBuffer(0),
  } as unknown as Response;
}

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3]);
function b64(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes));
}

describe('生成接口', () => {
  it('imagesEndpoint 兼容根地址、尾斜杠与已带路径的地址', () => {
    expect(imagesEndpoint('https://ark.cn-beijing.volces.com/api/v3')).toBe(
      'https://ark.cn-beijing.volces.com/api/v3/images/generations',
    );
    expect(imagesEndpoint('https://x.test/v1/')).toBe('https://x.test/v1/images/generations');
    expect(imagesEndpoint('https://x.test/v1/images/generations')).toBe('https://x.test/v1/images/generations');
    expect(imagesEndpoint('  ')).toBe('');
  });

  it('parseImageResponse 解析 b64_json，按字节嗅探 png', async () => {
    const result = await parseImageResponse({ data: [{ b64_json: b64(PNG) }] });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.files).toHaveLength(1);
    expect(result.files[0].mime).toBe('image/png');
    expect(result.files[0].name.endsWith('.png')).toBe(true);
    expect([...result.files[0].bytes]).toEqual([...PNG]);
  });

  it('parseImageResponse 的 data 为空时给出可读错误', async () => {
    expect(await parseImageResponse({ data: [] })).toEqual({
      ok: false,
      error: '响应里没有图片数据（data 为空）',
    });
    expect(await parseImageResponse(null)).toMatchObject({ ok: false });
  });

  it('parseImageResponse 遇到 url 会再取一次字节', async () => {
    const fetched: string[] = [];
    const fakeFetch = (async (url: string) => {
      fetched.push(url);
      return { ok: true, arrayBuffer: async () => new Uint8Array([0xff, 0xd8, 0xff, 9]).buffer };
    }) as unknown as typeof fetch;
    const result = await parseImageResponse({ data: [{ url: 'https://cdn.test/a.jpg' }] }, fakeFetch);
    expect(fetched).toEqual(['https://cdn.test/a.jpg']);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.files[0].mime).toBe('image/jpeg');
  });

  it('OpenAI 兼容生成器带上模型、提示词、尺寸与 Bearer Key', async () => {
    let captured: { url: string; init?: RequestInit } | null = null;
    const fakeFetch = (async (url: string, init?: RequestInit) => {
      captured = { url, init };
      return response({ data: [{ b64_json: b64(PNG) }] });
    }) as unknown as typeof fetch;

    const run = openAICompatibleImageGenerator({ fetchImpl: fakeFetch });
    const result = await run({ provider: provider(), prompt: '发光的钛锭图标', size: '1024x1024' });

    expect(result.ok).toBe(true);
    expect(captured!.url).toBe('https://ark.cn-beijing.volces.com/api/v3/images/generations');
    expect(captured!.init!.headers).toMatchObject({ Authorization: 'Bearer ark-test' });
    expect(JSON.parse(String(captured!.init!.body))).toEqual({
      model: 'doubao-seedream-5-0-pro',
      prompt: '发光的钛锭图标',
      response_format: 'b64_json',
      size: '1024x1024',
    });
  });

  it('generateResource 先检查服务缺项，再分发', async () => {
    const missing = await generateResource({ provider: provider({ apiKey: '' }), prompt: 'x' });
    expect(missing).toEqual({ ok: false, error: '这条服务还没填 API Key' });
    const noPrompt = await generateResource({ provider: provider(), prompt: '   ' });
    expect(noPrompt).toEqual({ ok: false, error: '提示词为空' });
  });

  it('3D 能力未注册时提示插件注册入口', async () => {
    const result = await generateResource({
      provider: provider({ capability: 'model3d', model: 'some-3d' }),
      prompt: '钛锭 3D 模型',
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain("registerGenerator('model3d'");

    // 插件接入后，同一个按钮直接可用。
    registerGenerator('model3d', async () => ({
      ok: true,
      files: [{ name: 'm.glb', bytes: new Uint8Array([1]), mime: 'model/gltf-binary' }],
    }));
    const after = await generateResource({
      provider: provider({ capability: 'model3d', model: 'some-3d' }),
      prompt: '钛锭 3D 模型',
    });
    expect(after.ok).toBe(true);
  });
});
