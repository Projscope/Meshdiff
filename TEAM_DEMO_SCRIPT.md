# Meshdiff Team — Review Workflow Showcase Script (~75 seconds)

Narration drawn directly from the blog post "Comparing Two STL Files Was
Never the Real Problem." Uses the pre-seeded `QA Approval Test` project
(4 versions, two authors: `jviaches@gmail.com` and `qa-member@meshdiff.test`)
on the `QA Approval Team`. Recorded with Windows Game Bar (Win+G) while
Claude drives the Browser pane live — no editing, single continuous take.

---

## 1. Hook (0:00–0:08)

**Action**: Projects list. Point out the **Team plan** badge (top right)
and **QA Approval Team** under Teams in the sidebar.

**Narration**: "Two files aren't a workflow. Comparing version A to
version B just answers one question — what's different. On a Team
project, that's the start of the process, not the end of it."

---

## 2. Compare — what changed (0:08–0:22)

**Action**: Open QA Approval Test → Compare v3 → v4 → voxel diff view.

**Narration**: "Compare — see exactly what changed, geometrically. Volume
up 27.5%, bounding box grew 2mm in Y and Z. That's the foundation — you
can't review a change intelligently without knowing exactly what changed
first."

---

## 3. Discuss — comment pins (0:22–0:38)

**Action**: Open v3 (STABLE, 💬 2 unresolved) → point out the pin markers
on the model → click one to show the attached comment thread.

**Narration**: "Discuss — flag the thing that's wrong, pinned to the
actual spot on the model. Not described in a Slack message with no
context. It stays right there for the next person who opens this
version."

---

## 4. Resolve — did the fix land? (0:38–0:52)

**Action**: Open v2 (Changes Requested) → show the rejection reason
banner: "Wall thickness under 0.8mm near the mounting tab — please
thicken before resubmitting." Then jump to v3 (STABLE) to show it was
fixed and approved.

**Narration**: "Resolve — track whether that specific issue actually got
fixed in the next revision, instead of just hoping. Here it's on the
record: rejected for wall thickness, fixed in the next version, approved."

---

## 5. Approve — who signs off (0:52–1:10)

**Action**: Open v4 (In Review, 5 gates unchecked) → check off the
approval gates (Geometry reviewed, Printability passed, Client Sign off)
→ click Approve.

**Narration**: "Approve — know, unambiguously, which revision is the one
that gets manufactured. An admin or approver signs off, gates get
checked, and that decision — along with a reason if it's ever rejected —
stays on the record."

---

## 6. Close (1:10–1:15)

**Action**: Back to project overview — approval rate stat, version count.

**Narration**: "Meshdiff Team — the diff engine answers what changed. The
review workflow answers the harder question: are we allowed to build this
yet?"

---

## Recording notes

- Start Win+G recording before beat 1, stop after beat 6 — one
  continuous take, no cuts needed between beats.
- Browser pane is at 1920×1080-equivalent scale; resize the OS window
  wide enough that the 3D viewport and side panel are both legible.
- Claude will call out "next beat" verbally between sections so you know
  when to let a moment breathe for narration/voiceover added later.
