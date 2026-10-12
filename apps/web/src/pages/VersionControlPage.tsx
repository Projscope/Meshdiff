import { Link } from "react-router-dom";
import ContentPageLayout from "../components/ContentPageLayout";
import { useDocumentMeta } from "../lib/useDocumentMeta";

export const META_TITLE = "3D Print Version Control — Track Every Revision | Meshdiff";
export const META_DESCRIPTION =
  "Git tracks text line by line. Meshdiff tracks 3D models revision by revision — added material, removed material, dimensional drift — so your print iterations have a real history.";

export default function VersionControlPage() {
  useDocumentMeta(META_TITLE, META_DESCRIPTION);

  return (
    <ContentPageLayout
      eyebrow="Guide"
      h1="3D Print Version Control"
      dek="Git can track your slicer profile as text, but it can't tell you what changed inside the STL. Meshdiff is the missing layer: version history for the mesh itself."
      cta={{ label: "See project version history", to: "/live" }}
      related={[
        { to: "/stl-diff", label: "Compare STL Files" },
        { to: "/vs-manual-comparison", label: "Meshdiff vs. Manual Comparison" },
        { to: "/docs", label: "Docs & FAQ" },
        { to: "/pricing", label: "Pricing" },
      ]}
    >
      <h2 className="text-2xl font-bold text-ink-50">Text version control doesn't work for meshes</h2>
      <p className="mt-4">
        Git, and every version control system built on it, works by diffing lines of text. That's fine for code and
        even for a slicer's <code className="rounded-sm bg-ink-900 px-1.5 py-0.5 text-xs">.gcode</code> or config
        files, but it falls apart the moment you point it at an STL, 3MF, or OBJ file. Binary mesh formats have no
        "lines" to diff — a single tweak to one dimension can reorder every triangle in the file, so Git sees a
        completely rewritten blob and can tell you nothing more useful than "this file changed." You end up back to
        opening both versions in a viewer and eyeballing them side by side, which is exactly the workflow every
        maker and CAD engineer already knows doesn't scale past two or three iterations.
      </p>

      <h2 className="mt-10 text-2xl font-bold text-ink-50">What "version control" should mean for a printed part</h2>
      <p className="mt-4">
        For an iterative print workflow, useful version history answers a small, specific set of questions for
        every revision: what geometry was added or removed since the last version, how much the part's volume and
        bounding box changed, whether any wall got thinner than your printer can reliably produce, and whether the
        part still passes a printability check. That's a geometry problem, not a text-diff problem — which is why
        Meshdiff computes it directly from the mesh instead of trying to bolt version control onto a format it was
        never designed for.
      </p>

      <h2 className="mt-10 text-2xl font-bold text-ink-50">How it works in an iterative workflow</h2>
      <ul className="mt-4 list-disc space-y-2 pl-5">
        <li>
          <strong className="text-ink-100">Upload each revision</strong> as you print and iterate — v1, v2, v3 — and
          every version keeps its own record rather than overwriting the last.
        </li>
        <li>
          <strong className="text-ink-100">See a real diff between any two versions</strong>, not just the most
          recent pair — volume delta, bounding-box change, hole and wall-thickness changes, and a printability
          gate (pass / warn / fail) computed fresh for that version.
        </li>
        <li>
          <strong className="text-ink-100">Keep a traceable history</strong> of what changed and when, so "why did
          we change the mounting hole diameter in v4" has an answer that doesn't depend on anyone's memory.
        </li>
        <li>
          <strong className="text-ink-100">Add team review</strong> when more than one person touches a part —
          pending, approved, or rejected status per version, with rejection reasons kept on record, so a part only
          becomes the version everyone builds on once someone has actually signed off.
        </li>
      </ul>

      <h2 className="mt-10 text-2xl font-bold text-ink-50">Who this is for</h2>
      <p className="mt-4">
        Solo makers iterating on a design across a dozen prints benefit from a simple, chronological version
        history without needing to invent their own file-naming convention. Hardware startups and print farms get
        the same history plus an approval workflow, so a revision doesn't reach production tooling until it's been
        reviewed. Either way, the underlying need is the same: know exactly what changed, without re-deriving it by
        eye every time.
      </p>

      <p className="mt-6">
        The comparison engine itself is free and requires no account — see the{" "}
        <Link to="/stl-diff" className="text-accent-fg-400 underline underline-offset-2 hover:text-accent-fg-300">
          STL diff guide
        </Link>{" "}
        for how the underlying voxel diff works. Saved project history and team approvals are part of the{" "}
        <Link to="/pricing" className="text-accent-fg-400 underline underline-offset-2 hover:text-accent-fg-300">
          Pro and Team plans
        </Link>
        .
      </p>
    </ContentPageLayout>
  );
}
