import type { MultiDirectedGraph } from "graphology";

// A CPU renderer for browsers without WebGL. It shares the same graph and
// background layout as Sigma, without creating a DOM element for every node.
export class CanvasNetwork {
  private canvas = document.createElement("canvas");
  private context: CanvasRenderingContext2D;
  private observer: ResizeObserver;
  private frame = 0;
  private tween = 0;
  private width = 1;
  private height = 1;
  private scale = 1;
  private camera = { x: 0, y: 0, ratio: 1 };
  private autoFit = true;
  private selected: string | null = null;
  private visible = new Set<string>();
  private focusOnly = false;
  private screen = new Map<string, { x: number; y: number; size: number }>();
  private pointer: {
    x: number;
    y: number;
    lastX: number;
    lastY: number;
    node: string | null;
    moved: boolean;
  } | null = null;
  private readonly events = [
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
  ) {
    const context = this.canvas.getContext("2d");
    if (!context) throw new Error("Canvas is unavailable");
    this.context = context;
    this.canvas.style.cssText =
      "width:100%;height:100%;display:block;touch-action:none";
    container.appendChild(this.canvas);
    this.observer = new ResizeObserver(() => {
      this.width = Math.max(1, container.clientWidth);
      this.height = Math.max(1, container.clientHeight);
      const pixelRatio = Math.min(2, window.devicePixelRatio || 1);
      this.canvas.width = this.width * pixelRatio;
      this.canvas.height = this.height * pixelRatio;
      this.context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
      this.refresh();
    });
    this.observer.observe(container);
    for (const event of this.events) graph.on(event, this.refresh);
    this.canvas.addEventListener("wheel", this.wheel, { passive: false });
    this.canvas.addEventListener("pointerdown", this.down);
    this.canvas.addEventListener("pointermove", this.move);
    this.canvas.addEventListener("pointerup", this.up);
    this.canvas.addEventListener("pointercancel", this.cancel);
    this.canvas.addEventListener("dblclick", this.doubleClick);
  }

  refresh = () => {
    if (!this.frame) this.frame = requestAnimationFrame(this.draw);
  };

  setView(selected: string | null, visible: Set<string>, focusOnly: boolean) {
    this.selected = selected;
    this.visible = visible;
    this.focusOnly = focusOnly;
    this.refresh();
  }

  private bounds() {
    let minX = Infinity,
      maxX = -Infinity,
      minY = Infinity,
      maxY = -Infinity;
    this.graph.forEachNode((_id, attributes) => {
      const x = Number(attributes.x),
        y = Number(attributes.y);
      minX = Math.min(minX, x);
      maxX = Math.max(maxX, x);
      minY = Math.min(minY, y);
      maxY = Math.max(maxY, y);
    });
    if (!Number.isFinite(minX)) return;
    this.camera.x = (minX + maxX) / 2;
    this.camera.y = (minY + maxY) / 2;
    this.scale = Math.min(
      Math.max(1, this.width - 100) / Math.max(100, maxX - minX),
      Math.max(1, this.height - 100) / Math.max(100, maxY - minY),
    );
  }

  fit() {
    this.autoFit = true;
    this.camera.ratio = 1;
    this.onRatio(1);
    this.refresh();
  }

  freezeFit() {
    this.autoFit = false;
  }

  zoom(factor: number) {
    this.animate({
      ...this.camera,
      ratio: Math.min(8, Math.max(0.006, this.camera.ratio * factor)),
    });
  }

  focus(id: string, reduced: boolean) {
    if (!this.graph.hasNode(id)) return;
    this.animate(
      {
        x: Number(this.graph.getNodeAttribute(id, "x")),
        y: Number(this.graph.getNodeAttribute(id, "y")),
        ratio: Math.min(0.18, this.camera.ratio),
      },
      reduced ? 0 : 400,
    );
  }

