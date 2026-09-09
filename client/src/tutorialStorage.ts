/** localStorage keys for tutorial_v1 (client-only). */
const COMPLETED_KEY = "cryptoclash.tutorialCompleted";
const SKIPPED_KEY = "cryptoclash.tutorialSkipped";

function readFlag(key: string): boolean {
  try {
    return localStorage.getItem(key) === "true";
  } catch {
    return false;
  }
}

function writeFlag(key: string, value: boolean): void {
  try {
    if (value) localStorage.setItem(key, "true");
    else localStorage.removeItem(key);
  } catch {
    /* private mode / blocked storage — fail soft */
  }
}

export function isTutorialCompleted(): boolean {
  return readFlag(COMPLETED_KEY);
}

export function isTutorialSkipped(): boolean {
  return readFlag(SKIPPED_KEY);
}

/** True when we should auto-offer the tutorial modal. */
export function shouldOfferTutorial(): boolean {
  return !isTutorialCompleted() && !isTutorialSkipped();
}

export function markTutorialCompleted(): void {
  writeFlag(COMPLETED_KEY, true);
  writeFlag(SKIPPED_KEY, false);
}

export function markTutorialSkipped(): void {
  writeFlag(SKIPPED_KEY, true);
}
