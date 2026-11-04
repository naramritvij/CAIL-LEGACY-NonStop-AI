import type { MultiDirectedGraph } from "graphology";
import {
  drawGraphLabels,
  graphSelection,
  type GraphSelection,
} from "./graphReadability";

type Point = { x: number; y: number; z: number };
type ScreenPoint = {
  x: number;
  y: number;
  depth: number;
  size: number;
  alpha: number;
};

/** A perspective camera over actual 3D layout coordinates. Software projection
 * keeps orbit, depth and transitions available without WebGL or a GPU. Layout
 * positions are visual coordinates, never a physical location claim. */
export class PerspectiveNetwork {
  private canvas = document.createElement("canvas");
  private ctx: CanvasRenderingContext2D;
  private observer: ResizeObserver;
  private frame = 0;
  private tween = 0;
  private width = 1;
  private height = 1;
  private yaw = 0.25;
  private pitch = -0.16;
  private center: Point = { x: 0, y: 0, z: 0 };
  private fitDistance = 1000;
  private ratio = 1;
  private autoFit = true;
  private selected: string | null = null;
  private selection: GraphSelection | null = null;
  private visible = new Set<string>();
  private focusOnly = false;
  private screen = new Map<string, ScreenPoint>();
  private arrivals = new Map<string, { at: number; side: number }>();
  private arrivalEdges = new Set<string>();
  private arrivalSequence = 0;
  private pointer: {
    x: number;
    y: number;
    lastX: number;
    lastY: number;
    moved: boolean;
    pan: boolean;
    node: string | null;
  } | null = null;
  private events = [
    "nodeAdded",
    "nodeDropped",
    "edgeAdded",
    "edgeDropped",
    "nodeAttributesUpdated",
    "eachNodeAttributesUpdated",
    "edgeAttributesUpdated",
  ] as const;

  constructor(
    private graph: MultiDirectedGraph,
    container: HTMLElement,
    private onSelect: (id: string | null) => void,
    private onRatio: (ratio: number) => void,
    private onDrag: () => void,
    private reduced: boolean,
  ) {
    const ctx = this.canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas is unavailable");
    this.ctx = ctx;
    this.canvas.style.cssText =
      "width:100%;height:100%;display:block;touch-action:none;cursor:grab";
    this.canvas.tabIndex = 0;
    this.canvas.setAttribute(
      "aria-label",
      "3D graph. Arrow keys orbit, plus and minus zoom. Use the node list to select by keyboard.",
    );
    container.appendChild(this.canvas);
    this.observer = new ResizeObserver(() => {
      this.width = Math.max(1, container.clientWidth);
      this.height = Math.max(1, container.clientHeight);
      const dpi = Math.min(2, window.devicePixelRatio || 1);
      this.canvas.width = this.width * dpi;
      this.canvas.height = this.height * dpi;
      ctx.setTransform(dpi, 0, 0, dpi, 0, 0);
      this.refresh();
    });
    this.observer.observe(container);
    for (const event of this.events) graph.on(event, this.refresh);
    this.canvas.addEventListener("pointerdown", this.down);
    this.canvas.addEventListener("pointermove", this.move);
    this.canvas.addEventListener("pointerup", this.up);
    this.canvas.addEventListener("pointercancel", this.cancel);
    this.canvas.addEventListener("wheel", this.wheel, { passive: false });
    this.canvas.addEventListener("keydown", this.key);
    this.canvas.addEventListener("contextmenu", this.menu);
  }

