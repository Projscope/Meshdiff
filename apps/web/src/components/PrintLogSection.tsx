import { useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import CollapsibleSection from "./CollapsibleSection";
import {
  deletePrintPhoto,
  deleteSlicerProfile,
  getPrintPhotoUploadUrl,
  getSlicerProfileUploadUrl,
  uploadVersionBytes,
  type PrintPhotoAttachment,
  type SlicerProfileAttachment,
} from "../lib/projectsApi";

interface PrintLogSectionProps {
  projectId: string;
  versionId: string;
  slicerProfile: SlicerProfileAttachment | null;
  printPhoto: PrintPhotoAttachment | null;
  /** Re-fetches the version so freshly-signed download URLs replace the
   * stale ones after an upload/remove — the parent already owns that
   * fetch (see VersionDetailPage.tsx). */
  onChange: () => void;
}

/** Slicer profile snapshot + print result photo, attached per version (see
 * CLAUDE.md's Team-tier "slicer profile snapshots"/"print result logging").
 * The slicer profile is deliberately opaque, unparsed text — this is a
 * reference attachment, not a settings diff. */
export default function PrintLogSection({
  projectId,
  versionId,
  slicerProfile,
  printPhoto,
  onChange,
}: PrintLogSectionProps) {
  const { t } = useTranslation();
  return (
    <CollapsibleSection title={t("printLog.title")}>
      <SlicerProfileBlock
        projectId={projectId}
        versionId={versionId}
        attachment={slicerProfile}
        onChange={onChange}
      />
      <PrintPhotoBlock
        projectId={projectId}
        versionId={versionId}
        attachment={printPhoto}
        onChange={onChange}
      />
    </CollapsibleSection>
  );
}

function SlicerProfileBlock({
  projectId,
  versionId,
  attachment,
  onChange,
}: {
  projectId: string;
  versionId: string;
  attachment: SlicerProfileAttachment | null;
  onChange: () => void;
}) {
  const { t } = useTranslation();
  const inputRef = useRef<HTMLInputElement>(null);
  const [isBusy, setIsBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleFile(file: File) {
    setIsBusy(true);
    setError(null);
    const urlResult = await getSlicerProfileUploadUrl(projectId, versionId, file);
    if (!urlResult.success) {
      setError(urlResult.error);
      setIsBusy(false);
      return;
    }
    const uploaded = await uploadVersionBytes(urlResult.data.uploadUrl, file);
    if (!uploaded.success) {
      setError(uploaded.error);
      setIsBusy(false);
      return;
    }
    setIsBusy(false);
    onChange();
  }

  async function handleRemove() {
    setIsBusy(true);
    setError(null);
    const result = await deleteSlicerProfile(projectId, versionId);
    setIsBusy(false);
    if (!result.success) {
      setError(result.error);
      return;
    }
    onChange();
  }

  return (
    <div className="rounded-lg border border-ink-800 bg-ink-900 p-3">
      <p className="text-xs font-semibold text-ink-300">{t("printLog.slicerProfile")}</p>
      {attachment ? (
        <div className="mt-2 flex items-center justify-between gap-2">
          <a
            href={attachment.downloadUrl}
            download={attachment.fileName}
            className="truncate text-xs text-accent-400 hover:text-accent-300"
            title={attachment.fileName}
          >
            {attachment.fileName}
          </a>
          <button
            type="button"
            onClick={() => void handleRemove()}
            disabled={isBusy}
            className="shrink-0 text-[11px] text-ink-500 hover:text-red-400 disabled:opacity-50"
          >
            {t("printLog.remove")}
          </button>
        </div>
      ) : (
        <div className="mt-2">
          <input
            ref={inputRef}
            type="file"
            className="hidden"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) void handleFile(file);
              event.target.value = "";
            }}
          />
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            disabled={isBusy}
            className="text-xs text-ink-400 hover:text-ink-200 disabled:opacity-50"
          >
            {isBusy ? t("printLog.uploading") : t("printLog.attachSnapshot")}
          </button>
        </div>
      )}
      {error && <p className="mt-1.5 text-[11px] text-red-400">{error}</p>}
    </div>
  );
}

