import { Link } from "react-router-dom";
import ContentPageLayout from "../components/ContentPageLayout";
import { useDocumentMeta } from "../lib/useDocumentMeta";

export const META_TITLE = "Version Review Workflow — Meshdiff Team Plan";
export const META_DESCRIPTION =
  "How Meshdiff's five-state version review works on the Team plan: submitting for review, approving, requesting changes, and what supersedes a version.";

export default function VersionReviewWorkflowPage() {
  useDocumentMeta(META_TITLE, META_DESCRIPTION);

  return (
    <ContentPageLayout
      eyebrow="Guide"
      h1="Version Review Workflow"
      dek="Every version on a Team project moves through a real review state machine — here's what each state means and who can move it."
      cta={{ label: "Open your projects", to: "/projects" }}
      related={[
        { to: "/docs/approval-gates", label: "Approval Gates" },
        { to: "/docs/managing-team-members", label: "Managing Team Members" },
        { to: "/docs/comments-and-mentions", label: "Comments and Mentions" },
      ]}
    >
      <h2 className="text-2xl font-bold text-ink-50">Personal projects skip this entirely</h2>
      <p className="mt-4">
        This whole workflow only applies to <strong className="text-ink-100">Team</strong> projects (ones assigned
        to a team). A personal Pro project has no one to review against, so every upload auto-approves the moment
        it finishes processing — there's no review state to manage there at all.
      </p>

      <h2 className="mt-10 text-2xl font-bold text-ink-50">The five states</h2>
      <ul className="mt-4 list-disc space-y-2 pl-5">
        <li>
          <strong className="text-ink-100">Draft</strong> — not currently reachable from the upload flow itself
          (every upload lands straight in In Review). Reserved for a future "save without submitting" action.
        </li>
        <li>
          <strong className="text-ink-100">In Review</strong> — where every new version starts. Waiting on a
          decision from someone with review rights.
        </li>
        <li>
          <strong className="text-ink-100">Changes Requested</strong> — a reviewer sent it back, usually with a
          reason attached (e.g. "wall thickness under 0.8mm near the mounting tab").
        </li>
        <li>
          <strong className="text-ink-100">Approved</strong> — signed off. This is the version{" "}
          <Link to="/3d-print-version-control" className="text-accent-400 underline underline-offset-2 hover:text-accent-300">
            shareable links and downloads
          </Link>{" "}
          default to when nothing more specific is requested.
        </li>
        <li>
          <strong className="text-ink-100">Superseded</strong> — was Approved, but a newer version has since taken
          its place. Set automatically (see below) — nobody chooses this state directly.
        </li>
      </ul>

      <h2 className="mt-10 text-2xl font-bold text-ink-50">Who can approve or request changes</h2>
      <p className="mt-4">
        The project owner can always review, regardless of their team role. On top of that, a Team project's{" "}
        <strong className="text-ink-100">Admin</strong> and <strong className="text-ink-100">Approver</strong> roles
        can approve or request changes; a plain <strong className="text-ink-100">Member</strong> can upload and
        comment but has no review authority. See{" "}
        <Link to="/docs/managing-team-members" className="text-accent-400 underline underline-offset-2 hover:text-accent-300">
          Managing Team Members
        </Link>{" "}
        for the full breakdown of what each role can do.
      </p>

      <h2 className="mt-10 text-2xl font-bold text-ink-50">Only one Approved version at a time</h2>
      <p className="mt-4">
        Approving a version automatically flips whichever version was previously Approved in that project to{" "}
        <strong className="text-ink-100">Superseded</strong> — there's only ever one "current" approved version per
        project. You don't have to manually clean up older approvals; it happens as part of the same approve action.
      </p>

      <h2 className="mt-10 text-2xl font-bold text-ink-50">Approval can be blocked by gates</h2>
      <p className="mt-4">
        If the project has approval gates configured, every one of them must be checked off before a version can be
        approved — attempting to approve early is rejected with the specific gate labels still outstanding, not just
        a generic error. See{" "}
        <Link to="/docs/approval-gates" className="text-accent-400 underline underline-offset-2 hover:text-accent-300">
          Approval Gates
        </Link>{" "}
        for how those checklists work.
      </p>

      <h2 className="mt-10 text-2xl font-bold text-ink-50">Every transition is recorded</h2>
      <p className="mt-4">
        A version's <strong className="text-ink-100">Review History</strong> (on its detail page) lists every state
        change in order — who did it, when, what it changed from and to, and the reason if one was given. This is
        the actual audit trail; unlike the flat "last reviewer" of a simpler approve/reject system, nothing gets
        overwritten when a version goes through several rounds of changes-requested-then-resubmitted.
      </p>

      <h2 className="mt-10 text-2xl font-bold text-ink-50">Notifications</h2>
      <p className="mt-4">
        Submitting a version for review notifies every reviewer on the project (its Admins, Approvers, and the
        owner). Approving or requesting changes notifies whoever uploaded that version. Every notification names the
        project and version, and clicking one takes you straight there.
      </p>

      <p className="mt-10 text-sm text-ink-400">
        Have a question this didn't cover? Email{" "}
        <a
          href="mailto:support@projscope.com"
          className="text-accent-400 underline underline-offset-2 hover:text-accent-300"
        >
          support@projscope.com
        </a>
        , or see the full{" "}
        <Link to="/docs" className="text-accent-400 underline underline-offset-2 hover:text-accent-300">
          Docs & FAQ
        </Link>
        .
      </p>
    </ContentPageLayout>
  );
}
