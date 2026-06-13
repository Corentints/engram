/**
 * Extracts the description from a SKILL.md file content.
 *
 * Reads the `description:` field from YAML frontmatter when present.
 * Falls back to the first non-empty, non-heading body line for legacy skills.
 */
export function extractDescription(content: string): string | undefined {
  const lines = content.split("\n");
  const hasFrontmatter = lines[0]?.trim() === "---";

  if (hasFrontmatter) {
    let i = 1;
    while (i < lines.length && lines[i]?.trim() !== "---") {
      const match = lines[i]?.match(/^description:\s*(.+)/);
      if (match) return match[1]!.trim();
      i++;
    }
    // No `description:` in frontmatter — scan body after closing `---`
    for (let j = i + 1; j < lines.length; j++) {
      const line = lines[j]?.trim() ?? "";
      if (line && !line.startsWith("#")) return line;
    }
    return undefined;
  }

  return lines.find((l) => { const t = l.trim(); return t && !t.startsWith("#"); })?.trim();
}
