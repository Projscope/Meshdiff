export type SyncErrorKind =
  | "offline" // the cloud couldn't be reached
  | "unauthorized" // not signed in, or the session expired
  | "team_required" // the account's plan doesn't include syncing
  | "conflict" // the cloud refused: an id is already in use
  | "not_found"
  | "server"; // the cloud failed, or sent something unexpected

/** A sync problem. Its message is written for the user. */
export class SyncError extends Error {
  constructor(
    readonly kind: SyncErrorKind,
    message: string,
    readonly code?: string,
  ) {
    super(message);
    this.name = "SyncError";
  }
}
