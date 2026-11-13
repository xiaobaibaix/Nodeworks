import { useEffect, useState } from 'react';
import type { ResourceItem } from '../model/types';
import { useGraph } from '../store';
import { assetUrl } from './AssetPreview';

/** 图片资源在检查器里的内联缩略图：绑定目录时直接读目录里的文件，否则按路径加载。 */
export default function ResourceThumb({
  nodeId,
  resource,
  onOpen,
}: {
  nodeId: string;
  resource: ResourceItem;
  onOpen: () => void;
}) {
  const folderName = useGraph((s) => s.folderName);
  const readFolderAsset = useGraph((s) => s.readFolderAsset);
  const [src, setSrc] = useState<string | null>(null);
  const [broken, setBroken] = useState(false);

  useEffect(() => {
    let alive = true;
    let url: string | null = null;
    setBroken(false);
    setSrc(null);
    void (async () => {
      let blob: Blob | null = null;
      if (folderName) {
        try {
          blob = await readFolderAsset(nodeId, resource);
        } catch {
          blob = null;
        }
      }
      if (!alive) return;
      if (blob) {
        url = URL.createObjectURL(blob);
        setSrc(url);
      } else if (resource.path) {
        setSrc(assetUrl(resource.path));
      } else {
        setBroken(true);
      }
    })();
    return () => {
      alive = false;
      if (url) URL.revokeObjectURL(url);
    };
  }, [nodeId, resource.id, resource.path, resource.file, folderName, readFolderAsset]);

  useEffect(() => {
    setBroken(false);
  }, [src]);

  return (
    <button type="button" className="res-thumb" onClick={onOpen} title="点击放大预览">
      {src && !broken ? (
        <img src={src} alt={resource.label || '资源预览'} onError={() => setBroken(true)} />
      ) : (
        <span>{resource.path || resource.file ? '图片未找到' : '还没有图片'}</span>
      )}
    </button>
  );
}
