import { Link } from "react-router-dom";
import ContentPageLayout from "../components/ContentPageLayout";
import { useDocumentMeta } from "../lib/useDocumentMeta";

export const META_TITLE = "Managing Team Members — Meshdiff Team Plan";
export const META_DESCRIPTION =
  "How to invite teammates, assign roles, manage seats, and remove members on Meshdiff's Team plan.";

export default function ManagingTeamMembersPage() {
  useDocumentMeta(META_TITLE, META_DESCRIPTION);

  return (
    <ContentPageLayout
      eyebrow="Guide"
      h1="Managing Team Members"
      dek="Invite teammates, assign the right role, and keep your seat count in check — everything that happens on the Team dashboard."
      cta={{ label: "Open your team dashboard", to: "/projects" }}
      related={[
        { to: "/docs/comments-and-mentions", label: "Comments and Mentions" },
        { to: "/pricing", label: "Pricing" },
        { to: "/docs", label: "Docs & FAQ" },
      ]}
    >
      <h2 className="text-2xl font-bold text-ink-50">Before you start: one team per Team subscription</h2>
      <p className="mt-4">
        Each Team-plan subscription owns exactly one team. If you haven't created yours yet, open the sidebar's
        Teams section from any Projects workspace page and click the <strong className="text-ink-100">+</strong>{" "}
        next to Teams, give it a name, and you're taken straight to its team dashboard — that's the one place
        everything below happens.
      </p>

      <h2 className="mt-10 text-2xl font-bold text-ink-50">Inviting a member</h2>
      <p className="mt-4">
        From the team dashboard, use the <strong className="text-ink-100">Invite a member</strong> form: enter their
        email, pick a role, and click Invite. A few things worth knowing before you do:
      </p>
      <ul className="mt-4 list-disc space-y-2 pl-5">
        <li>
          <strong className="text-ink-100">They need an existing Meshdiff account first.</strong> Invites work by
          email lookup against accounts that have already signed up — there's no "invite someone who's never heard
          of Meshdiff" email flow yet. If you see "No Meshdiff account found for that email," have them create a
          free account, then invite them.
        </li>
        <li>
          <strong className="text-ink-100">Only the team owner or an Admin can invite.</strong> Approvers and
          Members can see the roster but won't see the invite form.
        </li>
        <li>
          <strong className="text-ink-100">You need an open seat.</strong> See Seats and billing below — inviting
          past your purchased seat count is blocked with a clear error rather than silently failing.
        </li>
      </ul>

      <h2 className="mt-10 text-2xl font-bold text-ink-50">The three roles</h2>
      <p className="mt-4">
        Every member (other than the owner) has exactly one role, changeable at any time from the roster's role
        dropdown:
      </p>
      <ul className="mt-4 list-disc space-y-2 pl-5">
        <li>
          <strong className="text-ink-100">Admin</strong> — everything an Approver can do, plus inviting/removing
          members, changing roles, and configuring per-project approval gates. The closest thing to a second owner.
        </li>
        <li>
          <strong className="text-ink-100">Approver</strong> — can approve or request changes on any version across
          the team's projects, but can't manage members or gates. Use this for reviewers who shouldn't also be
          adding or removing people.
        </li>
        <li>
          <strong className="text-ink-100">Member</strong> — can upload versions, comment, and check off approval
          gates, but has no review authority. Everyone starts here unless you pick otherwise at invite time.
        </li>
      </ul>
      <p className="mt-4">
        The <strong className="text-ink-100">owner</strong> — whoever's subscription the team belongs to — always
        has full access and shows as "Owner" in the roster rather than one of the three roles above. The owner's
        access can't be changed or removed through the dashboard, by design: there's always exactly one person who
        can't be locked out of their own team.
      </p>

      <h2 className="mt-10 text-2xl font-bold text-ink-50">Seats and billing</h2>
      <p className="mt-4">
        The <strong className="text-ink-100">Seats</strong> card at the top of the team dashboard shows how many of
        your purchased seats are in use. Seat count is set when you subscribe (adjustable from 1–50 at checkout,
        default 5) and can be changed later — as the owner, click{" "}
        <strong className="text-ink-100">Manage billing</strong> to open the Stripe customer portal, where you can
        change your seat quantity, update your payment method, or cancel. A seat becomes free again the moment a
        member is removed; you don't need to change your subscription just to swap one person for another.
      </p>

      <h2 className="mt-10 text-2xl font-bold text-ink-50">Removing a member</h2>
      <p className="mt-4">
        Click <strong className="text-ink-100">Remove</strong> next to their name in the roster (owner or Admin
        only). They'll lose access to the team's projects immediately, and their seat becomes available for a new
        invite. This can't be undone from the dashboard — you'd need to re-invite them to restore access. Note that
        you can't remove yourself this way (there's no "leave a team" flow yet), and the owner can never be removed.
      </p>

      <h2 className="mt-10 text-2xl font-bold text-ink-50">Keeping track of who did what</h2>
      <p className="mt-4">
        The team dashboard's <strong className="text-ink-100">Activity</strong> log records every invite, removal,
        role change, and version approval/rejection across the team, filterable by date range and by member — useful
        for answering "who added this person" or "who approved v4" without having to ask.
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
