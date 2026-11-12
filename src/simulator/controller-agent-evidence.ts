import type {Instruction} from "./model";

export type AiAction = {kind: "maintain"} | {kind: "command"; aircraftId: string; instruction: Extract<Instruction, {type: "vector" | "expect-approach" | "radar-speed" | "missed-approach" | "frequency"}>};
export interface AiReason {
  code: "sequence-slot" | "intercept" | "descent" | "speed-spacing" | "approach-clearance" | "handoff" | "missed" | "await-readback" | "maintain" | "separation" | "terrain" | "performance" | "unsupported" | "stale" | "budget" | "progress" | "trainer" | "worker";
  aircraftIds: string[];
  /** Bounded operational detail, not hidden reasoning. */
  detail: string;
}
export interface AiDecisionSummary {
  id: string; observedElapsed: number; horizonSeconds: number; action: AiAction;
  outcome: "suggested" | "issued" | "maintain" | "blocked"; reason: AiReason; computeMs: number;
  /** Worker measurements; absent for older/offline evidence. */
  cpuMs?: number; heapBytes?: number;
  closest?: {aircraftIds: [string, string]; at: number; lateralNm: number; verticalFt: number}; terrainSlackFt?: number;
}
export type AiStage = "sequence" | "position" | "intercept" | "final" | "handoff" | "missed" | "rollout" | "complete";
export interface ControllerAgentSummary {
  id: string; kind: "ai"; mode: "shadow" | "control"; status: "disabled" | "suspended" | "planning" | "active";
  policyId: string; profileId: string; nextDecisionElapsed: number; authority: "ai" | "trainer" | "none";
  suspensionReason?: AiReason; lastDecision?: AiDecisionSummary; arrivalOrder: {aircraftId: string; callsign: string; stage: AiStage}[];
  forecast?: {observedElapsed: number; horizonSeconds: number; paths: {aircraftId: string; points: {elapsed: number; position: {x: number; y: number}; altitudeFt: number}[]}[]};
  rejected?: {candidateId: string; reason: AiReason}[];
  pending?: {aircraftId: string; commandId: string; deadline?: number}[];
  terrainCoverage?: string;
  budgetStatus?: string;
}

/** Passive, recorded evidence; this never grants controller authority. */
export interface ReplayAiEvent {
  kind: "assignment" | "status" | "decision" | "compliance" | "intervention" | "rejection";
  elapsed: number;
  assignedBy?: string;
  decisionId?: string;
  slotId?: string;
  generation?: string;
  observationHash?: string;
  policyId?: string;
  profileHash?: string;
  terrainHash?: string;
  engineHash?: string;
  action?: AiAction;
  outcome?: string;
  appliedEnvelopeId?: string;
  reason?: AiReason;
  summary?: AiDecisionSummary;
}
