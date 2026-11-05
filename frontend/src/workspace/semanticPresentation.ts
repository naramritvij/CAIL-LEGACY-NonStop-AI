import type { GraphNode } from "./types";

export const CONCEPT_COLORS: Record<string, string> = {
  subsystem: "#547fa1",
  command: "#368b76",
  event: "#c97665",
  object_reference: "#7899b0",
  metric: "#489ca0",
  site_reference: "#b38a63",
  version: "#a78eb6",
  expert_note: "#b78b49",
};
export function relationshipColor(kind: string) {
  return (
    (
      {
        wrote: "#b28b55",
        expert_in: "#9170b2",
        knows: "#329a79",
        learned_from: "#329a79",
        asked_about: "#b59b5f",
        contradicts: "#cb7070",
        supports: "#5698af",
        supersedes: "#9982ad",
        cites: "#809bb5",
        documents: "#72ad97",
      } as Record<string, string>
    )[kind] || "#70a28c"
  );
}
export function clusterTarget(
  node: Pick<GraphNode, "subsystem" | "kind" | "entity_type">,
) {
  const groups = [
    "TACL",
    "TMF",
    "PATHWAY",
    "FUP",
    "SCF",
    "MEASURE",
    "PEEK",
    "ASAP",
    "MOMI",
    "PROGNOSIS",
  ];
  const index = groups.indexOf(node.subsystem || "");
  const angle = (Math.max(0, index) * Math.PI * 2) / groups.length;
  const radius = index < 0 ? 0 : 340;
  return {
    ax: Math.cos(angle) * radius,
    ay:
      node.kind === "person"
        ? 190
        : node.entity_type === "expert_note"
          ? 85
          : node.entity_type === "passage"
            ? -100
            : 0,
    az: Math.sin(angle) * radius,
  };
}
