import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import ErrorBoundary, { ErrorFallback } from "./ErrorBoundary";

// The web tests run in a plain Node environment (no DOM), so the boundary's
// behaviour is checked through its static pieces; the full render-error path is
// exercised by the desktop app's end-to-end test.
describe("ErrorBoundary", () => {
  it("turns a thrown error into state", () => {
    const error = new Error("boom");
    expect(ErrorBoundary.getDerivedStateFromError(error)).toEqual({ error });
  });

  it("clears the error when the route changes, and keeps it otherwise", () => {
    const state = { error: new Error("boom"), resetKey: "/p/1" };
    expect(ErrorBoundary.getDerivedStateFromProps({ resetKey: "/p/2", children: null }, state)).toEqual({ error: null, resetKey: "/p/2" });
    expect(ErrorBoundary.getDerivedStateFromProps({ resetKey: "/p/1", children: null }, state)).toBeNull();
  });

  it("renders the children when nothing failed", () => {
    expect(renderToStaticMarkup(<ErrorBoundary resetKey="/"><p>fine</p></ErrorBoundary>)).toBe("<p>fine</p>");
  });

  it("the fallback shows the message and a way back", () => {
    const html = renderToStaticMarkup(<ErrorFallback error={new Error("Cannot read x")} onReset={() => {}} />);
    expect(html).toContain("Something went wrong on this page");
    expect(html).toContain("Cannot read x");
    expect(html).toContain('href="#/"');
    expect(html).toContain("Reload");
  });
});
