declare module "d3-force-3d" {
  export interface SimulationNode {
    id: string;
    x?: number;
    y?: number;
    z?: number;
    fx?: number;
    fy?: number;
    fz?: number;
  }
  export interface SimulationLink {
    source: string | SimulationNode;
    target: string | SimulationNode;
    kind?: string;
  }
  interface Force {
    initialize?: (...args: unknown[]) => void;
  }
  interface PositionForce extends Force {
    strength(value: number): PositionForce;
  }
  interface ChargeForce extends Force {
    strength(value: number): ChargeForce;
    theta(value: number): ChargeForce;
    distanceMax(value: number): ChargeForce;
  }
  interface LinkForce extends Force {
    id(value: (node: SimulationNode) => string): LinkForce;
    distance(value: number | ((link: SimulationLink) => number)): LinkForce;
    strength(value: number): LinkForce;
  }
  interface Simulation {
    stop(): Simulation;
    tick(iterations?: number): Simulation;
    alpha(): number;
    alphaDecay(value: number): Simulation;
    velocityDecay(value: number): Simulation;
    force(name: string, force: Force): Simulation;
  }
  export function forceSimulation(
    nodes: SimulationNode[],
    dimensions: number,
  ): Simulation;
  export function forceLink(links: SimulationLink[]): LinkForce;
  export function forceManyBody(): ChargeForce;
  export function forceX(position: number): PositionForce;
  export function forceY(position: number): PositionForce;
  export function forceZ(position: number): PositionForce;
}
