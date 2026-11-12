import type { ResourceItem } from './types';

/**
 * 全项目资源风格：图标、模型等所有资源共用同一套描述词，
 * 生成资源时把「全局风格 + 单条资源描述词」拼成一段提示词交给外部工具。
 */
export interface ProjectStyle {
  /** 风格名，如「低多边形工业风」 */
  name: string;
  /** 风格主体：材质、配色、光影、造型语言 */
  description: string;
  /** 统一要求：视角、构图、背景、尺寸等技术约束 */
  rules: string;
  /** 不希望出现的要素 */
  avoid: string;
}

export const EMPTY_STYLE: ProjectStyle = { name: '', description: '', rules: '', avoid: '' };

/** 容错读入：缺字段按空串处理，非对象返回空风格。 */
export function normalizeStyle(raw: unknown): ProjectStyle {
  const rec = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  const pick = (key: keyof ProjectStyle): string =>
    typeof rec[key] === 'string' ? (rec[key] as string) : '';
  return {
    name: pick('name'),
    description: pick('description'),
    rules: pick('rules'),
    avoid: pick('avoid'),
  };
}

export function isEmptyStyle(style: ProjectStyle): boolean {
  return !style.name.trim() && !style.description.trim() && !style.rules.trim() && !style.avoid.trim();
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
 * 一段可复制的生成提示词：先放全局风格，再放这条资源自己的描述。
 * 风格为空时只输出主体部分，方便单条资源也能直接用。
 */
export function composePrompt(
  style: ProjectStyle,
  resource: Pick<ResourceItem, 'label' | 'type' | 'prompt'>,
  subject?: string,
): string {
  const lines: string[] = [];
  const head = [style.name.trim(), style.description.trim()].filter(Boolean).join('：');
  if (head) lines.push(`【全局风格】${head}`);
  if (style.rules.trim()) lines.push(`【统一要求】${style.rules.trim()}`);
  if (style.avoid.trim()) lines.push(`【避免】${style.avoid.trim()}`);
  const what = TYPE_LABEL[resource.type] ?? '资源';
  const name = subject ? `${subject} · ${resource.label || what}` : resource.label || what;
  lines.push(`【主体】${name}（${what}）`);
  if (resource.prompt?.trim()) lines.push(resource.prompt.trim());
  return lines.join('\n');
}

/** 风格本身的展示文本（导出/复制用）。 */
export function styleText(style: ProjectStyle): string {
  return composePrompt(style, { label: '风格基准', type: 'other' })
    .split('\n')
    .filter((line) => !line.startsWith('【主体】'))
    .join('\n');
}
