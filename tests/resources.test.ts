import { beforeEach, describe, expect, it } from 'vitest';
import { GraphSchema } from '../src/model/schema';
import { graphOf, useGraph } from '../src/store';
import { resetStore } from './helpers';

beforeEach(() => resetStore());

describe('资源项容器', () => {
  it('可以按类型动态添加图片/模型资源，并写入节点', () => {
    const store = useGraph.getState();
    store.addNode({ x: 0, y: 0 });
    const id = useGraph.getState().graph.nodes[0].id;

    useGraph.getState().addResource(id, 'image');
    useGraph.getState().addResource(id, 'model');
    const node = graphOf(useGraph.getState()).nodes[0];
    expect(node.resources).toHaveLength(2);
    expect(node.resources!.map((r) => r.type)).toEqual(['image', 'model']);
    expect(node.resources![0].path).toBe('assets/icon.png');

    // 两次添加各一条历史
    expect(useGraph.getState().past).toHaveLength(3);
    useGraph.getState().undo();
    expect(graphOf(useGraph.getState()).nodes[0].resources).toHaveLength(1);
  });

  it('改名/改路径/改类型都走 commit，连续修改合并为一条历史', () => {
    useGraph.getState().addNode({ x: 0, y: 0 });
    const id = useGraph.getState().graph.nodes[0].id;
    useGraph.getState().addResource(id, 'image');
    const rid = graphOf(useGraph.getState()).nodes[0].resources![0].id;

    useGraph.getState().setResource(id, rid, { label: '钛矿图标' });
    useGraph.getState().setResource(id, rid, { label: '钛矿图标 2' });
    const node = graphOf(useGraph.getState()).nodes[0];
    expect(node.resources![0].label).toBe('钛矿图标 2');
    expect(useGraph.getState().past).toHaveLength(3); // 新建单元 + 添加资源项 + 合并后的“改资源项”

    useGraph.getState().undo();
    expect(graphOf(useGraph.getState()).nodes[0].resources![0].label).toBe('图标');
  });

  it('删除资源项可撤销，并清理空数组', () => {
    useGraph.getState().addNode({ x: 0, y: 0 });
    const id = useGraph.getState().graph.nodes[0].id;
    useGraph.getState().addResource(id, 'model');
    const rid = graphOf(useGraph.getState()).nodes[0].resources![0].id;
    useGraph.getState().removeResource(id, rid);
    expect(graphOf(useGraph.getState()).nodes[0].resources).toBeUndefined();
    useGraph.getState().undo();
    expect(graphOf(useGraph.getState()).nodes[0].resources![0].id).toBe(rid);
  });

  it('schema 接受资源数组，拒绝未知类型', () => {
    const graph = {
      version: 1,
      nodes: [
        {
          id: 'n1',
          title: '甲',
          props: {},
          ports: [],
          pos: { x: 0, y: 0 },
          resources: [{ id: 'r1', type: 'image', label: '图标', path: 'assets/a.png' }],
        },
      ],
      edges: [],
      kinds: {},
    };
    expect(GraphSchema.safeParse(graph).success).toBe(true);
    const bad = { ...graph, nodes: [{ ...graph.nodes[0], resources: [{ id: 'r', type: 'video', label: '', path: '' }] }] };
    expect(GraphSchema.safeParse(bad).success).toBe(false);
  });
});

describe('assetUrl', () => {
  it('相对路径按站点根解析，绝对地址原样保留', async () => {
    const { assetUrl } = await import('../src/components/AssetPreview');
    expect(assetUrl('assets/icon.png')).toBe('/assets/icon.png');
    expect(assetUrl('./assets/a b.png')).toBe('/assets/a b.png');
    expect(assetUrl('/assets/x.glb')).toBe('/assets/x.glb');
    expect(assetUrl('https://cdn.example.com/a.png')).toBe('https://cdn.example.com/a.png');
    expect(assetUrl('data:image/png;base64,AAA')).toBe('data:image/png;base64,AAA');
    expect(assetUrl('')).toBe('');
  });
});
