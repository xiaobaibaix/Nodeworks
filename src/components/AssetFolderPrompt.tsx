import { useGraph } from '../store';

/** 打开单个项目文件后发现资源只在目录里时，引导绑定原项目文件夹。 */
export default function AssetFolderPrompt() {
  const count = useGraph((s) => s.assetPrompt);
  const dismiss = useGraph((s) => s.dismissAssetPrompt);
  const openFolder = useGraph((s) => s.openFolder);
  if (!count) return null;
  return (
    <div className="asset-prompt" role="dialog" aria-label="资源文件夹">
      <div className="card">
        <h3>这个项目登记了 {count} 个资源引用</h3>
        <p>
          单文件只保存路径，图片/模型文件本身在项目文件夹里。选择当初导出的那个文件夹（含
          <code>project.json</code>），就能直接预览。
        </p>
        <div className="actions">
          <button className="primary" onClick={() => void openFolder()}>
            选择项目文件夹…
          </button>
          <button onClick={dismiss}>仅查看数据</button>
        </div>
        <div className="hint">也可以随时用工具栏「打开」选择文件夹。</div>
      </div>
    </div>
  );
}
