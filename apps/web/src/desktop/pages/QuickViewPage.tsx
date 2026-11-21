import MeasureViewer from "../../components/MeasureViewer";

/** Open any model without adding it to a project: view, measure, and check printability. */
export default function QuickViewPage() {
  return (
    <div className="h-full p-3">
      <MeasureViewer demoUrl="/demo/gear-v1.stl" />
    </div>
  );
}
