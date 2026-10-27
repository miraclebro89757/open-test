// Client-safe: no node modules, so the browser can import it.

/** The lines that differ. Lines pair by position. */
export function changedLines(before: string, after: string): Array<{ line: number; before: string; after: string }> {
  const left = before.split("\n");
  const right = after.split("\n");
  const changes: Array<{ line: number; before: string; after: string }> = [];
  for (let index = 0; index < Math.max(left.length, right.length); index += 1) {
    if ((left[index] ?? "") !== (right[index] ?? "")) changes.push({ line: index + 1, before: left[index] ?? "", after: right[index] ?? "" });
  }
  return changes;
}
