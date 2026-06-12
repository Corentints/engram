/**
 * A "source" is a git repository that holds skills. It can be given as a GitHub
 * shorthand (`owner/repo`), or any clonable git URL (https, git@, ssh://, file://).
 */
export function resolveUrl(source: string): string {
  if (
    source.startsWith("http") ||
    source.startsWith("git@") ||
    source.startsWith("ssh://") ||
    source.startsWith("file://")
  ) {
    return source;
  }
  return `https://github.com/${source}`;
}

/** Filesystem-safe key for the canonical store, derived from a source + skill path. */
export function storeKey(source: string, skill: string): string {
  return `${source}/${skill}`.replace(/[^a-zA-Z0-9._-]/g, "-").replace(/^-+|-+$/g, "");
}

/** Stable id used as the manifest key and in user-facing listings. */
export function skillId(source: string, skill: string): string {
  return `${source}/${skill}`;
}
