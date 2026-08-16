import LiveDiffToolPage from "./LiveDiffToolPage";

/** SEO landing page for "compare two stl files" — same tool as /live,
 * opened straight into Compare mode with keyword-specific H1/meta. */
export default function CompareStlFilesPage() {
  return (
    <LiveDiffToolPage
      h1="Compare Two STL Files Online"
      ctaText="Drag & drop Version A and B to run local voxel diff."
      metaTitle="Compare Two STL Files Online — Free Voxel Diff | Meshdiff"
      metaDescription="Compare two STL files online for free. Drag & drop Version A and B to run a local voxel diff in your browser — no uploads, no signup."
      autoOpenCompare
    />
  );
}
