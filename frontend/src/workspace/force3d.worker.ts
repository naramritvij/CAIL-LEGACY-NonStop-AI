import {
  forceSimulation,
  forceManyBody,
  forceLink,
  forceX,
  forceY,
  forceZ,
  type SimulationNode,
  type SimulationLink,
} from "d3-force-3d";

interface LayoutRequest {
  nodes: SimulationNode[];
  edges: SimulationLink[];
  duration: number;
}
const worker = self as unknown as {
  onmessage: ((event: MessageEvent<LayoutRequest>) => void) | null;
  postMessage: (
    message: { positions: Float32Array; done: boolean },
    transfer: Transferable[],
  ) => void;
};

worker.onmessage = ({ data }) => {
  // Uniform charge avoids giving a 1,000-passage manual an artificial mass of
  // 1,000. High-degree documents can then retain readable passage clouds.
  const simulation = forceSimulation(data.nodes, 3)
    .stop()
    .alphaDecay(0.026)
    .velocityDecay(0.48)
    .force("charge", forceManyBody().strength(-45).theta(0.9).distanceMax(2200))
    .force(
      "links",
      forceLink(data.edges)
        .id((node) => node.id)
        .distance((link) => (link.kind === "contains" ? 130 : 95))
        .strength(0.06),
    )
    .force("x", forceX(0).strength(0.004))
    .force("y", forceY(0).strength(0.004))
    .force("z", forceZ(0).strength(0.004));
  const began = performance.now();
  let sent = 0,
    ticks = 0;
  const step = () => {
    const start = performance.now();
    do {
      simulation.tick();
      ticks++;
    } while (
      performance.now() - start < 18 &&
      ticks < 180 &&
      performance.now() - began < data.duration
    );
    const now = performance.now(),
      done =
        ticks >= 180 ||
        now - began >= data.duration ||
        simulation.alpha() < 0.015;
    if (done || now - sent > 90) {
      const positions = new Float32Array(data.nodes.length * 3);
      data.nodes.forEach((node, index) => {
        positions[index * 3] = node.x || 0;
        positions[index * 3 + 1] = node.y || 0;
        positions[index * 3 + 2] = node.z || 0;
      });
      worker.postMessage({ positions, done }, [positions.buffer]);
      sent = now;
    }
    if (!done) setTimeout(step, 0);
  };
  step();
};
