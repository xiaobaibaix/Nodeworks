import { useEffect, useRef, useState } from 'react';
import type { ResourceItem } from '../model/types';
import { useGraph } from '../store';

/** 相对路径按站点根解析；绝对 URL / data: 原样使用。 */
export function assetUrl(path: string): string {
  if (!path) return '';
  if (/^(https?:|data:|blob:)/.test(path)) return path;
  return `/${path.replace(/^\.?\//, '')}`;
}

interface TreeNode {
  name: string;
  kind: string;
  detail?: string;
  children: TreeNode[];
}

interface MatInfo {
  name: string;
  color: string;
  metalness?: number;
  roughness?: number;
  emissive?: string;
  transparent: boolean;
  opacity: number;
  doubleSided: boolean;
  textures: { slot: string; label: string; thumb: string | null }[];
}

interface Stats {
  nodes: number;
  meshes: number;
  triangles: number;
  materials: number;
  textures: number;
  animations: string[];
}

const SLOT_LABEL: Record<string, string> = {
  map: '基础色',
  normalMap: '法线',
  roughnessMap: '粗糙度',
  metalnessMap: '金属度',
  aoMap: 'AO',
  emissiveMap: '自发光',
  alphaMap: '透明',
};

function textureThumb(tex: { image?: unknown } | null): string | null {
  const img = tex?.image as CanvasImageSource | undefined;
  if (!img) return null;
  try {
    const c = document.createElement('canvas');
    c.width = 48;
    c.height = 48;
    const ctx = c.getContext('2d');
    if (!ctx) return null;
    ctx.drawImage(img, 0, 0, 48, 48);
    return c.toDataURL('image/png');
  } catch {
    return null;
  }
}

function Tree({ node }: { node: TreeNode }) {
  if (!node.children.length) {
    return <li className="tree-leaf">{node.name}<span className="tree-kind">{node.kind}{node.detail ? ` · ${node.detail}` : ''}</span></li>;
  }
  return (
    <li>
      <details open>
        <summary>{node.name}<span className="tree-kind">{node.kind}{node.detail ? ` · ${node.detail}` : ''}</span></summary>
        <ul>
          {node.children.map((c, i) => <Tree key={`${c.name}-${i}`} node={c} />)}
        </ul>
      </details>
    </li>
  );
}

