import type { MultiDirectedGraph } from "graphology";

export class Force3DLayout {
  private worker: Worker | null = null;
  constructor(
    private graph: MultiDirectedGraph,
    private duration: number,
    private done: () => void,
  ) {}
  start() {
    if (this.worker) return;
    const nodes = this.graph.mapNodes((id, attributes) => ({
      id,
      x: Number(attributes.x),
      y: Number(attributes.y),
      z: Number(attributes.z || 0),
      ax: Number(attributes.ax || 0),
      ay: Number(attributes.ay || 0),
      az: Number(attributes.az || 0),
      ...(attributes.fixed
        ? {
            fx: Number(attributes.x),
            fy: Number(attributes.y),
            fz: Number(attributes.z || 0),
          }
        : {}),
    }));
    const indices = new Map(nodes.map((node, index) => [node.id, index]));
    const edges = this.graph.mapEdges((_id, attributes, source, target) => ({
      source,
      target,
      kind: String(attributes.kind || ""),
    }));
    const worker = new Worker(new URL("./force3d.worker.ts", import.meta.url), {
      type: "module",
    });
    this.worker = worker;
    worker.onmessage = ({
      data,
    }: MessageEvent<{ positions: Float32Array; done: boolean }>) => {
      if (this.worker !== worker) return;
      this.graph.updateEachNodeAttributes(
        (id, attributes) => {
          const index = indices.get(id);
          if (index === undefined) return attributes;
          const offset = index * 3,
            [x, y, z] = [
              data.positions[offset],
              data.positions[offset + 1],
              data.positions[offset + 2],
            ];
          return Number.isFinite(x + y + z)
            ? { ...attributes, x, y, z }
            : attributes;
        },
        { attributes: ["x", "y", "z"] },
      );
      if (data.done) {
        this.stop();
        this.done();
      }
    };
    worker.onerror = () => {
      this.stop();
      this.done();
    };
    worker.postMessage({ nodes, edges, duration: this.duration });
  }
  stop() {
    if (this.worker) {
      this.worker.onmessage = null;
      this.worker.terminate();
      this.worker = null;
    }
  }
  kill() {
    this.stop();
  }
}
