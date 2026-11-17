import type { Graph } from './types';
import { withResourceContainers } from './resources';
import { enforceSingleInputs } from './inputs';

/** 打开图时的统一迁移：资源收进固定容器、输入端口收敛为单条连线。 */
export function normalizeGraph(graph: Graph): Graph {
  return enforceSingleInputs(withResourceContainers(graph));
}
