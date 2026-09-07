import ContentPageLayout from "../components/ContentPageLayout";
import { useDocumentMeta } from "../lib/useDocumentMeta";

export const META_TITLE = "Compare 3MF Files — See What Changed | Meshdiff";
export const META_DESCRIPTION =
  "Compare two 3MF files and see exactly what changed: added material, removed material, and dimensional drift — plus multi-object and color metadata. Free, in-browser, nothing uploaded.";

export default function ThreeMfDiffPage() {
  useDocumentMeta(META_TITLE, META_DESCRIPTION);

  return (
    <ContentPageLayout
      eyebrow="Guide"
      h1="Compare 3MF Files — See What Changed"
      dek="3MF carries more structure than STL — explicit units, multiple objects per file, and material/color metadata — but comparing two revisions still comes down to the same question: what changed, and by how much?"
      cta={{ label: "Compare two 3MF files now", to: "/compare-3mf-files" }}
      related={[
        { to: "/stl-diff", label: "Compare STL Files" },
        { to: "/obj-diff", label: "Compare OBJ Files" },
        { to: "/3d-print-version-control", label: "3D Print Version Control" },
        { to: "/docs", label: "Docs & FAQ" },
      ]}
    >
      <h2 className="text-2xl font-bold text-ink-50">Why 3MF is a step up from STL — and still hard to diff</h2>
      <p className="mt-4">
        3MF (3D Manufacturing Format) is a structured XML-based container: unlike STL, it stores explicit units, can
        bundle multiple objects and build items in a single file, and carries color and material assignments —
        which is why slicers like Bambu Studio and PrusaSlicer default to it. That extra structure helps a slicer,
        but it doesn't help you answer "what changed between these two exports." The geometry itself is still a
        triangle mesh per object, and a small edit anywhere in the model can touch every triangle's index order,
        so a raw file or XML diff is just as noisy as it is for STL.
      </p>

      <h2 className="mt-10 text-2xl font-bold text-ink-50">What a real 3MF diff needs to handle</h2>
      <ul className="mt-4 list-disc space-y-2 pl-5">
        <li>
          <strong className="text-ink-100">Multiple objects per file</strong> — a 3MF export from a slicer can
          contain several parts arranged on a build plate. A useful diff needs to compare the actual model geometry,
          not get confused by plate arrangement or a part that moved position without changing shape.
        </li>
        <li>
          <strong className="text-ink-100">Units are explicit</strong> — 3MF declares its unit (millimetre,
          centimetre, inch, etc.) instead of assuming mm like STL. Comparing two 3MF files with different declared
          units without normalizing first will produce a nonsense diff.
        </li>
        <li>
          <strong className="text-ink-100">Production Extension exports</strong> — some slicers (Bambu Studio,
          PrusaSlicer) export multi-file 3MF packages under the 3D Manufacturing Format's Production Extension
          rather than a single flat geometry stream, which a naive parser can silently fail to read.
        </li>
      </ul>

      <h2 className="mt-10 text-2xl font-bold text-ink-50">What Meshdiff actually compares</h2>
      <p className="mt-4">
        Meshdiff parses the 3MF geometry (including Production Extension multi-file exports), normalizes units, and
        voxelizes both versions into a shared grid the same way it does for STL — added geometry in green, removed
        in red, plus a surface-heatmap pass showing dimensional drift as a gradient rather than a single
        bounding-box number. Color and material metadata inform the viewer's rendering but aren't treated as part
        of the geometric delta, since the product question is almost always "did the part change shape," not "did
        someone recolor it."
      </p>

      <h2 className="mt-10 text-2xl font-bold text-ink-50">When to reach for a 3MF diff instead of STL</h2>
      <p className="mt-4">
        If your workflow already exports 3MF — most Bambu Lab and Prusa users do, since it's the slicer default —
        stick with it end to end. Keeping the native format avoids an unnecessary STL round-trip that can introduce
        its own small triangulation differences, which would otherwise show up in the diff as noise unrelated to
        your actual design change.
      </p>

      <h2 className="mt-10 text-2xl font-bold text-ink-50">How to compare two 3MF files</h2>
      <p className="mt-4">
        Open the{" "}
        <a href="/compare-3mf-files" className="text-accent-fg-400 underline underline-offset-2 hover:text-accent-fg-300">
          3MF comparison tool
        </a>
        , drop Version A and Version B into their slots, and Meshdiff runs the voxel and heatmap diff locally in
        your browser. Files are never uploaded to a server for the free comparison — parsing, alignment, and
        diffing all happen client-side.
      </p>
    </ContentPageLayout>
  );
}
