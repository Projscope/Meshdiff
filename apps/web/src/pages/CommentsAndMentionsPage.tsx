import { Link } from "react-router-dom";
import ContentPageLayout from "../components/ContentPageLayout";
import { useDocumentMeta } from "../lib/useDocumentMeta";

export const META_TITLE = "Comments and Mentions — Meshdiff Guide";
export const META_DESCRIPTION =
  "How to pin comments to a 3D model, reply and resolve threads, assign and prioritize feedback, and use @mentions to notify a teammate.";

export default function CommentsAndMentionsPage() {
  useDocumentMeta(META_TITLE, META_DESCRIPTION);

  return (
    <ContentPageLayout
      eyebrow="Guide"
      h1="Comments and Mentions"
      dek="Feedback pinned to the exact spot on the model it's about, with statuses, assignees, and @mentions that notify the right person."
      cta={{ label: "Open your projects", to: "/projects" }}
      related={[
        { to: "/docs/version-review-workflow", label: "Version Review Workflow" },
        { to: "/docs/managing-team-members", label: "Managing Team Members" },
        { to: "/docs", label: "Docs & FAQ" },
      ]}
    >
      <h2 className="text-2xl font-bold text-ink-50">Who has comments</h2>
      <p className="mt-4">
        Comment pins are a <strong className="text-ink-100">Pro-and-above</strong> feature — available on any Pro or
        Team project, not just Team ones. If you're on the Free plan, you can still view the Sample Project's
        comments, but adding new ones requires upgrading.
      </p>

      <h2 className="mt-10 text-2xl font-bold text-ink-50">Placing a comment</h2>
      <p className="mt-4">
        Open a version, click the 💬 button in the toolbar to enter comment-placement mode, then click anywhere on
        the model. A pin drops at that exact point — including its surface normal, so it stays anchored to the right
        spot even as you rotate — and a popover opens for you to write the comment. Every comment lives on one
        specific version; it doesn't automatically carry forward to the next upload.
      </p>

      <h2 className="mt-10 text-2xl font-bold text-ink-50">Replying</h2>
      <p className="mt-4">
        Click a pin to reopen its popover, then <strong className="text-ink-100">Reply</strong> to add to the
        thread. Threads are one level deep — you can reply to the original comment, but not to a reply — which keeps
        every conversation a simple back-and-forth rather than a nested tree. A pin's badge shows the total message
        count once a thread has more than one message.
      </p>

      <h2 className="mt-10 text-2xl font-bold text-ink-50">Status: Open, Resolved, Reopened</h2>
      <p className="mt-4">
        Every comment (and every reply, independently) has a status, shown as a colored badge:
      </p>
      <ul className="mt-4 list-disc space-y-2 pl-5">
        <li>
          <strong className="text-ink-100">Open</strong> — the default; nobody's marked it handled yet.
        </li>
        <li>
          <strong className="text-ink-100">Resolved</strong> — the author, the assignee, or a project owner/admin
          marked the issue addressed. Click <strong className="text-ink-100">Resolve</strong> on the comment.
        </li>
        <li>
          <strong className="text-ink-100">Reopened</strong> — a previously-resolved comment that needs attention
          again. Clicking the toggle on a resolved comment reopens it rather than reverting to plain Open — that
          amber badge is a deliberate signal that this was closed once already, not just untouched.
        </li>
      </ul>
      <p className="mt-4">
        The Comments panel's <strong className="text-ink-100">Open</strong> filter tab includes both Open and
        Reopened comments together, since both need someone's attention — Resolved is the only state that's
        filtered out.
      </p>

      <h2 className="mt-10 text-2xl font-bold text-ink-50">Assigning and prioritizing</h2>
      <p className="mt-4">
        On a Team project, any comment can be handed to a specific teammate — set an{" "}
        <strong className="text-ink-100">assignee</strong> and, optionally, a{" "}
        <strong className="text-ink-100">priority</strong> (Low, Normal, or High). Only the comment's author or a
        project owner/admin can change the assignee or priority — a plain assignee can't reassign themselves away or
        bump their own priority. The Comments panel's{" "}
        <strong className="text-ink-100">Assigned to me</strong> filter is the fastest way to find your own queue
        across a version.
      </p>

      <h2 className="mt-10 text-2xl font-bold text-ink-50">@Mentions</h2>
      <p className="mt-4">
        Type <code className="rounded bg-ink-900 px-1.5 py-0.5 text-xs">@</code> followed by a teammate's email
        anywhere in a comment or reply — Meshdiff matches by full email address, not a username or handle, the same
        convention team invites already use. A mention only notifies someone if they actually have access to the
        project; an @-mention of an email with no access (or no Meshdiff account at all) is simply left as plain
        text — no error, no broken link.
      </p>

      <h2 className="mt-10 text-2xl font-bold text-ink-50">What triggers a notification</h2>
      <p className="mt-4">Four things about a comment generate an in-app notification (the bell icon, top bar):</p>
      <ul className="mt-4 list-disc space-y-2 pl-5">
        <li>
          <strong className="text-ink-100">You're @mentioned</strong> in a comment or reply.
        </li>
        <li>
          <strong className="text-ink-100">You're assigned</strong> a comment (assigning to yourself doesn't notify
          you — there'd be nothing to tell you).
        </li>
        <li>
          <strong className="text-ink-100">A comment you authored or are assigned to gets resolved or reopened</strong>{" "}
          by someone else.
        </li>
        <li>
          A version's <strong className="text-ink-100">approval gates all get checked off</strong> — not a comment
          notification exactly, but it fires from the same review activity and lands in the same inbox.
        </li>
      </ul>
      <p className="mt-4">
        Every notification names the project and version it's about (e.g. "You were mentioned in a comment on
        Robot Housing (v14)"), and clicking one takes you straight to that exact comment — its popover opens
        automatically with an accent-colored highlight, so you land on the right message in the thread instead of
        just the version page. Notifications are in-app only for now; there's no email delivery yet.
      </p>

      <h2 className="mt-10 text-2xl font-bold text-ink-50">Deleting a comment</h2>
      <p className="mt-4">
        You can always delete your own comments and replies. A project owner or admin can delete anyone's — useful
        for moderating a thread that's gone stale or off-topic. Deleting a top-level comment removes its replies
        along with it.
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
