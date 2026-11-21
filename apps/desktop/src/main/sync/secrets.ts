import { safeStorage } from "electron";
import fs from "node:fs";
import path from "node:path";
import type { SecretStore } from "./auth";

/**
 * Keeps the signed-in session in a file encrypted with the operating system's own
 * key store (Windows DPAPI via Electron's safeStorage), so another program or user
 * can't read the tokens off the disk. If encryption isn't available the session
 * simply isn't saved: the user signs in again next launch, rather than the tokens
 * being written in the clear.
 */
export class SafeStorageSecrets implements SecretStore {
  constructor(private readonly file: string) {}

  read(): string | null {
    if (!safeStorage.isEncryptionAvailable()) return null;
    try {
      return safeStorage.decryptString(fs.readFileSync(this.file));
    } catch {
      return null;
    }
  }

  write(value: string): void {
    if (!safeStorage.isEncryptionAvailable()) return;
    fs.mkdirSync(path.dirname(this.file), { recursive: true });
    const temp = `${this.file}.tmp`;
    fs.writeFileSync(temp, safeStorage.encryptString(value));
    fs.renameSync(temp, this.file);
  }

  clear(): void {
    fs.rmSync(this.file, { force: true });
  }
}
