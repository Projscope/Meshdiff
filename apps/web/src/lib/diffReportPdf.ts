import { jsPDF } from "jspdf";
import type { VoxelDiffStats } from "@meshdiff/shared/engine/diffVoxels";

export type DiffReportStats = VoxelDiffStats & { toleranceMm: number };

export interface DiffReportScreenshots {
  viewA?: string | null;
  viewB?: string | null;
  combined?: string | null;
}

const MESHDIFF_URL = "https://meshdiff.com/";
const EMBED_URL = "https://meshdiff.com/embed";
const ACCENT = "#10b981";
const NEUTRAL_950 = "#15181e";
const NEUTRAL_400 = "#7c879e";
const NEUTRAL_700 = "#333b4a";

/** Large, low-opacity diagonal text across the whole page — the Free tier's
 * watermark gate (see CLAUDE.md pricing table: Free = "watermark", Pro/Team
 * = "no watermark"). Drawn first so the page's actual content layers on top
 * of it. */
function drawWatermark(doc: jsPDF) {
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();

  doc.saveGraphicsState();
  doc.setGState(doc.GState({ opacity: 0.08 }));
  doc.setFont("helvetica", "bold");
  doc.setFontSize(40);
  doc.setTextColor(NEUTRAL_950);
  doc.text("GENERATED WITH COMMUNITY VERSION", pageWidth / 2, pageHeight / 2, {
    align: "center",
    angle: 45,
  });
  doc.restoreGraphicsState();
}

/** A clearly-readable (not the faint diagonal watermark's 0.08 opacity)
 * upsell panel for Free-tier reports, filling the otherwise-blank space
 * below the stats table — the diagonal watermark alone was easy to miss at
 * a glance. Also promotes the embeddable revision badge (/embed), which is
 * relevant to exactly this audience (someone sharing a diff report
 * publicly, e.g. on a Thingiverse/Printables listing). Returns the y
 * position after the panel. */
function drawFreeTierPromo(doc: jsPDF, y: number): number {
  const boxY = y;
  const boxHeight = 26;
  doc.setDrawColor(230, 230, 230);
  doc.setFillColor(250, 250, 250);
  doc.roundedRect(14, boxY, 182, boxHeight, 2, 2, "FD");

  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.setTextColor("#171717");
  doc.text("This report was generated with Meshdiff Community.", 14 + 6, boxY + 9);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(NEUTRAL_400);
  doc.text("Upgrade to Pro or Team to remove this watermark and unlock saved projects and version history.", 14 + 6, boxY + 15);

  doc.setTextColor(ACCENT);
  doc.textWithLink("Get an embeddable revision badge for your listing → meshdiff.com/embed", 14 + 6, boxY + 21, {
    url: EMBED_URL,
  });

  return boxY + boxHeight + 8;
}

/** Draws the "^" logomark + Meshdiff wordmark, linked to meshdiff.com. */
function drawLetterhead(doc: jsPDF) {
  doc.setFillColor(ACCENT);
  doc.roundedRect(14, 14, 9, 9, 2, 2, "F");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.setTextColor(NEUTRAL_950);
  doc.text("^", 18.5, 20.3, { align: "center" });

  doc.setFontSize(14);
  doc.setTextColor("#171717");
  doc.text("Meshdiff", 26, 20.5);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(ACCENT);
  doc.textWithLink(MESHDIFF_URL, 26, 25, { url: MESHDIFF_URL });

  doc.setDrawColor(NEUTRAL_700);
  doc.line(14, 30, 196, 30);
}

/** Fits `dataUrl` into a `boxW`x`boxH` (mm) box at (x, y), preserving aspect
 * ratio and centering within the box, with a small caption underneath. */
function drawView(doc: jsPDF, dataUrl: string, caption: string, x: number, y: number, boxW: number, boxH: number) {
  const props = doc.getImageProperties(dataUrl);
  // "Cover" fill, not "contain" — scale up until the image covers the box
  // on both axes (Math.max, not Math.min), then clip the overflow to the
  // box. A plain contain-fit left visible letterboxing around the render
  // whenever its aspect ratio didn't exactly match the box's.
  const scale = Math.max(boxW / props.width, boxH / props.height);
  const w = props.width * scale;
  const h = props.height * scale;
  const imgX = x + (boxW - w) / 2;
  const imgY = y + (boxH - h) / 2;

  doc.setDrawColor(230, 230, 230);
  doc.rect(x, y, boxW, boxH);

  doc.saveGraphicsState();
  doc.rect(x, y, boxW, boxH, null);
  doc.clip();
  doc.discardPath();
  doc.addImage(dataUrl, "PNG", imgX, imgY, w, h);
  doc.restoreGraphicsState();

  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(NEUTRAL_400);
  doc.text(caption, x + boxW / 2, y + boxH + 5, { align: "center" });
}

