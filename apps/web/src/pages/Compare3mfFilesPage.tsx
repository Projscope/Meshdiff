import LiveDiffToolPage from "./LiveDiffToolPage";

/** SEO landing page for "compare 3mf files online" — same tool as /live,
 * opened straight into Compare mode with keyword-specific H1/meta. */
export default function Compare3mfFilesPage() {
  return (
    <LiveDiffToolPage
      h1="Compare 3MF & OBJ Revisions"
      ctaText="Inspect 3D model iterations and dimensional drift."
      metaTitle="Compare 3MF Files Online — 3MF & OBJ Diff | Meshdiff"
      metaDescription="Compare 3MF files online for free. Inspect 3D model iterations and dimensional drift between revisions — runs locally in your browser."
      autoOpenCompare
    />
  );
}
