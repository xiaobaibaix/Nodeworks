import type { ResourceItem } from './types';

/**
 * 一个可复用的风格主题。资源项只引用主题 id，不复制文本：
 * 改主题 → 所有引用它的资源生成提示词一起变。
 */
export interface StylePreset {
  id: string;
  /** 主题名，如「低多边形工业风」 */
  name: string;
  /** 风格主体：材质、配色、光影、造型语言 */
  description: string;
  /** 统一要求：视角、构图、背景、尺寸等技术约束 */
  rules: string;
  /** 不希望出现的要素 */
  avoid: string;
}

/** 全项目资源风格库：多个主题 + 一个默认主题。 */
export interface ProjectStyle {
  presets: StylePreset[];
  defaultId: string;
}

export const STYLE_DEFAULT_ID = 's_default';

export const EMPTY_PRESET: StylePreset = {
  id: STYLE_DEFAULT_ID,
  name: '',
  description: '',
  rules: '',
  avoid: '',
};

export const EMPTY_STYLE: ProjectStyle = {
  presets: [{ ...EMPTY_PRESET }],
  defaultId: STYLE_DEFAULT_ID,
};

function textOf(rec: Record<string, unknown>, key: string): string {
  return typeof rec[key] === 'string' ? (rec[key] as string) : '';
}

function normalizePreset(raw: unknown, index: number): StylePreset {
  const rec = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  const name = typeof rec.name === 'string' ? rec.name.trim() : `主题 ${index + 1}`;
  return {
    id: textOf(rec, 'id').trim() || `s_${index + 1}`,
    name,
    description: textOf(rec, 'description'),
    rules: textOf(rec, 'rules'),
    avoid: textOf(rec, 'avoid'),
  };
}

/** 容错读入：支持旧版的单主题字段（name/description/rules/avoid）。 */
export function normalizeStyle(raw: unknown): ProjectStyle {
  const rec = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  let presets: StylePreset[] = [];
  if (Array.isArray(rec.presets)) {
    presets = rec.presets.map((p, i) => normalizePreset(p, i)).filter((p, i, all) => all.findIndex((x) => x.id === p.id) === i);
  }
  if (!presets.length) {
    presets = [{
      id: STYLE_DEFAULT_ID,
      name: textOf(rec, 'name').trim(),
      description: textOf(rec, 'description'),
      rules: textOf(rec, 'rules'),
      avoid: textOf(rec, 'avoid'),
    }];
  }
  if (!presets.length) presets = [{ ...EMPTY_PRESET }];
  const defaultId = textOf(rec, 'defaultId').trim();
  return {
    presets,
    defaultId: presets.some((p) => p.id === defaultId) ? defaultId : presets[0].id,
  };
}

/** 某条资源实际使用的主题：资源自己的 styleId → 项目默认 → 第一条。 */
export function presetOf(style: ProjectStyle, styleId?: string | null): StylePreset {
  return (
    style.presets.find((p) => p.id === styleId) ??
    style.presets.find((p) => p.id === style.defaultId) ??
    style.presets[0] ??
    EMPTY_PRESET
  );
}

export function isEmptyStyle(style: ProjectStyle): boolean {
  return style.presets.every((p) => !p.description.trim() && !p.rules.trim() && !p.avoid.trim());
}

const TYPE_LABEL: Record<string, string> = {
  image: '图片',
  model: '模型',
  audio: '音频',
  other: '资源',
};

/** 只有图片和模型要交给生成工具；音频/其它不带描述词。 */
export function wantsPrompt(type: ResourceItem['type']): boolean {
  return type === 'image' || type === 'model';
}

/**
 * 一段可复制的生成提示词：先放主题风格，再放这条资源自己的描述。
 * 主题为空时只输出主体部分，方便单条资源也能直接用。
 */
export function composePrompt(
  style: ProjectStyle,
  resource: Pick<ResourceItem, 'label' | 'type' | 'prompt' | 'styleId'>,
  subject?: string,
): string {
  const preset = presetOf(style, resource.styleId);
  const lines: string[] = [];
  const head = [preset.name.trim(), preset.description.trim()].filter(Boolean).join('：');
  if (head) lines.push(`【全局风格】${head}`);
  if (preset.rules.trim()) lines.push(`【统一要求】${preset.rules.trim()}`);
  if (preset.avoid.trim()) lines.push(`【避免】${preset.avoid.trim()}`);
  const what = TYPE_LABEL[resource.type] ?? '资源';
  const name = subject ? `${subject} · ${resource.label || what}` : resource.label || what;
  lines.push(`【主体】${name}（${what}）`);
  if (resource.prompt?.trim()) lines.push(resource.prompt.trim());
  return lines.join('\n');
}

/** 某个主题的展示文本（导出/复制用）。 */
export function styleText(style: ProjectStyle, styleId?: string | null): string {
  return composePrompt(style, { label: '风格基准', type: 'other', styleId })
    .split('\n')
    .filter((line) => !line.startsWith('【主体】'))
    .join('\n');
}
