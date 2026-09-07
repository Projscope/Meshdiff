import ContentPageLayout from "../components/ContentPageLayout";
import { useDocumentMeta } from "../lib/useDocumentMeta";

export const META_TITLE = "Compare OBJ Files — See What Changed | Meshdiff";
export const META_DESCRIPTION =
  "Compare two OBJ files and see exactly what changed: added material, removed material, and dimensional drift. Free, in-browser voxel diffing for OBJ — nothing is uploaded.";

export default function ObjDiffPage() {
  useDocumentMeta(META_TITLE, META_DESCRIPTION);

  return (
    <ContentPageLayout
      eyebrow="Guide"
      h1="Compare OBJ Files — See What Changed"
      dek="OBJ is one of the oldest and most portable 3D formats — and one of the least consistent to export. Comparing two OBJ revisions means comparing the geometry itself, since the file's own metadata often can't be trusted."
      cta={{ label: "Open the diff tool", to: "/live" }}
      related={[
        { to: "/stl-diff", label: "Compare STL Files" },
        { to: "/3mf-diff", label: "Compare 3MF Files" },
        { to: "/vs-manual-comparison", label: "Meshdiff vs. Manual Comparison" },
        { to: "/docs", label: "Docs & FAQ" },
      ]}
    >
      <h2 className="text-2xl font-bold text-ink-50">Why OBJ files are inconsistent to begin with</h2>
      <p className="mt-4">
        OBJ has been around since the 1980s and every 3D tool can export it, which is exactly the problem: two OBJ
        files from two different pieces of software can differ wildly in what they actually contain. Vertex
        normals are often missing (left for the importer to recompute), groups and materials may or may not be
        included depending on export settings, and — like STL — there's no explicit unit, so "1 unit" could mean a
        millimetre, a centimetre, or an inch depending on where the file came from. None of that is metadata you
        can trust when you're trying to answer "what actually changed between these two versions."
      </p>

      <h2 className="mt-10 text-2xl font-bold text-ink-50">Comparing the geometry, not the file</h2>
      <p className="mt-4">
        Because OBJ's surrounding metadata is unreliable, a useful OBJ diff has to work the same way a useful STL
        diff does: ignore the file's own claims about materials or groups and compare the actual triangulated
        surface. Meshdiff voxelizes both OBJ meshes into a shared grid, classifies each voxel as added, removed, or
        unchanged, and layers a per-vertex signed-distance heatmap on top to show exactly how far a surface moved —
        the same pipeline used for STL and 3MF, so results are consistent across formats.
      </p>

      <h2 className="mt-10 text-2xl font-bold text-ink-50">Where OBJ diffing shows up in practice</h2>
      <ul className="mt-4 list-disc space-y-2 pl-5">
        <li>
          <strong className="text-ink-100">Exports from sculpting or CAD tools</strong> that default to OBJ (Blender,
          ZBrush, some parametric tools' mesh-export path) rather than a print-focused format.
        </li>
        <li>
          <strong className="text-ink-100">Cross-tool pipelines</strong> where a model passes through more than one
          application before printing, and you need to confirm nothing shifted in the round trip.
        </li>
        <li>
          <strong className="text-ink-100">Scan-to-print workflows</strong> where a 3D scan exported as OBJ needs to
          be checked against a repaired or decimated version before sending it to a printer.
        </li>
      </ul>

      <h2 className="mt-10 text-2xl font-bold text-ink-50">What to check in the diff</h2>
      <p className="mt-4">
        The same checklist applies as for any format: volume delta, bounding-box change per axis, hole diameter
        changes, minimum wall thickness (0.8mm for typical FDM setups), and any new unsupported overhang past
        45°–55°. Because OBJ files can arrive without consistent units, it's worth a quick bounding-box sanity check
        first — if Version B suddenly reads as 25.4× larger than Version A, one of the two was very likely exported
        in inches instead of millimetres.
      </p>

      <h2 className="mt-10 text-2xl font-bold text-ink-50">How to compare two OBJ files</h2>
      <p className="mt-4">
        Open the{" "}
        <a href="/live" className="text-accent-fg-400 underline underline-offset-2 hover:text-accent-fg-300">
          free diff tool
        </a>
        , drop your two OBJ files into the Compare view, and Meshdiff runs the voxel and heatmap diff entirely in
        your browser — no upload, no signup.
      </p>
    </ContentPageLayout>
  );
}