  private animate(target: typeof this.camera, duration = 180) {
    this.autoFit = false;
    cancelAnimationFrame(this.tween);
    const start = { ...this.camera },
      began = performance.now();
    const tick = (now: number) => {
      const t = duration ? Math.min(1, (now - began) / duration) : 1;
      const progress = 1 - Math.pow(1 - t, 3);
      this.camera = {
        x: start.x + (target.x - start.x) * progress,
        y: start.y + (target.y - start.y) * progress,
        ratio: start.ratio + (target.ratio - start.ratio) * progress,
      };
      this.onRatio(this.camera.ratio);
      this.refresh();
      if (t < 1) this.tween = requestAnimationFrame(tick);
    };
    this.tween = requestAnimationFrame(tick);
  }

  private draw = () => {
    this.frame = 0;
    if (this.autoFit) this.bounds();
    const ctx = this.context,
      graph = this.graph,
      selected = this.selected;
    const neighborhood =
      selected && graph.hasNode(selected)
        ? new Set([selected, ...graph.neighbors(selected)])
        : null;
    const scale = this.scale / this.camera.ratio;
    ctx.clearRect(0, 0, this.width, this.height);
    this.screen.clear();
    graph.forEachNode((id, attributes) => {
      if (
        !this.visible.has(id) ||
        (this.focusOnly && neighborhood && !neighborhood.has(id))
      )
        return;
      const x = this.width / 2 + (Number(attributes.x) - this.camera.x) * scale;
      const y =
        this.height / 2 + (Number(attributes.y) - this.camera.y) * scale;
      const size =
        Math.max(
          1.4,
          Number(attributes.size) * Math.pow(1 / this.camera.ratio, 0.22),
        ) * (selected === id ? 1.5 : 1);
      this.screen.set(id, { x, y, size });
    });
    // Batch ordinary edges into one path; reserve individual labels and arrows
    // for selected relationships and zoomed views.
    ctx.beginPath();
    ctx.strokeStyle = selected ? "#e9eeeb" : "#d7e1dc";
    ctx.lineWidth = 0.55;
    graph.forEachEdge((_id, _attributes, source, target) => {
      const a = this.screen.get(source),
        b = this.screen.get(target);
      if (
        !a ||
        !b ||
        source === selected ||
        target === selected ||
        (this.focusOnly && neighborhood)
      )
        return;
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
    });
    ctx.stroke();
    let edgeLabels = 0;
    graph.forEachEdge((_id, attributes, source, target) => {
      const incident = source === selected || target === selected;
      if (!incident) return;
      const a = this.screen.get(source),
        b = this.screen.get(target);
      if (!a || !b) return;
      ctx.strokeStyle = "#78a78f";
      ctx.fillStyle = "#78a78f";
      ctx.lineWidth = 1.3;
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
      const angle = Math.atan2(b.y - a.y, b.x - a.x),
        x = b.x - Math.cos(angle) * (b.size + 2),
        y = b.y - Math.sin(angle) * (b.size + 2);
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(
        x - Math.cos(angle - 0.45) * 7,
        y - Math.sin(angle - 0.45) * 7,
      );
      ctx.lineTo(
        x - Math.cos(angle + 0.45) * 7,
        y - Math.sin(angle + 0.45) * 7,
      );
      ctx.closePath();
      ctx.fill();
      if (this.focusOnly && edgeLabels++ < 60) {
        ctx.font = "11px Inter, sans-serif";
        ctx.fillStyle = "#5a7868";
        ctx.fillText(
          String(attributes.label || ""),
          (a.x + b.x) / 2,
          (a.y + b.y) / 2 - 5,
        );
      }
    });
    let labels = 0;
    const labelBoxes: { x: number; y: number; width: number }[] = [];
    for (const [id, point] of this.screen) {
      if (
        point.x < -100 ||
        point.y < -50 ||
        point.x > this.width + 100 ||
        point.y > this.height + 50
      )
        continue;
      const attributes = graph.getNodeAttributes(id),
        active = neighborhood?.has(id);
      ctx.fillStyle =
        neighborhood && !active ? "#e1e6e1" : String(attributes.color);
      ctx.beginPath();
      ctx.arc(point.x, point.y, point.size, 0, Math.PI * 2);
      ctx.fill();
      if (id === selected) {
        ctx.strokeStyle = "#236f59";
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(point.x, point.y, point.size + 4, 0, Math.PI * 2);
        ctx.stroke();
      }
      if (
        (active || attributes.kind !== "entity" || this.camera.ratio < 0.15) &&
        labels++ < 120
      ) {
        ctx.font = `${id === selected ? 600 : 400} 12px Inter, sans-serif`;
        ctx.fillStyle = "#435b4e";
        const text = String(attributes.label).slice(0, 60);
        const x = point.x + point.size + 5,
          width = ctx.measureText(text).width;
        let y = point.y + 4;
        for (
          let attempt = 0;
          attempt < 6 &&
          labelBoxes.some(
            (box) =>
              x < box.x + box.width + 5 &&
              x + width + 5 > box.x &&
              Math.abs(y - box.y) < 16,
          );
          attempt++
        )
          y += 17;
        labelBoxes.push({ x, y, width });
        ctx.fillText(text, x, y);
      }
    }
  };

