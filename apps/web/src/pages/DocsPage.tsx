import { Link } from "react-router-dom";
import ContentPageLayout from "../components/ContentPageLayout";
import { useDocumentMeta } from "../lib/useDocumentMeta";

export const META_TITLE = "Docs & FAQ — How Meshdiff Works";
export const META_DESCRIPTION =
  "How to compare two STL files, what voxel diffing is, which formats are supported, whether your file is ever uploaded, and what dimensional drift means.";

interface Faq {
  q: string;
  a: string;
}

const FAQS: Faq[] = [
  {
    q: "How do I compare two STL files?",
    a: 'Open the free diff tool (or the dedicated /compare-stl-files page), drag your "before" file into the Version A slot and your "after" file into Version B, then run the comparison. Meshdiff voxelizes both meshes into a shared grid and highlights added geometry in green and removed geometry in red, with an optional surface-heatmap layer showing dimensional drift.',
  },
  {
    q: "What is voxel diffing?",
    a: "Voxel diffing divides the 3D space both models occupy into a shared grid of small cubes (voxels), then classifies each voxel as added (occupied in Version B but not A), removed (occupied in A but not B), or unchanged. It's the same underlying idea as volumetric CSG, but Meshdiff uses it purely for comparison and visualization — it never produces a merged output mesh, and it never runs a boolean operation on the original geometry.",
  },
  {
    q: "What file formats are supported?",
    a: "STL, 3MF, and OBJ, all parsed natively in your browser with no server-side conversion step. STL and OBJ assume millimetre units; 3MF units are read from the file itself.",
  },
  {
    q: "Is my file ever uploaded anywhere?",
    a: "In the free Community tool, no — comparing or measuring a model happens entirely in your browser, and the files never leave your machine. The one exception is creating a share link, which uploads both files directly to storage (not through Meshdiff's own servers) so the recipient can view the same comparison. Pro and Team plans upload files to storage by design, since they provide saved projects, version history, and team review.",
  },
  {
    q: "What does dimensional drift mean?",
    a: "Dimensional drift is how far a surface has moved between two versions, measured point by point rather than as a single bounding-box number. Meshdiff computes it with a per-vertex signed-distance field: for each point on one surface, it finds the nearest point on the other and records the signed distance — positive where the surface pushed outward, negative where it pulled inward — then renders that as a color gradient (heatmap) over the model.",
  },
];

const faqJsonLd = {
  "@context": "https://schema.org",
  "@type": "FAQPage",
  mainEntity: FAQS.map((faq) => ({
    "@type": "Question",
    name: faq.q,
    acceptedAnswer: {
      "@type": "Answer",
      text: faq.a,
    },
  })),
};

export default function DocsPage() {
  useDocumentMeta(META_TITLE, META_DESCRIPTION);

  return (
    <ContentPageLayout
      eyebrow="Docs"
      h1="Docs & FAQ"
      dek="How Meshdiff's comparison actually works, what's supported, and what happens to your files."
      cta={{ label: "Open the diff tool", to: "/live" }}
      related={[
        { to: "/stl-diff", label: "Compare STL Files" },
        { to: "/3mf-diff", label: "Compare 3MF Files" },
        { to: "/obj-diff", label: "Compare OBJ Files" },
        { to: "/3d-print-version-control", label: "3D Print Version Control" },
      ]}
    >
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(faqJsonLd) }} />

      <div className="flex flex-col gap-10">
        {FAQS.map((faq) => (
          <div key={faq.q}>
            <h2 className="text-xl font-bold text-ink-50">{faq.q}</h2>
            <p className="mt-3">{faq.a}</p>
          </div>
        ))}
      </div>

      <p className="mt-10 text-sm text-ink-400">
        Still have a question? Email{" "}
        <a href="mailto:support@projscope.com" className="text-accent-400 underline underline-offset-2 hover:text-accent-300">
          support@projscope.com
        </a>
        , or see the{" "}
        <Link to="/roadmap" className="text-accent-400 underline underline-offset-2 hover:text-accent-300">
          roadmap and changelog
        </Link>
        .
      </p>
    </ContentPageLayout>
  );
}
