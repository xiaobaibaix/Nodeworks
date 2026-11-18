import { describe, expect, it } from 'vitest';
import {
  EMPTY_STYLE,
  composePrompt,
  isEmptyStyle,
  normalizeStyle,
  styleText,
  wantsPrompt,
} from '../src/model/style';

describe('项目资源风格', () => {
  it('normalizeStyle 容错：非对象、缺字段、非字符串都按空串处理', () => {
    expect(normalizeStyle(null)).toEqual(EMPTY_STYLE);
    expect(normalizeStyle('x')).toEqual(EMPTY_STYLE);
    const migrated = normalizeStyle({ name: '工业风', description: 42, rules: '正视角', extra: 1 });
    expect(migrated.defaultId).toBe('s_default');
    expect(migrated.presets[0]).toMatchObject({ name: '工业风', description: '', rules: '正视角', avoid: '' });
  });

  it('isEmptyStyle 只把全空（含空白）视为空', () => {
    expect(isEmptyStyle(EMPTY_STYLE)).toBe(true);
    const dirty = normalizeStyle({ avoid: '  ', name: '工业风' });
    expect(isEmptyStyle(dirty)).toBe(true);
    const filled = normalizeStyle({ description: '冷灰金属' });
    expect(isEmptyStyle(filled)).toBe(false);
  });

  it('只有图片和模型需要描述词', () => {
    expect(wantsPrompt('image')).toBe(true);
    expect(wantsPrompt('model')).toBe(true);
    expect(wantsPrompt('audio')).toBe(false);
    expect(wantsPrompt('other')).toBe(false);
  });

  it('composePrompt 先全局风格后单条描述，风格为空时只留主体', () => {
    const style = normalizeStyle({ name: '低多边形工业风', description: '冷灰金属', rules: '俯视 45°，纯色背景', avoid: '写实照片' });
    const text = composePrompt(
      style,
      { label: '高炉图标', type: 'image', prompt: '正面高炉，橙红炉火' },
      '炼铁厂',
    );
    expect(text.split('\n')).toEqual([
      '【全局风格】低多边形工业风：冷灰金属',
      '【统一要求】俯视 45°，纯色背景',
      '【避免】写实照片',
      '【主体】炼铁厂 · 高炉图标（图片）',
      '正面高炉，橙红炉火',
    ]);

    const bare = composePrompt(EMPTY_STYLE, { label: '高炉', type: 'model' });
    expect(bare).toBe('【主体】高炉（模型）');
  });

  it('资源可以引用非默认主题，未引用时用默认主题', () => {
    const style = normalizeStyle({
      presets: [
        { id: 's_a', name: '图标风', description: '橙色描边', rules: '正方形', avoid: '文字' },
        { id: 's_b', name: '模型风', description: 'PBR 材质', rules: '', avoid: '' },
      ],
      defaultId: 's_a',
    });
    const icon = composePrompt(style, { label: '钢锭', type: 'image', prompt: '一块钢锭', styleId: 's_b' });
    expect(icon.split('\n')[0]).toBe('【全局风格】模型风：PBR 材质');
    const fallback = composePrompt(style, { label: '钢锭', type: 'image', prompt: '一块钢锭' });
    expect(fallback.split('\n')[0]).toBe('【全局风格】图标风：橙色描边');
  });

  it('styleText 不含主体行', () => {
    const text = styleText(normalizeStyle({ name: '工业风' }));
    expect(text).toBe('【全局风格】工业风');
  });
});
