import { describe, expect, it } from 'vitest';
import {
  diffGraphs, isDiffEmpty, loadSnapshots, newSnapshot, persistSnapshots, pushSnapshot,
  SNAPSHOT_LIMIT,
} from '../src/model/snapshot';
import type { Graph } from '../src/model/types';

function base(): Graph {
  return {
    version: 1,
    kinds: {},
    nodes: [
      {
        id: 'a', title: 'A', props: { value: { value: 1, type: 'number' } },
        ports: [
          { id: 'ao', dir: 'out', label: '出', capacity: 'many' },
          { id: 'ai', dir: 'in', label: '入', capacity: 'many' },
        ],
        pos: { x: 0, y: 0 },
      },
      {
        id: 'b', title: 'B', props: {},
        ports: [
          { id: 'bi', dir: 'in', label: '入', capacity: 'many' },
          { id: 'bo', dir: 'out', label: '出', capacity: 'many' },
        ],
        pos: { x: 300, y: 0 },
      },
    ],
    edges: [{ id: 'e1', from: { node: 'a', port: 'ao' }, to: { node: 'b', port: 'bi' }, label: '2:1' }],
  };
}

const clone = (g: Graph): Graph => JSON.parse(JSON.stringify(g)) as Graph;

describe('diffGraphs', () => {
  it('相同图没有任何差异', () => {
    const diff = diffGraphs(base(), base());
    expect(isDiffEmpty(diff)).toBe(true);
    expect(diff.nodesChanged).toBe(0);
  });

  it('识别新增、删除节点与连线', () => {
    const next = clone(base());
    next.nodes.push({ id: 'c', title: 'C', props: {}, ports: [], pos: { x: 600, y: 0 } });
    next.edges.pop();
    const diff = diffGraphs(base(), next);
    expect(diff.nodesAdded).toBe(1);
    expect(diff.nodesRemoved).toBe(0);
    expect(diff.edgesRemoved).toBe(1);

    const removed = clone(base());
    removed.nodes = removed.nodes.filter((n) => n.id !== 'b');
    const diff2 = diffGraphs(base(), removed);
    expect(diff2.nodesRemoved).toBe(1);
  });

  it('识别标题、属性与位置变化', () => {
    const next = clone(base());
    next.nodes[0].title = 'A2';
    next.nodes[0].props.value.value = 5;
    next.nodes[1].pos = { x: 300, y: 120 };
    const diff = diffGraphs(base(), next);
    expect(diff.nodesChanged).toBe(2);
    expect(diff.movedNodes).toBe(1);
    expect(diff.titleChanges).toEqual([{ nodeId: 'a', from: 'A', to: 'A2' }]);
    expect(diff.propChanges).toHaveLength(1);
    expect(diff.propChanges[0]).toMatchObject({ nodeId: 'a', prop: 'value', from: 1, to: 5 });
  });

  it('按端点识别连线修改与删除', () => {
    const next = clone(base());
    next.edges[0].label = '3:1';
    const diff = diffGraphs(base(), next);
    expect(diff.edgesChanged).toBe(1);
    expect(diff.edgesAdded).toBe(0);
  });
});

describe('快照存储', () => {
  it('newSnapshot 做深拷贝，不跟随之后的数据修改', () => {
    const g = base();
    const snap = newSnapshot(g, '基线', 100);
    g.nodes[0].title = '改过';
    expect(snap.graph.nodes[0].title).toBe('A');
    expect(snap.label).toBe('基线');
    expect(snap.at).toBe(100);
  });

  it('pushSnapshot 最新在前并遵守上限', () => {
    let list: ReturnType<typeof newSnapshot>[] = [];
    for (let i = 0; i < SNAPSHOT_LIMIT + 5; i += 1) {
      list = pushSnapshot(list, newSnapshot(base(), `s${i}`, 1000 + i));
    }
    expect(list).toHaveLength(SNAPSHOT_LIMIT);
    expect(list[0].label).toBe(`s${SNAPSHOT_LIMIT + 4}`);
  });

  it('node 环境没有 localStorage 时安全降级', () => {
    expect(loadSnapshots()).toEqual([]);
    expect(persistSnapshots([])).toBe(false);
  });
});
