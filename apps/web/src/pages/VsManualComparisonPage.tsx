import { Link } from "react-router-dom";
import ContentPageLayout from "../components/ContentPageLayout";
import { useDocumentMeta } from "../lib/useDocumentMeta";

export const META_TITLE = "Meshdiff vs. Manually Comparing 3D Models";
export const META_DESCRIPTION =
  "Overlaying two models by eye and toggling visibility only tells you that something changed, not what or by how much. See what a real geometric diff adds.";

export default function VsManualComparisonPage() {
  useDocumentMeta(META_TITLE, META_DESCRIPTION);

  return (
    <ContentPageLayout
      eyebrow="Guide"
      h1="Meshdiff vs. Manually Comparing 3D Models"
      dek="Loading two versions into a viewer and toggling visibility is the default way most people compare 3D models. It works, up to a point — here's where it stops being enough, and what a geometry-based diff adds."
      cta={{ label: "Try the automated diff", to: "/live" }}
      related={[
        { to: "/3d-print-version-control", label: "3D Print Version Control" },
        { to: "/stl-diff", label: "Compare STL Files" },
        { to: "/docs", label: "Docs & FAQ" },
      ]}
    >
      <h2 className="text-2xl font-bold text-ink-50">The manual approach, and why it's the default</h2>
      <p className="mt-4">
        Most people comparing two versions of a 3D model do it the obvious way: open both in a viewer or slicer,
        toggle one's visibility on and off, maybe overlay them at reduced opacity, and look for anything that
        seems different. It's free, it needs no extra tooling, and for an obvious change — a part that's clearly
        twice as tall, or a feature that's clearly missing — it works fine. The problem shows up as soon as the
        change is subtle, the part is complex, or more than one thing changed at once.
      </p>

      <h2 className="mt-10 text-2xl font-bold text-ink-50">Where eyeballing it breaks down</h2>
      <ul className="mt-4 list-disc space-y-2 pl-5">
        <li>
          <strong className="text-ink-100">Small dimensional drift is invisible.</strong> A hole that shrank by
          0.3mm, or a wall that's now 0.6mm instead of 0.9mm, doesn't show up as a visual difference at normal
          zoom — but it's enough to turn a clearance fit into an interference fit, or make a wall fail mid-print.
        </li>
        <li>
          <strong className="text-ink-100">Overlapping changes hide each other.</strong> If one feature got bigger
          while another got smaller, an opacity overlay can visually cancel them out, making the model look
          unchanged when it isn't.
        </li>
        <li>
          <strong className="text-ink-100">There's no number to point to.</strong> "It looks about the same" isn't
          something you can put in a design review, a changelog, or a QA sign-off. A reviewer asking "how much did
          the volume change" gets a guess, not an answer.
        </li>
        <li>
          <strong className="text-ink-100">It doesn't scale past two versions.</strong> Re-doing the visual
          comparison for every pair in a chain of five or six revisions is slow and error-prone, and nobody
          actually does it consistently.
        </li>
      </ul>

      <h2 className="mt-10 text-2xl font-bold text-ink-50">What a geometric diff adds</h2>
      <p className="mt-4">
        Meshdiff replaces the eyeball with a geometry engine: both versions are voxelized into a shared grid and
        compared cell by cell, so added and removed material show up in color — green for added, red for removed —
        instead of relying on visual memory. A second pass computes a signed-distance field between the surfaces,
        producing a heatmap of exactly how far each point moved, in millimetres, not "seems about the same."
        Volume delta, bounding-box change per axis, hole diameter changes, and wall-thickness warnings are all
        computed numbers, not impressions — the kind of output you can actually put in a commit message or a
        review comment.
      </p>

      <h2 className="mt-10 text-2xl font-bold text-ink-50">Where manual comparison is still fine</h2>
      <p className="mt-4">
        To be clear: if the change really is obvious — a completely different part, a feature that was clearly
        deleted — opening both files in any viewer is genuinely faster than running a full diff. The automated
        comparison earns its keep specifically when the change is small, the part is complex, or the answer needs
        to be precise enough to act on rather than just "looks fine to me."
      </p>

      <h2 className="mt-10 text-2xl font-bold text-ink-50">Try it on your own files</h2>
      <p className="mt-4">
        The comparison runs entirely in your browser — no upload, no signup. See the{" "}
        <Link to="/stl-diff" className="text-accent-400 underline underline-offset-2 hover:text-accent-300">
          STL diff guide
        </Link>{" "}
        for a walkthrough of what the tool checks, or jump straight to comparing two files of your own.
      </p>
    </ContentPageLayout>
  );
}
