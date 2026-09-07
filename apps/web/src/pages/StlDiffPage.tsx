import ContentPageLayout from "../components/ContentPageLayout";
import { useDocumentMeta } from "../lib/useDocumentMeta";

export const META_TITLE = "Compare STL Files — See What Changed | Meshdiff";
export const META_DESCRIPTION =
  "Compare two STL files and see exactly what changed: added material, removed material, and dimensional drift. Free, in-browser voxel diffing — nothing is uploaded.";

export default function StlDiffPage() {
  useDocumentMeta(META_TITLE, META_DESCRIPTION);

  return (
    <ContentPageLayout
      eyebrow="Guide"
      h1="Compare STL Files — See What Changed"
      dek="STL is the most common 3D printing format, and the hardest to diff — it's just a triangle soup with no version metadata, no units, and no history. Here's how to actually compare two STL files and know what's different."
      cta={{ label: "Compare two STL files now", to: "/compare-stl-files" }}
      related={[
        { to: "/3mf-diff", label: "Compare 3MF Files" },
        { to: "/3d-print-version-control", label: "3D Print Version Control" },
        { to: "/vs-manual-comparison", label: "Meshdiff vs. Manual Comparison" },
        { to: "/docs", label: "Docs & FAQ" },
      ]}
    >
      <h2 className="text-2xl font-bold text-ink-50">Why STL files are hard to diff</h2>
      <p className="mt-4">
        An STL file stores nothing but a list of triangles — no object names, no history, no units (everything is
        assumed to be millimetres), and no concept of "version 2" versus "version 1." Two STL files with the same
        filename can be wildly different parts, and two files that look identical in a slicer preview can differ by
        a fraction of a millimetre in exactly the place that matters — a hole diameter, a wall thickness, a boss
        height. A standard file diff (byte-for-byte, or even a text diff of an ASCII STL) is useless here: a tiny
        geometric change can rewrite every triangle's vertex order, making the raw file look completely rewritten
        even when only one feature moved.
      </p>

      <h2 className="mt-10 text-2xl font-bold text-ink-50">What "comparing" two STL files actually means</h2>
      <p className="mt-4">
        A useful STL comparison answers three questions: what geometry was added, what was removed, and how far did
        the surfaces that stayed actually move. Meshdiff answers all three by voxelizing both files into a shared
        grid and classifying each cell as added, removed, or unchanged — the same technique used for volumetric CSG,
        applied here purely for visualization and measurement, not for producing a new mesh. A second pass computes
        a signed-distance field between the two surfaces so you get an actual heatmap of dimensional drift, not just
        a bounding-box number.
      </p>

      <h2 className="mt-10 text-2xl font-bold text-ink-50">What to look for in an STL diff</h2>
      <ul className="mt-4 list-disc space-y-2 pl-5">
        <li>
          <strong className="text-ink-100">Volume delta</strong> — a quick sanity check. A part that should have
          lost material but shows a volume increase usually means the wrong file was uploaded as "before."
        </li>
        <li>
          <strong className="text-ink-100">Bounding box changes per axis</strong> — catches unintended scaling or a
          part that grew in one dimension because a sketch constraint moved.
        </li>
        <li>
          <strong className="text-ink-100">Hole diameter changes</strong> — a hole that shrank by even 0.2mm can turn
          a clearance fit into a press fit, or block a fastener entirely.
        </li>
        <li>
          <strong className="text-ink-100">Wall thickness</strong> — FDM printing generally needs at least 0.8mm
          (two perimeters at a 0.4mm nozzle); a revision that thins a wall below that will warp or fail mid-print.
        </li>
        <li>
          <strong className="text-ink-100">New overhangs</strong> — a change that adds an unsupported surface past
          45°–55° from vertical means new supports, more cleanup, and a rougher surface underneath.
        </li>
      </ul>

      <h2 className="mt-10 text-2xl font-bold text-ink-50">Common situations where this matters</h2>
      <p className="mt-4">
        Makers run into this constantly: you download a remix of a model from Thingiverse or Printables and want to
        know what the remixer actually changed before committing filament to a print. CAD and print engineers hit
        it every time a part comes back from a design review — "just a minor tweak" needs to be verified, not taken
        on faith. And anyone maintaining a library of enclosures, brackets, or jigs needs a way to confirm that
        "v3" and "v4" are actually different in the way the changelog says they are.
      </p>

      <h2 className="mt-10 text-2xl font-bold text-ink-50">How to compare two STL files with Meshdiff</h2>
      <p className="mt-4">
        Open the{" "}
        <a href="/compare-stl-files" className="text-accent-fg-400 underline underline-offset-2 hover:text-accent-fg-300">
          STL comparison tool
        </a>
        , drag Version A into the first slot and Version B into the second. Meshdiff aligns and voxelizes both
        files locally in your browser — nothing is uploaded — and renders the diff in a few seconds for typical
        part sizes. Adjust the tolerance slider if you're comparing a press-fit part (0.1–0.2mm) versus a
        clearance-fit part (0.2–0.4mm), since that changes what counts as "changed" versus "manufacturing noise."
      </p>
    </ContentPageLayout>
  );
}