const MARGIN_BOTTOM = 20;
const ROW_HEIGHT = 7;

/** Starts a new page (resetting y to the top margin) if `neededHeight`
 * wouldn't fit above the footer — every section below calls this before
 * drawing, since the full stat set (mirroring DetailedStatsPanel.tsx) no
 * longer reliably fits on one page the way the old 7-row summary did. */
function ensureSpace(doc: jsPDF, y: number, neededHeight: number): number {
  const pageHeight = doc.internal.pageSize.getHeight();
  if (y + neededHeight <= pageHeight - MARGIN_BOTTOM) return y;
  doc.addPage();
  return 20;
}

function drawSectionHeader(doc: jsPDF, y: number, title: string): number {
  y = ensureSpace(doc, y, ROW_HEIGHT + 4);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.setTextColor("#171717");
  doc.text(title, 14, y);
  doc.setDrawColor(230, 230, 230);
  doc.line(14, y + 2, 196, y + 2);
  return y + 8;
}

function drawStatRow(doc: jsPDF, y: number, label: string, value: string, valueColor = "#171717"): number {
  y = ensureSpace(doc, y, ROW_HEIGHT);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9.5);
  doc.setTextColor("#525252");
  doc.text(label, 14, y);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(valueColor);
  doc.text(value, 196, y, { align: "right" });
  doc.setDrawColor(240, 240, 240);
  doc.line(14, y + 1.5, 196, y + 1.5);
  return y + ROW_HEIGHT;
}

function drawInlineNote(doc: jsPDF, y: number, text: string, color: string, background: [number, number, number]): number {
  const lines = doc.splitTextToSize(text, 174) as string[];
  const height = lines.length * 4.5 + 4;
  y = ensureSpace(doc, y, height);
  doc.setFillColor(...background);
  doc.roundedRect(14, y - 3.5, 182, height, 1.5, 1.5, "F");
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8.5);
  doc.setTextColor(color);
  doc.text(lines, 18, y + 1);
  return y + height + 3;
}

const ADDED_GREEN = "#059669";
const REMOVED_RED = "#dc2626";
const NEUTRAL_GRAY = "#78716c";
const AMBER_TEXT = "#92400e";
const AMBER_BG: [number, number, number] = [255, 251, 235];

/** Draws every group from DetailedStatsPanel.tsx (Geometric Delta, Model
 * Size, Version Stats, Printability Details, Hole Inventory) — the PDF
 * report used to include only the raw voxel counts; this brings it to
 * parity with what the in-app panel already shows. Both current callers
 * (CompareVersionsPage.tsx, LiveDiffToolPage.tsx) always have a real
 * comparison in context when the download button is even shown, so unlike
 * the in-app panel this doesn't need its own hasComparison gate. */
