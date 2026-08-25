# Meshdiff Pro — Feature Showcase Script (~90 seconds)

A shot-by-shot script for a short marketing video demonstrating Meshdiff
Pro. Each beat lists the exact on-screen action, a suggested narration
line, and an approximate duration. Total runtime target: ~90 seconds.

---

## 1. Hook (0:00–0:05)

**Action**: Open the landing page (`meshdiff.com`), hero section in view.

**Narration**: "This is Meshdiff — see exactly what changed between two
3D model versions."

---

## 2. Project workspaces (0:05–0:20)

**Action**: Sign in → Projects list → open a project with several
versions → show the version history timeline (thumbnails + printability
status badge per version).

**Narration**: "Pro gives you saved project workspaces — every version
you upload is tracked, with a full history and printability status at a
glance."

---

## 3. Version comparison (0:20–0:40)

**Action**: Open Compare view between two versions → voxel diff
(green = added, red = removed) → switch to Overlay mode → show the
diff-colored volume delta stats.

**Narration**: "Compare any two versions directly — added and removed
material shown in color, with the exact volume change calculated for
you."

---

## 4. Comment pins (0:40–1:00)

**Action**: Click a spot directly on the 3D model → add a comment → show
a reply added to the thread.

**Narration**: "Leave feedback right where it matters — click anywhere on
the model to pin a comment, and keep the whole conversation attached to
that exact spot. Comment pins are a Pro feature."

---

## 5. Measure tools (1:00–1:10)

**Action**: Distance measurement between two points, then radius/diameter
measurement on a hole — show the auto-detected before → after diameter
badge on the Compare/Overlay view.

**Narration**: "Built-in measurement tools — including automatic hole and
diameter-change detection between versions."

---

## 6. PDF report export (1:10–1:25)

**Action**: Click "Download Report" → show the resulting PDF opening
(screenshots, geometric delta, printability details, hole inventory
sections).

**Narration**: "Export a complete PDF report for client review — geometry,
printability, and hole inventory, all in one document."

---

## 7. Close (1:25–1:30)

**Action**: Cut to the pricing section, Pro card in view.

**Narration**: "Meshdiff Pro — try it today."

---

## Notes for whoever records/edits this

- Record at 1920×1080 minimum; the 3D viewer and PDF text both need to be
  legible at normal video size.
- Each beat above should get its own clean take — don't rush the comment
  pin or measurement beats, they involve multiple clicks.
- No GIF/video capture tooling was available this session (Claude in
  Chrome extension not connected), so no footage file was produced. Every
  beat was instead click-tested live against a brand-new Pro account
  (`meshdiff.prodemo@gmail.com`, local Stripe test-mode checkout) on
  2026-08-24 to confirm the shot list is accurate and nothing has drifted
  from the current UI:
  - Beat 2: project workspace + version history timeline with volume delta
    and Approved badges — confirmed.
  - Beat 3: Compare view, voxel diff (green/red), geometric delta panel
    (+42.9% volume) — confirmed.
  - Beat 4: 💬 comment-pin toolbar button → click on model → pin dropped +
    comment posted — confirmed, on `/versions/:id`, not the Compare page.
  - Beat 5: distance/radius measurement toolbar buttons, click-to-place —
    confirmed.
  - Beat 6: "Download Report" button on the Compare page generates the PDF
    client-side (no server round-trip) — confirmed, download fired.
  - Beat 7: Pricing page, Pro card — confirmed.
- To actually record: connect the Claude in Chrome extension
  (https://chromewebstore.google.com/detail/fcoeoabgfenejglbffodgkkbkcdhcgfn)
  and re-run this shot list with `gif_creator` for a first-pass GIF, or
  screen-record manually at full video quality per the confirmed steps
  above.
