/**
 * 生成接口：资源项的「生成」按钮最终都走这里。
 *
 * 现在自带一个 OpenAI 兼容的图片生成器（火山 Ark / OpenAI / 大多数中转都兼容）。
 * 3D 模型等其它能力故意留空——后续 MCP、dsh 插件或其它 agent 工具通过
 * registerGenerator('model3d', …) 注册即可接入，不需要改 UI。
 */
import { CAPABILITY_LABEL, type Capability, type ProviderConfig } from './providers';
import type { ResourceItem } from './types';

export interface GeneratedFile {
  name: string;
  bytes: Uint8Array;
  mime: string;
}

export type GenerationResult =
  | { ok: true; files: GeneratedFile[] }
  | { ok: false; error: string };

export interface GenerationInput {
  provider: ProviderConfig;
  /** 已经拼好全局风格的完整提示词 */
  prompt: string;
  /** 可选尺寸，如 1024x1024；留空用服务默认 */
  size?: string;
  resource?: Pick<ResourceItem, 'type' | 'label'>;
  signal?: AbortSignal;
}

export type Generator = (input: GenerationInput) => Promise<GenerationResult>;

const registry = new Map<Capability, Generator>();

/** 接入新能力（MCP / dsh 插件）的入口。 */
export function registerGenerator(capability: Capability, generator: Generator): void {
  registry.set(capability, generator);
}

export function hasGenerator(capability: Capability): boolean {
  return registry.has(capability);
}

export function registeredCapabilities(): Capability[] {
  return [...registry.keys()];
}

function errorText(error: unknown): string {
  if (error instanceof Error) {
    if (error.name === 'AbortError') return '已取消';
    return error.message;
  }
  return String(error);
}

function clamp(text: string, max = 300): string {
  const flat = text.replace(/\s+/g, ' ').trim();
  return flat.length > max ? `${flat.slice(0, max)}…` : flat;
}

/** 提示词 + 服务缺项的检查放在分发处，所有生成器共用。 */
export async function generateResource(input: GenerationInput): Promise<GenerationResult> {
  const { provider, prompt } = input;
  const generator = registry.get(provider.capability);
  if (!generator) {
    return {
      ok: false,
      error: `还没有「${CAPABILITY_LABEL[provider.capability]}」生成器。可以由插件注册：registerGenerator('${provider.capability}', …)。`,
    };
  }
  if (!provider.baseUrl.trim()) return { ok: false, error: '这条服务还没填 Base URL' };
  if (!provider.apiKey.trim()) return { ok: false, error: '这条服务还没填 API Key' };
  if (!provider.model.trim()) return { ok: false, error: '这条服务还没填模型 id' };
  if (!prompt.trim()) return { ok: false, error: '提示词为空' };
  try {
    return await generator(input);
  } catch (error) {
    return { ok: false, error: `请求失败：${errorText(error)}` };
  }
}

/** Base URL 可以是根（…/api/v3）、带 /v1，或已经指向 /images/generations。 */
export function imagesEndpoint(baseUrl: string): string {
  const base = baseUrl.trim().replace(/\/+$/, '');
  if (!base) return '';
  if (/\/images\/generations$/i.test(base)) return base;
  return `${base}/images/generations`;
}

function bytesFromBase64(text: string): Uint8Array {
  const binary = atob(text);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function sniffImage(bytes: Uint8Array): { mime: string; ext: string } {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return { mime: 'image/jpeg', ext: 'jpg' };
  }
  if (bytes.length >= 8 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) {
    return { mime: 'image/png', ext: 'png' };
  }
  if (bytes.length >= 12 && bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50) {
    return { mime: 'image/webp', ext: 'webp' };
  }
  return { mime: 'image/png', ext: 'png' };
}

function stampedName(ext: string, index: number, total: number): string {
  const stamp = new Date().toISOString().replace(/[-:TZ.]/g, '').slice(0, 14);
  return `generated-${stamp}${total > 1 ? `-${index + 1}` : ''}.${ext}`;
}

interface ImageDatum {
  b64_json?: unknown;
  url?: unknown;
}

/**
 * 解析 OpenAI 兼容的 /images/generations 响应：data[].b64_json 或 data[].url。
 * url 形式会再取一次字节；跨域被拦时给出可读错误。
 */
export async function parseImageResponse(
  json: unknown,
  fetchImpl: typeof fetch = fetch,
): Promise<GenerationResult> {
  const data = (json as { data?: unknown } | null)?.data;
  if (!Array.isArray(data) || data.length === 0) {
    return { ok: false, error: '响应里没有图片数据（data 为空）' };
  }
  const files: GeneratedFile[] = [];
  for (let i = 0; i < data.length; i += 1) {
    const item = data[i] as ImageDatum;
    if (typeof item?.b64_json === 'string' && item.b64_json) {
      const bytes = bytesFromBase64(item.b64_json);
      const { mime, ext } = sniffImage(bytes);
      files.push({ name: stampedName(ext, i, data.length), bytes, mime });
      continue;
    }
    if (typeof item?.url === 'string' && item.url) {
      try {
        const response = await fetchImpl(item.url);
        if (!response.ok) {
          return { ok: false, error: `下载生成结果失败：${response.status} ${response.statusText}` };
        }
        const bytes = new Uint8Array(await response.arrayBuffer());
        const { mime, ext } = sniffImage(bytes);
        files.push({ name: stampedName(ext, i, data.length), bytes, mime });
      } catch (error) {
        return { ok: false, error: `下载生成结果失败：${errorText(error)}` };
      }
    }
  }
  if (!files.length) return { ok: false, error: '响应里的图片既没有 b64_json 也没有可下载的 url' };
  return { ok: true, files };
}

export interface ImageGeneratorOptions {
  /** 例如 1024x1024；为空则不传，用服务默认尺寸 */
  size?: string;
  fetchImpl?: typeof fetch;
}

/** OpenAI 兼容图片生成器：POST {base}/images/generations，请求 b64_json。 */
export function openAICompatibleImageGenerator(options: ImageGeneratorOptions = {}): Generator {
  return async ({ provider, prompt, size, signal }) => {
    const fetchImpl = options.fetchImpl ?? fetch;
    const requestSize = size?.trim() || options.size;
    let response: Response;
    try {
      response = await fetchImpl(imagesEndpoint(provider.baseUrl), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${provider.apiKey}`,
        },
        body: JSON.stringify({
          model: provider.model,
          prompt,
          response_format: 'b64_json',
          ...(requestSize ? { size: requestSize } : {}),
        }),
        signal,
      });
    } catch (error) {
      return { ok: false, error: `请求失败（网络或跨域限制）：${errorText(error)}` };
    }
    if (!response.ok) {
      const text = await response.text().catch(() => '');
      return { ok: false, error: `服务返回 ${response.status}：${clamp(text) || response.statusText}` };
    }
    let json: unknown;
    try {
      json = await response.json();
    } catch (error) {
      return { ok: false, error: `响应不是 JSON：${errorText(error)}` };
    }
    return parseImageResponse(json, fetchImpl);
  };
}

// 默认能力：图片。3D 等能力等插件注册后即可用同一个按钮。
registerGenerator('image', openAICompatibleImageGenerator());
