import type { MultiDirectedGraph } from "graphology";
import {
  drawGraphLabels,
  graphSelection,
  MAX_HIGHLIGHTED_CONNECTIONS,
  type GraphSelection,
} from "./graphReadability";
import { relationshipColor } from "./semanticPresentation";

type Point = { x: number; y: number; z: number };
type ScreenPoint = {
  x: number;
  y: number;
  depth: number;
  size: number;
  alpha: number;
};
type EdgePath = { id: string; source: string; target: string };
const ENTRY_MS = 1350;
const ORBIT_EDGE_LIMIT = 1800;
const EMPHASIZED = new Set(["wrote", "expert_in", "knows", "learned_from", "guidance_requested", "supports", "contradicts", "supersedes"]);

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
  private edgeArrivals = new Map<string, number>();
  private arrivalSequence = 0;
  private autoOrbit = false;
  private inView = true;
  private hovering = false;
  private orbitTimer = 0;
  private lastOrbit = 0;
  private idleUntil = 0;
  private intersection?: IntersectionObserver;
  private edgeIndex: { all: EdgePath[]; overview: EdgePath[]; emphasized: string[] } | null = null;
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
    for (const event of ["edgeAdded", "edgeDropped", "edgeAttributesUpdated"] as const) graph.on(event, this.invalidateEdges);
    if (typeof IntersectionObserver !== "undefined") {
      this.intersection = new IntersectionObserver(([entry]) => {
        this.inView = entry.isIntersecting;
        this.lastOrbit = 0;
        if (this.inView) this.refresh();
        else this.stopOrbitTimer();
      });
      this.intersection.observe(container);
    }
    document.addEventListener?.("visibilitychange", this.visibility);
    this.canvas.addEventListener("pointerenter", this.enter);
    this.canvas.addEventListener("pointerleave", this.leave);
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
  setReducedMotion(reduced: boolean) {
    this.reduced = reduced;
    if (reduced) {
      this.arrivals.clear();
      this.arrivalEdges.clear();
      this.edgeArrivals.clear();
    }
  }
  setAutoOrbit(enabled: boolean) {
    this.autoOrbit = enabled && !this.reduced;
    this.lastOrbit = 0;
    if (!this.autoOrbit) this.stopOrbitTimer();
    this.refresh();
  }
  private invalidateEdges = () => { this.edgeIndex = null; };
  private stopOrbitTimer() {
    if (this.orbitTimer) window.clearTimeout(this.orbitTimer);
    this.orbitTimer = 0;
  }
  private visibility = () => {
    this.lastOrbit = 0;
    if (document.hidden) this.stopOrbitTimer();
    else this.refresh();
  };
  private enter = () => {
    this.hovering = true;
    this.lastOrbit = 0;
    this.stopOrbitTimer();
    this.refresh();
  };
  private leave = () => {
    this.hovering = false;
    this.refresh();
  };
  private canOrbit() {
    return this.autoOrbit && this.visible.size > 1 && this.inView && !document.hidden &&
      !this.hovering && !this.pointer && !this.selection && !this.arrivals.size && !this.edgeArrivals.size;
  }
  private scheduleOrbit(now: number) {
    if (!this.canOrbit() || this.orbitTimer) return;
    this.orbitTimer = window.setTimeout(() => {
      this.orbitTimer = 0;
      this.refresh();
    }, Math.max(this.graph.order > 5000 ? 42 : 25, this.idleUntil - now));
  }
  private edgesToPaint() {
    if (this.edgeIndex) return this.edgeIndex;
    const all: EdgePath[] = [];
    const emphasized: string[] = [];
    this.graph.forEachEdge((id, attributes, source, target) => {
      all.push({ id, source, target });
      if (emphasized.length < 120 && EMPHASIZED.has(String(attributes.kind))) emphasized.push(id);
    });
    const stride = Math.max(1, Math.ceil(all.length / ORBIT_EDGE_LIMIT));
    this.edgeIndex = {
      all,
      overview: stride === 1 ? all : all.filter((_, index) => index % stride === 0),
      emphasized,
    };
    return this.edgeIndex;
  }
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
    for (const [index, id] of ids.slice(0, 20).entries()) {
      if (this.arrivals.size >= 20) break;
      this.arrivals.set(id, { at: at + index * 45, side: this.arrivalSequence++ % 2 ? 1 : -1 });
    }
    this.updateArrivalEdges();
    this.refresh();
  }
  arriveEdges(ids: string[]) {
    if (this.reduced) return;
    const at = performance.now();
    for (const id of ids.slice(0, MAX_HIGHLIGHTED_CONNECTIONS)) {
      if (this.edgeArrivals.size >= MAX_HIGHLIGHTED_CONNECTIONS) break;
      this.edgeArrivals.set(id, at);
    }
    this.refresh();
  }
  private updateArrivalEdges() {
    this.arrivalEdges.clear();
    // Keep one primary connection per arriving document before filling the budget.
    const groups = [...this.arrivals.keys()].map((id) => [
      ...(graphSelection(this.graph, id, this.visible)?.edges ?? []),
    ]);
    for (const [primary] of groups) if (primary) this.arrivalEdges.add(primary);
    for (const group of groups) {
      for (const edge of group) {
        if (this.arrivalEdges.size >= MAX_HIGHLIGHTED_CONNECTIONS) return;
        this.arrivalEdges.add(edge);
      }
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
    this.idleUntil = performance.now() + 1200;
    this.animate(
      this.center,
      Math.min(8, Math.max(0.025, this.ratio * factor)),
      this.reduced ? 0 : 220,
    );
  }
  focus(id: string, reduced: boolean, single = false) {
    if (!this.graph.hasNode(id) || !this.visible.has(id)) return;
    const selection = graphSelection(this.graph, id, this.visible);
    if (!selection) return;
    const points = (single ? [id] : [...selection.nodes]).map((key) => {
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
  private draw = (now: number) => {
    this.frame = 0;
    if (this.autoFit) this.bounds();
    const orbiting = this.canOrbit() && now >= this.idleUntil;
    if (orbiting && this.lastOrbit) this.yaw += Math.min(80, now - this.lastOrbit) * 0.00018;
    this.lastOrbit = orbiting ? now : 0;
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
      if (!data.hasNode(id) || now - arrival.at >= ENTRY_MS)
        this.arrivals.delete(id);
    }
    if (this.arrivalEdges.size && !this.arrivals.size) this.arrivalEdges.clear();
    for (const [id, at] of this.edgeArrivals)
      if (!data.hasEdge(id) || now - at > 900) this.edgeArrivals.delete(id);
    const cy = Math.cos(this.yaw), sy = Math.sin(this.yaw),
      cp = Math.cos(this.pitch), sp = Math.sin(this.pitch);
    data.forEachNode((id, a) => {
      if (
        !this.visible.has(id) ||
        (this.focusOnly && neighbors && !neighbors.has(id))
      )
        return;
      const x0 = Number(a.x) - this.center.x, y0 = Number(a.y) - this.center.y,
        z0 = Number(a.z || 0) - this.center.z;
      const rz = x0 * sy + z0 * cy;
      const point = { x: x0 * cy - z0 * sy, y: y0 * cp - rz * sp, z: y0 * sp + rz * cp };
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
        const t = Math.max(0, Math.min(1, (now - arrival.at) / ENTRY_MS)),
          p = 1 - Math.pow(1 - t, 3);
        x = (arrival.side < 0 ? -40 : this.width + 40) * (1 - p) + x * p;
        y = this.height * (arrival.side < 0 ? 0.36 : 0.62) * (1 - p) + y * p;
        alpha = Math.min(1, t * 5);
        if (t === 1) this.arrivals.delete(id);
      }
      this.screen.set(id, { x, y, depth, size, alpha });
    });
    const panned = Boolean(this.pointer?.moved),
      hideBulkEdges = panned && data.order > 5000;
    const paint = this.edgesToPaint();
    if (!hideBulkEdges) {
      ctx.beginPath();
      ctx.strokeStyle = selected ? "#e4ebe6" : "#bdd0c4";
      ctx.lineWidth = 0.5;
      ctx.globalAlpha = selected ? 0.3 : 0.43;
      for (const { id, source, target } of orbiting ? paint.overview : paint.all) {
        const a = this.screen.get(source),
          b = this.screen.get(target);
        if (
          !a ||
          !b ||
          selection?.edges.has(id) ||
          (this.arrivalEdges.has(id) &&
            (this.arrivals.has(source) || this.arrivals.has(target)))
        )
          continue;
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
      }
      ctx.stroke();
    }
    const foreground = new Set([
      ...(selection?.edges || paint.emphasized),
      ...this.arrivalEdges,
      ...this.edgeArrivals.keys(),
    ]);
    for (const id of foreground) {
      if (!data.hasEdge(id)) continue;
      const [source, target] = data.extremities(id);
      const attributes = data.getEdgeAttributes(id);
      const a = this.screen.get(source),
        b = this.screen.get(target),
        incident = selection?.edges.has(id);
      const arrival = this.arrivalEdges.has(id)
        ? this.arrivals.get(source) || this.arrivals.get(target)
        : undefined;
      const introduced = this.edgeArrivals.get(id);
      const meaningful = !selection && EMPHASIZED.has(String(attributes.kind));
      if (!a || !b || (!incident && !arrival && introduced === undefined && !meaningful)) continue;
      const progress = arrival
        ? Math.min(1, Math.max(0, (now - arrival.at - 480) / 850))
        : introduced !== undefined
          ? Math.min(1, Math.max(0, (now - introduced) / 850))
          : 1;
      const from = this.arrivals.has(source) ? b : a,
        to = this.arrivals.has(source) ? a : b;
      const edgeColor =
        incident && selection?.trail
          ? "#9073b1"
          : relationshipColor(String(attributes.kind));
      ctx.globalAlpha = incident || arrival ? 0.94 : 0.7;
      ctx.strokeStyle = edgeColor;
      ctx.lineWidth = incident && selection?.trail ? 2.4 : incident ? 1.6 : 1.1;
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
      if ((incident || meaningful) && progress === 1) {
        ctx.fillStyle = edgeColor;
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
    }
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
        gradient.addColorStop(0, "#ffffff");
        gradient.addColorStop(0.48, color);
        gradient.addColorStop(1, color);
        ctx.fillStyle = gradient;
      } else ctx.fillStyle = color;
      ctx.beginPath();
      const type = attributes.entity_type;
      const sides =
        type === "command"
          ? 4
          : type === "event"
            ? 3
            : type === "subsystem"
              ? 6
              : type === "expert_note"
                ? 4
                : 0;
      if (sides) {
        for (let i = 0; i <= sides; i++) {
          const angle = (i * Math.PI * 2) / sides - Math.PI / 2;
          const x = point.x + Math.cos(angle) * point.size * 1.2,
            y = point.y + Math.sin(angle) * point.size * 1.2;
          if (i) ctx.lineTo(x, y);
          else ctx.moveTo(x, y);
        }
        ctx.closePath();
      } else ctx.arc(point.x, point.y, point.size, 0, Math.PI * 2);
      ctx.fill();
      if (id === selected || this.arrivals.has(id)) {
        ctx.strokeStyle = this.arrivals.has(id) ? "#28a680" : "#126c50";
        ctx.lineWidth = 2;
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
    if (this.arrivals.size || this.edgeArrivals.size) this.refresh();
    this.scheduleOrbit(now);
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
    this.idleUntil = performance.now() + 1200;
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
      this.idleUntil = performance.now() + 1200;
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
    this.stopOrbitTimer();
    this.intersection?.disconnect();
    document.removeEventListener?.("visibilitychange", this.visibility);
    cancelAnimationFrame(this.frame);
    cancelAnimationFrame(this.tween);
    this.observer.disconnect();
    for (const event of this.events) this.graph.off(event, this.refresh);
    for (const event of ["edgeAdded", "edgeDropped", "edgeAttributesUpdated"] as const) this.graph.off(event, this.invalidateEdges);
    this.canvas.removeEventListener("pointerenter", this.enter);
    this.canvas.removeEventListener("pointerleave", this.leave);
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
