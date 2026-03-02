// RequirementsParser — parse markdown checklist items from requirements text.
// Supports `- [ ] item` (incomplete) and `- [x] item` / `- [X] item` (complete).
// Nested items (indented with spaces or tabs) are included.
// All other lines are silently ignored.

export interface ChecklistItem {
  readonly text: string;
  readonly completed: boolean;
}

const CHECKLIST_PATTERN = /^[ \t]*-\s+\[([xX ])\]\s+(.+)$/;

export function parseRequirements(requirementsText: string): ChecklistItem[] {
  const lines = requirementsText.split(/\r?\n/);
  const items: ChecklistItem[] = [];

  for (const line of lines) {
    const match = CHECKLIST_PATTERN.exec(line);
    if (match === null) {
      continue;
    }
    const marker = match[1];
    const text = match[2].trim();
    if (text.length === 0) {
      continue;
    }
    items.push({ text, completed: marker === "x" || marker === "X" });
  }

  return items;
}
