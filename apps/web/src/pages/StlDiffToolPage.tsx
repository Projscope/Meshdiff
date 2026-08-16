import LiveDiffToolPage from "./LiveDiffToolPage";

/** SEO landing page for "stl diff tool" — same tool as /live, opened
 * straight into Compare mode with keyword-specific H1/meta. */
export default function StlDiffToolPage() {
  return (
    <LiveDiffToolPage
      h1="Free Web Browser STL Diff Tool"
      ctaText="Upload files for local WASM comparison (zero server uploads)."
      metaTitle="Free STL Diff Tool — Browser-Based, No Uploads | Meshdiff"
      metaDescription="Free STL diff tool that runs entirely in your browser via local WASM comparison. Zero server uploads, no signup required."
      autoOpenCompare
    />
  );
}