  private point(event: MouseEvent) {
    const rect = this.canvas.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  }
  private hit(x: number, y: number) {
    let match: string | null = null,
      distance = Infinity;
    for (const [id, point] of this.screen) {
      const d = Math.hypot(x - point.x, y - point.y);
      if (d < Math.max(7, point.size + 3) && d < distance) {
        match = id;
        distance = d;
      }
    }
    return match;
  }
  private wheel = (event: WheelEvent) => {
    event.preventDefault();
    this.autoFit = false;
    cancelAnimationFrame(this.tween);
    const point = this.point(event),
      oldScale = this.scale / this.camera.ratio;
    this.camera.ratio = Math.min(
      8,
      Math.max(
        0.006,
        this.camera.ratio *
          Math.exp(Math.max(-1, Math.min(1, event.deltaY * 0.002))),
      ),
    );
    const newScale = this.scale / this.camera.ratio;
    this.camera.x += (point.x - this.width / 2) * (1 / oldScale - 1 / newScale);
    this.camera.y +=
      (point.y - this.height / 2) * (1 / oldScale - 1 / newScale);
    this.onRatio(this.camera.ratio);
    this.refresh();
  };
  private down = (event: PointerEvent) => {
    if (event.button !== 0) return;
    const p = this.point(event);
    this.pointer = {
      ...p,
      lastX: p.x,
      lastY: p.y,
      node: this.hit(p.x, p.y),
      moved: false,
    };
    this.canvas.setPointerCapture(event.pointerId);
  };
  private move = (event: PointerEvent) => {
    const pointer = this.pointer,
      point = this.point(event);
    if (!pointer) {
      this.canvas.style.cursor = this.hit(point.x, point.y)
        ? "pointer"
        : "grab";
      return;
    }
    if (Math.hypot(point.x - pointer.x, point.y - pointer.y) > 4)
      pointer.moved = true;
    if (!pointer.moved) return;
    this.autoFit = false;
    cancelAnimationFrame(this.tween);
    const scale = this.scale / this.camera.ratio;
    if (pointer.node) {
      this.onDrag();
      this.graph.mergeNodeAttributes(pointer.node, {
        x: this.camera.x + (point.x - this.width / 2) / scale,
        y: this.camera.y + (point.y - this.height / 2) / scale,
        fixed: true,
      });
    } else {
      this.camera.x -= (point.x - pointer.lastX) / scale;
      this.camera.y -= (point.y - pointer.lastY) / scale;
    }
    pointer.lastX = point.x;
    pointer.lastY = point.y;
    this.refresh();
  };
  private up = () => {
    if (this.pointer && !this.pointer.moved) this.onSelect(this.pointer.node);
    this.pointer = null;
  };
  private cancel = () => {
    this.pointer = null;
  };
  private doubleClick = () => this.zoom(0.6);

  kill() {
    cancelAnimationFrame(this.frame);
    cancelAnimationFrame(this.tween);
    this.observer.disconnect();
    for (const event of this.events) this.graph.off(event, this.refresh);
    this.canvas.removeEventListener("wheel", this.wheel);
    this.canvas.removeEventListener("pointerdown", this.down);
    this.canvas.removeEventListener("pointermove", this.move);
    this.canvas.removeEventListener("pointerup", this.up);
    this.canvas.removeEventListener("pointercancel", this.cancel);
    this.canvas.removeEventListener("dblclick", this.doubleClick);
    this.canvas.remove();
  }
}
