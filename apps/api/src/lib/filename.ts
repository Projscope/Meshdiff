export function sanitizeFilename(name: string): string {
  const extension = name.includes(".") ? name.slice(name.lastIndexOf(".")) : "";
  const base = name.slice(0, name.length - extension.length);
  const safeBase = base.replace(/[^a-zA-Z0-9-]/g, "-").slice(0, 100) || "file";
  const safeExtension = extension.replace(/[^a-zA-Z0-9.]/g, "");
  return `${safeBase}${safeExtension}`;
}

export function extensionOf(name: string): string {
  return name.includes(".") ? name.slice(name.lastIndexOf(".") + 1).toLowerCase() : "";
}
