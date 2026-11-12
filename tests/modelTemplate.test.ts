import { beforeEach, describe, expect, it } from 'vitest';
import {
  hasSceneSlots, isRigged, modelChecklist, slotOf, slotsPresent, templateResources,
} from '../src/model/modelTemplate';
import type { ResourceItem, UnitNode } from '../src/model/types';
import { useGraph } from '../src/store';
import { resetStore } from './helpers';

function node(resources?: ResourceItem[]): UnitNode {
  return { id: 'n1', title: '模型', props: {}, ports: [], pos: { x: 0, y: 0 }, resources };
}

beforeEach(() => resetStore());

describe('模型通配表', () => {
  it('空节点补齐网格与三张基础贴图', () => {
    const items = templateResources(node(), { rig: false, scene: false });
    expect(items.map((r) => r.slot)).toEqual(['mesh', 'basecolor', 'normal', 'orm']);
    expect(items.find((r) => r.slot === 'orm')?.path).toBe('assets/model_orm.png');
  });

  it('场景件额外补 LOD 与碰撞', () => {
    const items = templateResources(node(), { rig: false, scene: true });
    expect(items.map((r) => r.slot)).toEqual(['mesh', 'basecolor', 'normal', 'orm', 'lod', 'collision']);
  });

  it('已有资源按标签/路径推断槽位，不重复补', () => {
    const n = node([
      { id: 'a', type: 'model', label: '钛矿模型', path: 'assets/ti.glb' },
      { id: 'b', type: 'image', label: 'BaseColor', path: 'assets/ti_basecolor.png' },
      { id: 'c', type: 'image', label: '法线', path: 'assets/ti_normal.png' },
      { id: 'd', type: 'image', label: 'ORM', path: 'assets/ti_orm.png' },
    ]);
    expect(slotOf(n.resources![0])).toBe('mesh');
    expect(templateResources(n, { rig: false, scene: false })).toEqual([]);
    expect(modelChecklist(n).filter((r) => r.state === 'missing')).toEqual([]);
  });

  it('角色标记写在 mesh 资源 meta 上', () => {
    const n = node([
      { id: 'a', type: 'model', label: '角色', path: 'assets/hero.glb', meta: { rigged: true } },
    ]);
    expect(isRigged(n)).toBe(true);
    const rows = modelChecklist(n);
    expect(rows.find((r) => r.key === 'rig')?.state).toBe('ok');
  });
});

describe('store 套用模型通配', () => {
  function seed(): void {
    useGraph.setState({
      graph: { version: 1, nodes: [node()], edges: [], kinds: {} },
      selectedNodes: ['n1'],
    });
  }

  it('一次提交补齐，撤销全部移除', () => {
    seed();
    useGraph.getState().applyModelTemplate('n1', { rig: true, scene: false });
    const after = useGraph.getState().graph.nodes[0];
    expect(after.resources).toHaveLength(4);
    expect(slotsPresent(after).mesh?.meta?.rigged).toBe(true);
    expect(isRigged(after)).toBe(true);
    expect(useGraph.getState().past).toHaveLength(1);

    useGraph.getState().undo();
    expect(useGraph.getState().graph.nodes[0].resources ?? []).toHaveLength(0);
  });

  it('再次套用不重复添加，只更新角色标记', () => {
    seed();
    useGraph.getState().applyModelTemplate('n1', { rig: false, scene: true });
    expect(useGraph.getState().graph.nodes[0].resources).toHaveLength(6);
    const history = useGraph.getState().past.length;

    useGraph.getState().applyModelTemplate('n1', { rig: true, scene: true });
    expect(useGraph.getState().graph.nodes[0].resources).toHaveLength(6);
    expect(isRigged(useGraph.getState().graph.nodes[0])).toBe(true);
    expect(useGraph.getState().past.length).toBe(history + 1);

    useGraph.getState().applyModelTemplate('n1', { rig: true, scene: true });
    expect(useGraph.getState().past.length).toBe(history + 1);
    expect(useGraph.getState().toast).toContain('齐全');
  });

  it('场景件补齐后 hasSceneSlots 为真', () => {
    seed();
    useGraph.getState().applyModelTemplate('n1', { rig: false, scene: true });
    expect(hasSceneSlots(useGraph.getState().graph.nodes[0])).toBe(true);
  });
});
