import { Link } from "react-router-dom";
import ContentPageLayout from "../components/ContentPageLayout";
import { useDocumentMeta } from "../lib/useDocumentMeta";

export const META_TITLE = "Approval Gates — Meshdiff Team Plan";
export const META_DESCRIPTION =
  "How configurable approval gates work on Meshdiff's Team plan: setting up a checklist, who can check items off, and how it blocks approval.";

export default function ApprovalGatesPage() {
  useDocumentMeta(META_TITLE, META_DESCRIPTION);

  return (
    <ContentPageLayout
      eyebrow="Guide"
      h1="Approval Gates"
      dek="A configurable checklist per project that has to be fully checked off before a version can be approved."
      cta={{ label: "Open your projects", to: "/projects" }}
      related={[
        { to: "/docs/version-review-workflow", label: "Version Review Workflow" },
        { to: "/docs/managing-team-members", label: "Managing Team Members" },
        { to: "/docs", label: "Docs & FAQ" },
      ]}
    >
      <h2 className="text-2xl font-bold text-ink-50">Team-only, and scoped to the project</h2>
      <p className="mt-4">
        Approval gates exist only on Team projects — a personal Pro project has no review step for them to gate.
        They're also scoped to the <strong className="text-ink-100">project</strong>, not the team: two projects
        owned by the same team can have completely different checklists, since a bracket and an enclosure might
        reasonably need different sign-offs.
      </p>

      <h2 className="mt-10 text-2xl font-bold text-ink-50">Setting one up</h2>
      <p className="mt-4">
        On a version's page, find the <strong className="text-ink-100">Approval Gates</strong> panel and type a
        label into <strong className="text-ink-100">Add a gate…</strong> — something like "Geometry reviewed" or
        "Client sign-off." Only the project owner or a team Admin can add or remove gate definitions; anyone else
        sees the checklist but not the input to change it.
      </p>

      <h2 className="mt-10 text-2xl font-bold text-ink-50">Checking items off</h2>
      <p className="mt-4">
        Unlike configuring the checklist itself, <strong className="text-ink-100">any project member</strong> can
        check a box — the person who ran the slicer check is usually the right one to confirm "Printability passed,"
        not necessarily an admin. Checking the last remaining box notifies every reviewer (Admins, Approvers, and
        the owner) that the version is now ready to approve, so nobody has to keep re-checking the list themselves.
      </p>

      <h2 className="mt-10 text-2xl font-bold text-ink-50">
        Gates only apply to versions finalized after they're created
      </h2>
      <p className="mt-4">
        This is the one behavior that surprises people: adding a new gate does <strong className="text-ink-100">not</strong>{" "}
        retroactively apply it to versions that already exist. A version only gets a checklist entry for the gates
        that existed at the moment it finished uploading. If you add "Client sign-off" today, your current version
        won't show it — only the next version you upload will. There's currently no way to backfill a gate onto an
        already-uploaded version.
      </p>

      <h2 className="mt-10 text-2xl font-bold text-ink-50">Removing a gate</h2>
      <p className="mt-4">
        Removing a gate is a soft delete — it stops appearing on future versions, but the checkmarks it already
        collected on older versions stay exactly as they were. Nothing about a version's past approval history
        changes just because a gate definition was later removed.
      </p>

      <h2 className="mt-10 text-2xl font-bold text-ink-50">How this affects approving</h2>
      <p className="mt-4">
        Every currently-active gate on a version has to be checked before it can be approved. Trying to approve
        early is rejected with the specific labels still outstanding named in the error — never a vague "requirements
        not met." See{" "}
        <Link to="/docs/version-review-workflow" className="text-accent-fg-400 underline underline-offset-2 hover:text-accent-fg-300">
          Version Review Workflow
        </Link>{" "}
        for the rest of the approve/request-changes process gates plug into.
      </p>

      <p className="mt-10 text-sm text-ink-400">
        Have a question this didn't cover? Email{" "}
        <a
          href="mailto:support@projscope.com"
          className="text-accent-fg-400 underline underline-offset-2 hover:text-accent-fg-300"
        >
          support@projscope.com
        </a>
        , or see the full{" "}
        <Link to="/docs" className="text-accent-fg-400 underline underline-offset-2 hover:text-accent-fg-300">
          Docs & FAQ
        </Link>
        .
      </p>
    </ContentPageLayout>
  );
}