function drawDetailedStats(doc: jsPDF, stats: DiffReportStats, boundingBoxB: [number, number, number], y: number): number {
  const volumeB = stats.voxelVolumeMm3 * (stats.unchangedCount + stats.addedCount);

  y = drawSectionHeader(doc, y, "Geometric Delta");
  y = drawStatRow(
    doc, y, "Volume",
    `${stats.approxVolumeDeltaMm3 < 0 ? "↓" : "↑"} ${Math.abs(stats.approxVolumeDeltaMm3).toFixed(0)} mm³`,
    stats.approxVolumeDeltaMm3 < 0 ? REMOVED_RED : ADDED_GREEN,
  );
  y = drawStatRow(
    doc, y, "Volume Change",
    `${stats.approxVolumeDeltaPercent < 0 ? "↓" : "↑"} ${Math.abs(stats.approxVolumeDeltaPercent).toFixed(1)}%`,
    stats.approxVolumeDeltaPercent < 0 ? REMOVED_RED : ADDED_GREEN,
  );
  y = drawStatRow(doc, y, "Size Δ X", `${stats.boundingBoxDeltaX >= 0 ? "→" : "←"} ${Math.abs(stats.boundingBoxDeltaX).toFixed(1)} mm`, stats.boundingBoxDeltaX !== 0 ? "#b45309" : NEUTRAL_GRAY);
  y = drawStatRow(doc, y, "Size Δ Y", `${stats.boundingBoxDeltaY >= 0 ? "→" : "←"} ${Math.abs(stats.boundingBoxDeltaY).toFixed(1)} mm`, stats.boundingBoxDeltaY !== 0 ? "#b45309" : NEUTRAL_GRAY);
  y = drawStatRow(doc, y, "Size Δ Z", `${stats.boundingBoxDeltaZ >= 0 ? "↑" : "↓"} ${Math.abs(stats.boundingBoxDeltaZ).toFixed(1)} mm`, stats.boundingBoxDeltaZ !== 0 ? "#b45309" : NEUTRAL_GRAY);
  y = drawStatRow(
    doc, y, "Triangles",
    `${stats.triangleDelta > 0 ? "↑ +" : stats.triangleDelta < 0 ? "↓ " : "→ "}${stats.triangleDelta}`,
    stats.triangleDelta > 0 ? ADDED_GREEN : stats.triangleDelta < 0 ? REMOVED_RED : NEUTRAL_GRAY,
  );
  y = drawStatRow(
    doc, y, "Surface Area",
    `${stats.surfaceAreaDelta < 0 ? "↓" : "↑"} ${Math.abs(stats.surfaceAreaDelta).toFixed(0)} mm²`,
    stats.surfaceAreaDelta < 0 ? REMOVED_RED : ADDED_GREEN,
  );
  if (stats.thinWallWarning) y = drawInlineNote(doc, y, "⚠ Thin walls detected (< 0.8mm)", AMBER_TEXT, AMBER_BG);
  if (stats.maxOverhangAngle > 45) y = drawInlineNote(doc, y, `⚠ Overhangs detected (${stats.maxOverhangAngle.toFixed(1)}°)`, AMBER_TEXT, AMBER_BG);

  y += 4;
  y = drawSectionHeader(doc, y, "Model Size");
  y = drawStatRow(doc, y, "Size X", `${boundingBoxB[0].toFixed(1)} mm`);
  y = drawStatRow(doc, y, "Size Y", `${boundingBoxB[1].toFixed(1)} mm`);
  y = drawStatRow(doc, y, "Size Z", `${boundingBoxB[2].toFixed(1)} mm`);

  y += 4;
  y = drawSectionHeader(doc, y, "Version Stats");
  y = drawStatRow(doc, y, "Volume", `${volumeB.toFixed(0)} mm³`);
  y = drawStatRow(doc, y, "Bounding Box", `${boundingBoxB[0].toFixed(0)} × ${boundingBoxB[1].toFixed(0)} × ${boundingBoxB[2].toFixed(0)} mm`);
  y = drawStatRow(doc, y, "Triangles", Math.round(stats.triangleDeltaB).toLocaleString());
  y = drawStatRow(doc, y, "Surface Area", `${stats.surfaceAreaB.toFixed(0)} mm²`);
  if (stats.fileFormatB) y = drawStatRow(doc, y, "File Format", stats.fileFormatB.toUpperCase());

  y += 4;
  y = drawSectionHeader(doc, y, "Printability Details");
  for (const issue of stats.printabilityIssues) {
    y = drawInlineNote(doc, y, `• ${issue}`, AMBER_TEXT, AMBER_BG);
  }
  y = drawStatRow(doc, y, "Wall Thickness", `${stats.minWallThickness.toFixed(2)} – ${stats.maxWallThickness.toFixed(2)} mm`);
  y = drawStatRow(doc, y, "Max Overhang", `${stats.maxOverhangAngle.toFixed(1)}°`);
  y = drawStatRow(doc, y, "Unsupported Area", `${stats.overhangAreaPercent.toFixed(1)}%`);

  y += 4;
  y = drawSectionHeader(doc, y, "Hole Inventory");
  if (stats.holeCountB > 0 && stats.minHoleDiameterMm < 2) {
    y = drawInlineNote(
      doc, y,
      `⚠ Small hole diameter (${stats.minHoleDiameterMm.toFixed(2)}mm) may fill in during printing`,
      AMBER_TEXT, AMBER_BG,
    );
  }
  y = drawStatRow(doc, y, "Holes Detected", String(stats.holeCountB));
  y = drawStatRow(doc, y, "Added", stats.holesAdded > 0 ? `+${stats.holesAdded}` : "0", stats.holesAdded > 0 ? ADDED_GREEN : NEUTRAL_GRAY);
  y = drawStatRow(doc, y, "Removed", stats.holesRemoved > 0 ? `-${stats.holesRemoved}` : "0", stats.holesRemoved > 0 ? REMOVED_RED : NEUTRAL_GRAY);
  y = drawStatRow(doc, y, "Diameter Changed", String(stats.holesDiameterChanged), stats.holesDiameterChanged > 0 ? "#b45309" : NEUTRAL_GRAY);
  if (stats.holeCountB > 0) y = drawStatRow(doc, y, "Smallest Diameter", `${stats.minHoleDiameterMm.toFixed(2)} mm`);

  return y;
}