function PrintPhotoBlock({
  projectId,
  versionId,
  attachment,
  onChange,
}: {
  projectId: string;
  versionId: string;
  attachment: PrintPhotoAttachment | null;
  onChange: () => void;
}) {
  const { t } = useTranslation();
  const inputRef = useRef<HTMLInputElement>(null);
  const [isBusy, setIsBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [caption, setCaption] = useState("");

  async function handleUpload() {
    if (!pendingFile) return;
    setIsBusy(true);
    setError(null);
    const urlResult = await getPrintPhotoUploadUrl(projectId, versionId, pendingFile, caption);
    if (!urlResult.success) {
      setError(urlResult.error);
      setIsBusy(false);
      return;
    }
    const uploaded = await uploadVersionBytes(urlResult.data.uploadUrl, pendingFile);
    if (!uploaded.success) {
      setError(uploaded.error);
      setIsBusy(false);
      return;
    }
    setIsBusy(false);
    setPendingFile(null);
    setCaption("");
    onChange();
  }

  async function handleRemove() {
    setIsBusy(true);
    setError(null);
    const result = await deletePrintPhoto(projectId, versionId);
    setIsBusy(false);
    if (!result.success) {
      setError(result.error);
      return;
    }
    onChange();
  }

  return (
    <div className="rounded-lg border border-ink-800 bg-ink-900 p-3">
      <p className="text-xs font-semibold text-ink-300">{t("printLog.printResultPhoto")}</p>
      {attachment ? (
        <div className="mt-2">
          <a href={attachment.downloadUrl} target="_blank" rel="noreferrer">
            <img
              src={attachment.downloadUrl}
              alt={attachment.caption ?? "Print result"}
              className="max-h-48 w-full rounded-md object-cover"
            />
          </a>
          {attachment.caption && <p className="mt-1.5 text-xs text-ink-300">{attachment.caption}</p>}
          <button
            type="button"
            onClick={() => void handleRemove()}
            disabled={isBusy}
            className="mt-1.5 text-[11px] text-ink-500 hover:text-red-400 disabled:opacity-50"
          >
            {t("printLog.remove")}
          </button>
        </div>
      ) : pendingFile ? (
        <div className="mt-2 space-y-2">
          <img
            src={URL.createObjectURL(pendingFile)}
            alt="Preview"
            className="max-h-48 w-full rounded-md object-cover"
          />
          <input
            type="text"
            value={caption}
            onChange={(event) => setCaption(event.target.value)}
            placeholder={t("printLog.captionPlaceholder")}
            className="w-full rounded border border-ink-700 bg-ink-950 px-2 py-1.5 text-xs text-ink-100 placeholder:text-ink-600 focus:border-accent-500 focus:outline-none"
          />
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => void handleUpload()}
              disabled={isBusy}
              className="rounded bg-accent-500 px-2.5 py-1 text-[11px] font-medium text-chrome-950 hover:bg-accent-400 disabled:opacity-50"
            >
              {isBusy ? t("printLog.uploading") : t("printLog.save")}
            </button>
            <button
              type="button"
              onClick={() => setPendingFile(null)}
              disabled={isBusy}
              className="text-[11px] text-ink-500 hover:text-ink-300 disabled:opacity-50"
            >
              {t("common.cancel")}
            </button>
          </div>
        </div>
      ) : (
        <div className="mt-2">
          <input
            ref={inputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) setPendingFile(file);
              event.target.value = "";
            }}
          />
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            className="text-xs text-ink-400 hover:text-ink-200"
          >
            {t("printLog.addPhoto")}
          </button>
        </div>
      )}
      {error && <p className="mt-1.5 text-[11px] text-red-400">{error}</p>}
    </div>
  );
}
