import { jsPDF } from "jspdf";
import type { VoxelDiffStats } from "@meshdiff/shared/engine/diffVoxels";

export type DiffReportStats = VoxelDiffStats & { toleranceMm: number };

export interface DiffReportScreenshots {
  viewA?: string | null;
  viewB?: string | null;
  combined?: string | null;
}

const MESHDIFF_URL = "https://meshdiff.com/";
const ACCENT = "#10b981";
const NEUTRAL_950 = "#15181e";
const NEUTRAL_400 = "#7c879e";
const NEUTRAL_700 = "#333b4a";

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
  const scale = Math.min(boxW / props.width, boxH / props.height);
  const w = props.width * scale;
  const h = props.height * scale;
  const imgX = x + (boxW - w) / 2;
  const imgY = y + (boxH - h) / 2;

  doc.setDrawColor(230, 230, 230);
  doc.rect(x, y, boxW, boxH);
  doc.addImage(dataUrl, "PNG", imgX, imgY, w, h);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(NEUTRAL_400);
  doc.text(caption, x + boxW / 2, y + boxH + 5, { align: "center" });
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
 * Shared by the public /live tool and the authenticated Projects compare view
 * so the report stays identical. */
export function downloadDiffReportPdf(
  stats: DiffReportStats,
  isProOrTeam: boolean,
  screenshots?: DiffReportScreenshots,
) {
  const doc = new jsPDF({ unit: "mm", format: "a4" });
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

  doc.setFontSize(10);
  doc.setTextColor("#525252");
  const note = doc.splitTextToSize(
    "Partial report — reflects the voxel diff engine only. Wall thickness, overhang, " +
      "and hole checks are not implemented yet.",
    182,
  );
  doc.text(note, 14, y);
  y += note.length * 5 + 6;

  const rows: Array<[string, string]> = [
    ["Tolerance (mm)", stats.toleranceMm.toFixed(3)],
    ["Added voxels", stats.addedCount.toLocaleString()],
    ["Removed voxels", stats.removedCount.toLocaleString()],
    ["Unchanged voxels", stats.unchangedCount.toLocaleString()],
    ["Voxel volume (mm³)", stats.voxelVolumeMm3.toFixed(4)],
    ["Approx. volume delta (mm³)", stats.approxVolumeDeltaMm3.toFixed(2)],
    ["Approx. volume delta (%)", `${stats.approxVolumeDeltaPercent.toFixed(2)}%`],
  ];

  doc.setDrawColor(230, 230, 230);
  for (const [label, value] of rows) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.setTextColor("#525252");
    doc.text(label, 14, y);
    doc.setFont("helvetica", "bold");
    doc.setTextColor("#171717");
    doc.text(value, 196, y, { align: "right" });
    doc.line(14, y + 2, 196, y + 2);
    y += 9;
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