/** Draws up to 3 viewport screenshots (V1, V2, Combined) side by side.
 * Returns the y position after the row, or the unchanged `y` if none were
 * provided. */
function drawScreenshots(doc: jsPDF, screenshots: DiffReportScreenshots | undefined, y: number): number {
  const views = (
    [
      ["V1", screenshots?.viewA],
      ["V2", screenshots?.viewB],
      ["Combined", screenshots?.combined],
    ] as Array<[string, string | null | undefined]>
  ).filter((entry): entry is [string, string] => !!entry[1]);
  if (views.length === 0) return y;

  const gap = 4;
  const boxW = (182 - gap * (views.length - 1)) / views.length;
  const boxH = 44;
  views.forEach(([caption, dataUrl], i) => {
    drawView(doc, dataUrl, caption, 14 + i * (boxW + gap), y, boxW, boxH);
  });

  return y + boxH + 12;
}

/** Builds and triggers a browser download of a Meshdiff diff-report PDF —
 * Meshdiff letterhead/link, the voxel diff stats, an optional row of viewport
 * screenshots, and a footer noting the Free tier unless `isProOrTeam` is set.
 * Free-tier reports also get a diagonal "GENERATED WITH COMMUNITY VERSION"
 * watermark across the page (see CLAUDE.md pricing table: watermark is a
 * Free-tier gate, removed on Pro/Team). Shared by the public /live tool and
 * the authenticated Projects compare view so the report stays identical. */
export function downloadDiffReportPdf(
  stats: DiffReportStats,
  isProOrTeam: boolean,
  boundingBoxB: [number, number, number],
  screenshots?: DiffReportScreenshots,
) {
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  if (!isProOrTeam) drawWatermark(doc);
  drawLetterhead(doc);

  let y = 42;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(18);
  doc.setTextColor("#171717");
  doc.text("Diff Report", 14, y);

  y += 8;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.setTextColor(NEUTRAL_400);
  doc.text(`Generated ${new Date().toLocaleString()}`, 14, y);

  y += 10;
  y = drawScreenshots(doc, screenshots, y);

  y = drawSectionHeader(doc, y, "Voxel Diff");
  y = drawStatRow(doc, y, "Tolerance (mm)", stats.toleranceMm.toFixed(3));
  y = drawStatRow(doc, y, "Added voxels", stats.addedCount.toLocaleString(), ADDED_GREEN);
  y = drawStatRow(doc, y, "Removed voxels", stats.removedCount.toLocaleString(), REMOVED_RED);
  y = drawStatRow(doc, y, "Unchanged voxels", stats.unchangedCount.toLocaleString());
  y = drawStatRow(doc, y, "Voxel volume (mm³)", stats.voxelVolumeMm3.toFixed(4));
  y = drawStatRow(
    doc, y, "Approx. volume delta (mm³)", stats.approxVolumeDeltaMm3.toFixed(2),
    stats.approxVolumeDeltaMm3 < 0 ? REMOVED_RED : ADDED_GREEN,
  );
  y = drawStatRow(
    doc, y, "Approx. volume delta (%)", `${stats.approxVolumeDeltaPercent.toFixed(2)}%`,
    stats.approxVolumeDeltaPercent < 0 ? REMOVED_RED : ADDED_GREEN,
  );

  y += 4;
  y = drawDetailedStats(doc, stats, boundingBoxB, y);

  y += 6;
  if (!isProOrTeam) {
    y = ensureSpace(doc, y, 34);
    y = drawFreeTierPromo(doc, y);
  }

  const pageHeight = doc.internal.pageSize.getHeight();
  const footerY = pageHeight - 14;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(NEUTRAL_400);
  const footerText = isProOrTeam
    ? "Generated with Meshdiff"
    : "Generated with Meshdiff Free — meshdiff.com";
  doc.text(footerText, 14, footerY);
  doc.textWithLink(MESHDIFF_URL, 196, footerY, { url: MESHDIFF_URL, align: "right" });

  doc.save(`meshdiff-report-${Date.now()}.pdf`);
}