  refresh = () => {
    if (!this.frame) this.frame = requestAnimationFrame(this.draw);
  };
  setView(selected: string | null, visible: Set<string>, focusOnly: boolean) {
    this.selected = selected;
    this.visible = visible;
    this.focusOnly = focusOnly;
    this.selection = graphSelection(this.graph, selected, visible);
    this.updateArrivalEdges();
    this.refresh();
  }
  arrive(ids: string[]) {
    if (this.reduced) return;
    const at = performance.now();
    for (const [index, id] of ids.slice(0, 20).entries())
      this.arrivals.set(id, {
        at: at + index * 45,
        side: this.arrivalSequence++ % 2 ? 1 : -1,
      });
    this.updateArrivalEdges();
    this.refresh();
  }
  private updateArrivalEdges() {
    this.arrivalEdges.clear();
    for (const id of this.arrivals.keys()) {
      const selection = graphSelection(this.graph, id, this.visible);
      for (const edge of selection?.edges ?? []) this.arrivalEdges.add(edge);
    }
  }
  freezeFit() {
    this.autoFit = false;
  }
  private bounds() {
    let minX = Infinity,
      minY = Infinity,
      minZ = Infinity,
      maxX = -Infinity,
      maxY = -Infinity,
      maxZ = -Infinity;
    this.graph.forEachNode((id, a) => {
      if (
        !this.visible.has(id) ||
        (this.focusOnly && this.selection && !this.selection.nodes.has(id))
      )
        return;
      const x = Number(a.x),
        y = Number(a.y),
        z = Number(a.z || 0);
      minX = Math.min(minX, x);
      maxX = Math.max(maxX, x);
      minY = Math.min(minY, y);
      maxY = Math.max(maxY, y);
      minZ = Math.min(minZ, z);
      maxZ = Math.max(maxZ, z);
    });
    if (!Number.isFinite(minX)) return;
    this.center = {
      x: (minX + maxX) / 2,
      y: (minY + maxY) / 2,
      z: (minZ + maxZ) / 2,
    };
    this.fitDistance = Math.max(
      250,
      Math.hypot(maxX - minX, maxY - minY, maxZ - minZ) * 1.65,
    );
  }
  fit() {
    this.autoFit = true;
    this.ratio = 1;
    this.onRatio(1);
    this.refresh();
  }
  zoom(factor: number) {
    this.animate(
      this.center,
      Math.min(8, Math.max(0.025, this.ratio * factor)),
      this.reduced ? 0 : 220,
    );
  }
  focus(id: string, reduced: boolean) {
    const selection = graphSelection(this.graph, id, this.visible);
    if (!selection) return;
    const points = [...selection.nodes].map((key) => {
      const a = this.graph.getNodeAttributes(key);
      return { x: Number(a.x), y: Number(a.y), z: Number(a.z || 0) };
    });
    const center = {
      x:
        (Math.min(...points.map((p) => p.x)) +
          Math.max(...points.map((p) => p.x))) /
        2,
      y:
        (Math.min(...points.map((p) => p.y)) +
          Math.max(...points.map((p) => p.y))) /
        2,
      z:
        (Math.min(...points.map((p) => p.z)) +
          Math.max(...points.map((p) => p.z))) /
        2,
    };
    const radius = Math.max(
      50,
      ...points.map((p) =>
        Math.hypot(p.x - center.x, p.y - center.y, p.z - center.z),
      ),
    );
    const focal = Math.min(this.width, this.height) * 1.4;
    const distance =
      radius *
      (1 + focal / Math.max(50, Math.min(this.width, this.height) / 2 - 90));
    this.animate(
      center,
      Math.max(0.025, distance / this.fitDistance),
      reduced ? 0 : 550,
    );
  }
  private animate(target: Point, targetRatio: number, duration: number) {
    this.autoFit = false;
    cancelAnimationFrame(this.tween);
    const start = { ...this.center },
      ratio = this.ratio,
      at = performance.now();
    const tick = (now: number) => {
      const t = duration ? Math.min(1, (now - at) / duration) : 1,
        p = t * t * (3 - 2 * t);
      this.center = {
        x: start.x + (target.x - start.x) * p,
        y: start.y + (target.y - start.y) * p,
        z: start.z + (target.z - start.z) * p,
      };
      this.ratio = ratio + (targetRatio - ratio) * p;
      this.onRatio(this.ratio);
      this.refresh();
      if (t < 1) this.tween = requestAnimationFrame(tick);
    };
    this.tween = requestAnimationFrame(tick);
  }
  private rotate(point: Point): Point {
    const x = point.x - this.center.x,
      y = point.y - this.center.y,
      z = point.z - this.center.z;
    const rx = x * Math.cos(this.yaw) - z * Math.sin(this.yaw),
      rz = x * Math.sin(this.yaw) + z * Math.cos(this.yaw);
    return {
      x: rx,
      y: y * Math.cos(this.pitch) - rz * Math.sin(this.pitch),
      z: y * Math.sin(this.pitch) + rz * Math.cos(this.pitch),
    };
  }
  private draw = (now: number) => {
    this.frame = 0;
    if (this.autoFit) this.bounds();
    const ctx = this.ctx,
      data = this.graph,
      selected = this.selected;
    const selection = this.selection,
      neighbors = selection?.nodes;
    const focal = Math.min(this.width, this.height) * 1.4,
      distance = this.fitDistance * this.ratio;
    this.screen.clear();
    ctx.clearRect(0, 0, this.width, this.height);
    for (const [id, arrival] of this.arrivals) {
      if (!data.hasNode(id) || now - arrival.at >= 850)
        this.arrivals.delete(id);
    }
    data.forEachNode((id, a) => {
      if (
        !this.visible.has(id) ||
        (this.focusOnly && neighbors && !neighbors.has(id))
      )
        return;
      const point = this.rotate({
        x: Number(a.x),
        y: Number(a.y),
        z: Number(a.z || 0),
      });
      const depth = distance - point.z;
      if (depth < 20) return;
      const size =
        Math.min(
          26,
          Math.max(0.85, Number(a.size) * Math.sqrt(this.fitDistance / depth)),
        ) * (selected === id ? 1.6 : 1);
      let x = this.width / 2 + (point.x * focal) / depth,
        y = this.height / 2 - (point.y * focal) / depth,
        alpha = 1;
      const arrival = this.arrivals.get(id);
      if (arrival) {
        const t = Math.max(0, Math.min(1, (now - arrival.at) / 850)),
          p = 1 - Math.pow(1 - t, 3);
        x = (arrival.side < 0 ? -40 : this.width + 40) * (1 - p) + x * p;
        y = this.height * 0.45 * (1 - p) + y * p;
        alpha = Math.min(1, t * 3);
        if (t === 1) this.arrivals.delete(id);
      }
      this.screen.set(id, { x, y, depth, size, alpha });
    });
    const panned = Boolean(this.pointer?.moved),
      hideBulkEdges = panned && data.order > 5000;
    if (!hideBulkEdges) {
      ctx.beginPath();
      ctx.strokeStyle = selected ? "#e4ebe6" : "#bdd0c4";
      ctx.lineWidth = 0.5;
      ctx.globalAlpha = selected ? 0.3 : 0.32;
      data.forEachEdge((id, _a, source, target) => {
        const a = this.screen.get(source),
          b = this.screen.get(target);
        if (
          !a ||
          !b ||
          selection?.edges.has(id) ||
          (this.arrivalEdges.has(id) &&
            (this.arrivals.has(source) || this.arrivals.has(target)))
        )
          return;
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
      });
      ctx.stroke();
    }
    data.forEachEdge((id, _attributes, source, target) => {
      const a = this.screen.get(source),
        b = this.screen.get(target),
        incident = selection?.edges.has(id);
      const arrival = this.arrivalEdges.has(id)
        ? this.arrivals.get(source) || this.arrivals.get(target)
        : undefined;
      if (!a || !b || (!incident && !arrival)) return;
      const progress = arrival
        ? Math.min(1, Math.max(0, (now - arrival.at - 350) / 500))
        : 1;
      const from = this.arrivals.has(source) ? b : a,
        to = this.arrivals.has(source) ? a : b;
      ctx.globalAlpha = incident ? 0.9 : 0.6;
      ctx.strokeStyle = "#5c9d82";
      ctx.lineWidth = incident ? 1.6 : 1;
      ctx.beginPath();
      ctx.moveTo(from.x, from.y);
      ctx.lineTo(
        from.x + (to.x - from.x) * progress,
        from.y + (to.y - from.y) * progress,
      );
      ctx.stroke();
      const angle = Math.atan2(b.y - a.y, b.x - a.x),
        x = b.x - Math.cos(angle) * (b.size + 2),
        y = b.y - Math.sin(angle) * (b.size + 2);
      if (incident && progress === 1) {
        ctx.fillStyle = "#5c9d82";
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(
          x - Math.cos(angle - 0.4) * 6,
          y - Math.sin(angle - 0.4) * 6,
        );
        ctx.lineTo(
          x - Math.cos(angle + 0.4) * 6,
          y - Math.sin(angle + 0.4) * 6,
        );
        ctx.closePath();
        ctx.fill();
      }
    });
    const sorted = [...this.screen.entries()].sort(
      (a, b) => b[1].depth - a[1].depth,
    );
    for (const [id, point] of sorted) {
      if (
        point.x < -80 ||
        point.x > this.width + 80 ||
        point.y < -40 ||
        point.y > this.height + 40
      )
        continue;
      const attributes = data.getNodeAttributes(id),
        active = neighbors?.has(id),
        dim = neighbors && !active;
      ctx.globalAlpha =
        point.alpha *
        (dim ? 0.16 : Math.max(0.35, Math.min(1, distance / point.depth)));
      const color = String(attributes.color);
      if (point.size > 5) {
        const gradient = ctx.createRadialGradient(
          point.x - point.size * 0.3,
          point.y - point.size * 0.3,
          0,
          point.x,
          point.y,
          point.size,
        );
        gradient.addColorStop(0, "#f2faf4");
        gradient.addColorStop(0.35, color);
        gradient.addColorStop(1, color);
        ctx.fillStyle = gradient;
      } else ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(point.x, point.y, point.size, 0, Math.PI * 2);
      ctx.fill();
      if (id === selected) {
        ctx.strokeStyle = "#26765b";
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(point.x, point.y, point.size + 4, 0, Math.PI * 2);
        ctx.stroke();
      }
    }
    drawGraphLabels(ctx, data, this.screen, selected, selection, this.ratio, {
      width: this.width,
      height: this.height,
    });
    ctx.globalAlpha = 1;
    if (this.arrivals.size) this.refresh();
  };
  private point(event: MouseEvent) {
    const rect = this.canvas.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  }
  private hit(x: number, y: number) {
    let hit: string | null = null,
      depth = Infinity;
    for (const [id, p] of this.screen)
      if (
        Math.hypot(p.x - x, p.y - y) <= Math.max(6, p.size + 3) &&
        p.depth < depth
      ) {
        hit = id;
        depth = p.depth;
      }
    return hit;
  }
  private down = (event: PointerEvent) => {
    if (event.button !== 0 && event.button !== 2) return;
    const p = this.point(event);
    this.canvas.focus();
    cancelAnimationFrame(this.tween);
    this.pointer = {
      ...p,
      lastX: p.x,
      lastY: p.y,
      moved: false,
      pan: event.shiftKey || event.button === 2,
      node: this.hit(p.x, p.y),
    };
    this.canvas.setPointerCapture(event.pointerId);
  };
  private move = (event: PointerEvent) => {
    const pointer = this.pointer,
      p = this.point(event);
    if (!pointer) {
      this.canvas.style.cursor = this.hit(p.x, p.y) ? "pointer" : "grab";
      return;
    }
    if (Math.hypot(p.x - pointer.x, p.y - pointer.y) > 4) pointer.moved = true;
    if (!pointer.moved) return;
    this.autoFit = false;
    const dx = p.x - pointer.lastX,
      dy = p.y - pointer.lastY;
    if (pointer.node && !pointer.pan) {
      this.onDrag();
      const depth =
          this.screen.get(pointer.node)?.depth || this.fitDistance * this.ratio,
        scale = depth / (Math.min(this.width, this.height) * 1.4);
      // Inverse camera rotation maps a screen-plane drag back into 3D world space.
      const sx = dx * scale,
        sy = -dy * scale,
        rz = -sy * Math.sin(this.pitch),
        wy = sy * Math.cos(this.pitch);
      const a = this.graph.getNodeAttributes(pointer.node);
      this.graph.mergeNodeAttributes(pointer.node, {
        x: Number(a.x) + sx * Math.cos(this.yaw) + rz * Math.sin(this.yaw),
        y: Number(a.y) + wy,
        z: Number(a.z || 0) - sx * Math.sin(this.yaw) + rz * Math.cos(this.yaw),
        fixed: true,
      });
    } else if (pointer.pan) {
      const scale =
        (this.fitDistance * this.ratio) /
        (Math.min(this.width, this.height) * 1.4);
      this.center.x -= dx * scale * Math.cos(this.yaw);
      this.center.z += dx * scale * Math.sin(this.yaw);
      this.center.y += dy * scale;
    } else {
      this.yaw += dx * 0.006;
      this.pitch = Math.max(-1.45, Math.min(1.45, this.pitch + dy * 0.006));
    }
    pointer.lastX = p.x;
    pointer.lastY = p.y;
    this.refresh();
  };
  private up = () => {
    if (this.pointer && !this.pointer.moved) this.onSelect(this.pointer.node);
    this.pointer = null;
    this.refresh();
  };
  private cancel = () => {
    this.pointer = null;
    this.refresh();
  };
  private wheel = (event: WheelEvent) => {
    event.preventDefault();
    this.autoFit = false;
    cancelAnimationFrame(this.tween);
    this.ratio = Math.max(
      0.025,
      Math.min(
        8,
        this.ratio *
          Math.exp(Math.max(-0.5, Math.min(0.5, event.deltaY * 0.0015))),
      ),
    );
    this.onRatio(this.ratio);
    this.refresh();
  };
  private key = (event: KeyboardEvent) => {
    if (
      [
        "ArrowLeft",
        "ArrowRight",
        "ArrowUp",
        "ArrowDown",
        "+",
        "=",
        "-",
      ].includes(event.key)
    ) {
      event.preventDefault();
      this.autoFit = false;
      if (event.key === "ArrowLeft") this.yaw -= 0.12;
      if (event.key === "ArrowRight") this.yaw += 0.12;
      if (event.key === "ArrowUp")
        this.pitch = Math.max(-1.45, this.pitch - 0.12);
      if (event.key === "ArrowDown")
        this.pitch = Math.min(1.45, this.pitch + 0.12);
      if (event.key === "+" || event.key === "=") this.zoom(0.8);
      if (event.key === "-") this.zoom(1.25);
      this.refresh();
    }
  };
  private menu = (event: Event) => event.preventDefault();
  kill() {
    cancelAnimationFrame(this.frame);
    cancelAnimationFrame(this.tween);
    this.observer.disconnect();
    for (const event of this.events) this.graph.off(event, this.refresh);
    this.canvas.removeEventListener("pointerdown", this.down);
    this.canvas.removeEventListener("pointermove", this.move);
    this.canvas.removeEventListener("pointerup", this.up);
    this.canvas.removeEventListener("pointercancel", this.cancel);
    this.canvas.removeEventListener("wheel", this.wheel);
    this.canvas.removeEventListener("keydown", this.key);
    this.canvas.removeEventListener("contextmenu", this.menu);
    this.canvas.remove();
  }
}
