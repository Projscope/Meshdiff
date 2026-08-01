/**
 * GeometricDeltaReport — the structured output of the geometry engine.
 * The LLM narrates this; it never derives it from raw mesh data.
 */

export type Result<T> =
  | { success: true; data: T }
  | { success: false; error: string };

export type Axis = "x" | "y" | "z";

export interface VolumeDelta {
  meshAVolumeMm3: number;
  meshBVolumeMm3: number;
  deltaMm3: number;
  deltaPercent: number;
}

export interface BoundingBoxDelta {
  axis: Axis;
  meshAExtentMm: number;
  meshBExtentMm: number;
  deltaMm: number;
}

export interface HoleChange {
  id: string;
  kind: "added" | "removed" | "diameter-changed";
  diameterBeforeMm: number | null;
  diameterAfterMm: number | null;
  locationMm: [number, number, number];
}

export interface HoleInventory {
  countBefore: number;
  countAfter: number;
  changes: HoleChange[];
}

export interface WallThicknessReport {
  minMm: number;
  maxMm: number;
  thinWallWarnings: Array<{
    locationMm: [number, number, number];
    thicknessMm: number;
  }>;
}

export type OverhangRisk = "low" | "medium" | "high";

export interface OverhangAnalysis {
  maxAngleDegrees: number;
  unsupportedAreaMm2: number;
  risk: OverhangRisk;
}

export type ChangeRegionKind = "added" | "removed" | "modified";

export interface ChangeRegion {
  id: string;
  kind: ChangeRegionKind;
  approximateLocationMm: [number, number, number];
  approximateVolumeMm3: number;
}

export type PrintabilityStatus = "pass" | "warn" | "fail";

export interface PrintabilityGate {
  status: PrintabilityStatus;
  issueTags: string[];
}

export type AlignmentMethod = "centroid-pca" | "icp";

export interface AlignmentMetadata {
  method: AlignmentMethod;
  confidence: number;
}

export interface GeometricDeltaReport {
  meshAId: string;
  meshBId: string;
  volumeDelta: VolumeDelta;
  boundingBoxDelta: BoundingBoxDelta[];
  holeInventory: HoleInventory;
  wallThickness: WallThicknessReport;
  overhangAnalysis: OverhangAnalysis;
  changeRegions: ChangeRegion[];
  printabilityGate: PrintabilityGate;
  alignment: AlignmentMetadata;
}
