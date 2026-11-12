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
    expect(normalizeStyle({ name: '工业风', description: 42, rules: '正视角', extra: 1 })).toEqual({
      name: '工业风',
      description: '',
      rules: '正视角',
      avoid: '',
    });
  });

  it('isEmptyStyle 只把全空（含空白）视为空', () => {
    expect(isEmptyStyle(EMPTY_STYLE)).toBe(true);
    expect(isEmptyStyle({ ...EMPTY_STYLE, avoid: '  ' })).toBe(true);
    expect(isEmptyStyle({ ...EMPTY_STYLE, name: '工业风' })).toBe(false);
  });

  it('只有图片和模型需要描述词', () => {
    expect(wantsPrompt('image')).toBe(true);
    expect(wantsPrompt('model')).toBe(true);
    expect(wantsPrompt('audio')).toBe(false);
    expect(wantsPrompt('other')).toBe(false);
  });

  it('composePrompt 先全局风格后单条描述，风格为空时只留主体', () => {
    const text = composePrompt(
      { name: '低多边形工业风', description: '冷灰金属', rules: '俯视 45°，纯色背景', avoid: '写实照片' },
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

  it('styleText 不含主体行', () => {
    const text = styleText({ name: '工业风', description: '', rules: '', avoid: '' });
    expect(text).toBe('【全局风格】工业风');
  });
});