function ModelPane({ url, buffer, fileName }: { url?: string; buffer?: ArrayBuffer; fileName: string }) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tree, setTree] = useState<TreeNode | null>(null);
  const [materials, setMaterials] = useState<MatInfo[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [playing, setPlaying] = useState(false);
  const [spin, setSpin] = useState(false);
  const controlsRef = useRef<import('three/examples/jsm/controls/OrbitControls.js').OrbitControls | null>(null);
  const mixerRef = useRef<{ update: (dt: number) => void; dispose: () => void } | null>(null);
  const playRef = useRef(false);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    let disposed = false;
    let raf = 0;
    let renderer: import('three').WebGLRenderer | null = null;
    let controls: import('three/examples/jsm/controls/OrbitControls.js').OrbitControls | null = null;
    let resizeObs: ResizeObserver | null = null;

    setLoading(true);
    setError(null);

    (async () => {
      const THREE = await import('three');
      const [{ GLTFLoader }, { OrbitControls }] = await Promise.all([
        import('three/examples/jsm/loaders/GLTFLoader.js'),
        import('three/examples/jsm/controls/OrbitControls.js'),
      ]);
      if (disposed) return;

      const scene = new THREE.Scene();
      const camera = new THREE.PerspectiveCamera(50, 1, 0.01, 2000);
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
      renderer.toneMapping = THREE.ACESFilmicToneMapping;
      renderer.domElement.className = 'model-canvas';
      host.innerHTML = '';
      host.appendChild(renderer.domElement);

      scene.add(new THREE.HemisphereLight(0xffffff, 0x3a4150, 2.2));
      const key = new THREE.DirectionalLight(0xffffff, 2.4);
      key.position.set(5, 9, 6);
      scene.add(key);
      const fill = new THREE.DirectionalLight(0x8fb4ff, 0.7);
      fill.position.set(-6, 3, -5);
      scene.add(fill);

      controls = new OrbitControls(camera, renderer.domElement);
      controls.enableDamping = true;
      controls.dampingFactor = 0.08;
      controls.autoRotateSpeed = 1.4;
      controlsRef.current = controls;

      const resize = () => {
        const w = host.clientWidth;
        const h = host.clientHeight;
        if (!w || !h || !renderer) return;
        renderer.setSize(w, h, false);
        camera.aspect = w / h;
        camera.updateProjectionMatrix();
      };
      resizeObs = new ResizeObserver(resize);
      resizeObs.observe(host);

      const loader = new GLTFLoader();
      const onLoad = (gltf: { scene: import('three').Object3D; animations?: import('three').AnimationClip[] }) => {
        if (disposed) return;
        const root = gltf.scene;
        scene.add(root);

        const box = new THREE.Box3().setFromObject(root);
        const size = box.getSize(new THREE.Vector3());
        const center = box.getCenter(new THREE.Vector3());
        const maxDim = Math.max(size.x, size.y, size.z) || 1;
        const dist = (maxDim / (2 * Math.tan((Math.PI * camera.fov) / 360))) * 1.9;
        camera.position.copy(center).add(new THREE.Vector3(1, 0.72, 1).normalize().multiplyScalar(dist));
        controls?.target.copy(center);
        controls?.update();

        const span = Math.max(size.x, size.z, maxDim);
        const grid = new THREE.GridHelper(span * 3, 20, 0x2b3442, 0x1c232d);
        grid.position.set(center.x, box.min.y - 0.001, center.z);
        scene.add(grid);

        const matMap = new Map<string, import('three').Material>();
        let nodes = 0;
        let meshes = 0;
        let triangles = 0;
        const walk = (o: import('three').Object3D): TreeNode => {
          nodes += 1;
          let kind = '组';
          let detail: string | undefined;
          const mesh = o as import('three').Mesh;
          if ((mesh as unknown as { isMesh?: boolean }).isMesh) {
            meshes += 1;
            const tri = mesh.geometry.index ? mesh.geometry.index.count / 3 : (mesh.geometry.attributes.position?.count ?? 0) / 3;
            triangles += Math.round(tri);
            kind = '网格';
            detail = `${Math.round(tri)} 三角面`;
            const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
            for (const m of mats) if (m) matMap.set(m.uuid, m);
          } else if ((o as unknown as { isBone?: boolean }).isBone) {
            kind = '骨骼';
          } else if ((o as unknown as { isSkinnedMesh?: boolean }).isSkinnedMesh) {
            kind = '蒙皮网格';
          } else if ((o as unknown as { isLight?: boolean }).isLight) {
            kind = '灯光';
          } else if (o.type === 'Bone') {
            kind = '骨骼';
          }
          return {
            name: o.name || '(未命名)',
            kind,
            detail,
            children: o.children.map(walk),
          };
        };
        const treeData = walk(root);

        const texSet = new Set<string>();
        const matList: MatInfo[] = [];
        for (const m of matMap.values()) {
          const std = m as import('three').MeshStandardMaterial;
          const textures: MatInfo['textures'] = [];
          for (const slot of Object.keys(SLOT_LABEL)) {
            const t = (m as unknown as Record<string, { image?: unknown; uuid: string } | undefined>)[slot];
            if (t && t.image) {
              texSet.add(t.uuid);
              textures.push({ slot, label: SLOT_LABEL[slot], thumb: textureThumb(t) });
            }
          }
          matList.push({
            name: m.name || '(未命名材质)',
            color: std.color ? `#${std.color.getHexString()}` : '#888888',
            metalness: std.metalness,
            roughness: std.roughness,
            emissive: std.emissive && std.emissive.getHex() ? `#${std.emissive.getHexString()}` : undefined,
            transparent: m.transparent,
            opacity: m.opacity,
            doubleSided: m.side === THREE.DoubleSide,
            textures,
          });
        }

        const anims = (gltf.animations ?? []).map((c) => c.name || '(未命名动画)');
        if (gltf.animations?.length) {
          const mixer = new THREE.AnimationMixer(root);
          mixer.clipAction(gltf.animations[0]).play();
          mixerRef.current = {
            update: (dt: number) => mixer.update(dt),
            dispose: () => {
              mixer.stopAllAction();
              mixer.uncacheRoot(root);
            },
          };
        }

        setTree(treeData);
        setMaterials(matList);
        setStats({
          nodes,
          meshes,
          triangles,
          materials: matMap.size,
          textures: texSet.size,
          animations: anims,
        });
        setLoading(false);
      };

      const onError = (e: unknown) => {
        if (disposed) return;
        setError(e instanceof Error ? e.message : String(e));
        setLoading(false);
      };

      if (buffer) loader.parse(buffer, '', onLoad as never, onError);
      else if (url) loader.load(url, onLoad as never, undefined, onError);
      else onError(new Error('没有可读取的模型文件'));

      const clock = new THREE.Clock();
      const loop = () => {
        if (disposed) return;
        raf = requestAnimationFrame(loop);
        const dt = clock.getDelta();
        controls?.update();
        if (playRef.current) mixerRef.current?.update(dt);
        renderer?.render(scene, camera);
      };
      loop();
    })().catch((e) => {
      if (!disposed) {
        setError(e instanceof Error ? e.message : String(e));
        setLoading(false);
      }
    });

    return () => {
      disposed = true;
      cancelAnimationFrame(raf);
      resizeObs?.disconnect();
      controls?.dispose();
      mixerRef.current?.dispose();
      mixerRef.current = null;
      controlsRef.current = null;
      renderer?.dispose();
      host.innerHTML = '';
    };
  }, [url, buffer]);

  useEffect(() => {
    playRef.current = playing;
  }, [playing]);

  useEffect(() => {
    if (controlsRef.current) controlsRef.current.autoRotate = spin;
  }, [spin]);

  return (
    <div className="model-pane">
      <div className="model-tree-panel">
        <div className="model-panel-head">节点树</div>
        <ul className="model-tree">
          {tree ? <Tree node={tree} /> : <li className="hint">加载中…</li>}
        </ul>
      </div>
      <div className="model-stage">
        <div ref={hostRef} className="model-host" />
        {loading && <div className="model-overlay">正在加载 {fileName}…</div>}
        {error && (
          <div className="model-overlay is-error">
            <strong>模型加载失败</strong>
            <div>{error}</div>
            <div className="hint">.glb 内嵌贴图可直接预览；.gltf 的外部贴图需要同路径可访问。</div>
          </div>
        )}
        {!loading && !error && (
          <div className="model-hud">
            <button className={playing ? 'on' : ''} onClick={() => setPlaying((v) => !v)} disabled={!stats?.animations.length}>
              {playing ? '暂停动画' : `播放动画${stats?.animations.length ? ` (${stats.animations.length})` : ''}`}
            </button>
            <button className={spin ? 'on' : ''} onClick={() => setSpin((v) => !v)}>自动旋转</button>
            <span className="hint">拖动旋转 · 滚轮缩放 · 右键平移</span>
          </div>
        )}
      </div>
      <div className="model-mat-panel">
        <div className="model-panel-head">材质与贴图</div>
        {materials.map((m) => (
          <div className="mat-card" key={m.name}>
            <div className="mat-title">
              <i style={{ background: m.color }} />
              {m.name}
            </div>
            <div className="mat-meta">
              {m.metalness !== undefined && <span>金属 {m.metalness.toFixed(2)}</span>}
              {m.roughness !== undefined && <span>粗糙 {m.roughness.toFixed(2)}</span>}
              {m.emissive && <span>自发光 {m.emissive}</span>}
              {m.transparent && <span>透明 {m.opacity.toFixed(2)}</span>}
              {m.doubleSided && <span>双面</span>}
            </div>
            {m.textures.length > 0 && (
              <div className="mat-textures">
                {m.textures.map((t) => (
                  <div className="tex" key={t.slot} title={t.slot}>
                    {t.thumb ? <img src={t.thumb} alt={t.label} /> : <span className="tex-missing">无预览</span>}
                    <span>{t.label}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}
        {!materials.length && !loading && <div className="hint">没有材质</div>}
      </div>
      {stats && (
        <div className="model-stats">
          <span>{stats.nodes} 节点</span>
          <span>{stats.meshes} 网格</span>
          <span>{stats.triangles.toLocaleString()} 三角面</span>
          <span>{stats.materials} 材质</span>
          <span>{stats.textures} 贴图</span>
          {stats.animations.length > 0 && <span>{stats.animations.length} 动画</span>}
        </div>
      )}
    </div>
  );
}

export default function AssetPreview({ resource, nodeId, onClose }: { resource: ResourceItem; nodeId?: string; onClose: () => void }) {
  const [objectUrl, setObjectUrl] = useState<string | null>(null);
  const [buffer, setBuffer] = useState<ArrayBuffer | null>(null);
  const [fileName, setFileName] = useState('');
  const [imgBroken, setImgBroken] = useState(false);
  const fileRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [onClose]);

  useEffect(() => () => {
    if (objectUrl) URL.revokeObjectURL(objectUrl);
  }, [objectUrl]);

  const isModel = resource.type === 'model';
  const isImage = resource.type === 'image';
  const isAudio = resource.type === 'audio';
  const [folderUrl, setFolderUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!nodeId) return;
    let alive = true;
    let url: string | null = null;
    void (async () => {
      const blob = await useGraph.getState().readFolderAsset(nodeId, resource).catch(() => null);
      if (!alive || !blob) return;
      url = URL.createObjectURL(blob);
      setFolderUrl(url);
    })();
    return () => {
      alive = false;
      if (url) URL.revokeObjectURL(url);
    };
  }, [nodeId, resource.id, resource.file, resource.path]);

  const direct = folderUrl ?? assetUrl(resource.path);

  useEffect(() => {
    setImgBroken(false);
  }, [direct]);

  const pick = async (file: File) => {
    setFileName(file.name);
    if (isModel) {
      setBuffer(await file.arrayBuffer());
    } else {
      if (objectUrl) URL.revokeObjectURL(objectUrl);
      setObjectUrl(URL.createObjectURL(file));
    }
  };

  return (
    <div className="asset-modal" role="dialog" aria-label={`${resource.label} 预览`} onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="asset-box">
        <header>
          <div>
            <h2>{resource.label || '资源预览'}</h2>
            <div className="hint">{resource.type} · {resource.path || '（未填路径）'}</div>
          </div>
          <div className="asset-actions">
            <button onClick={() => fileRef.current?.click()}>
              选择本地{isImage ? '图片' : isModel ? '模型' : '文件'}…
            </button>
            <button className="icon" onClick={onClose} title="关闭">×</button>
          </div>
        </header>
        <input
          ref={fileRef}
          type="file"
          hidden
          accept={isImage ? 'image/*' : isModel ? '.glb,.gltf,model/*' : undefined}
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void pick(f);
          }}
        />
        <div className="asset-body">
          {isModel ? (
            <ModelPane url={objectUrl ?? (direct || undefined)} buffer={buffer ?? undefined} fileName={fileName || resource.path || 'model'} />
          ) : isImage ? (
            <div className="image-pane">
              {(objectUrl || direct) && !imgBroken ? (
                <img src={objectUrl ?? direct} alt={resource.label} onError={() => setImgBroken(true)} />
              ) : (
                <div className="hint">
                  {direct ? <>无法读取 <code>{resource.path}</code>，选一张本地图片预览。</> : '没有路径，选一张本地图片预览。'}
                </div>
              )}
            </div>
          ) : isAudio ? (
            <div className="audio-pane">
              {direct ? <audio controls src={objectUrl ?? direct} /> : <div className="hint">没有路径，选一个本地音频文件。</div>}
            </div>
          ) : (
            <div className="hint">该类型暂无可视化预览，路径：{resource.path || '（空）'}</div>
          )}
        </div>
      </div>
    </div>
  );
}
