import { CARD_TEXT } from './cardText';

interface PlaybackLinesProps {
  // The lines code wrote from the validated draft (lib/setup/playback.ts). A line that starts with two spaces belongs to the line
  // above it: a goal's targets sit under the goal.
  lines: string[];
  // Space between the lines.
  gap?: 'tight' | 'loose';
}

export interface LineGroup {
  text: string;
  children: string[];
}

// Lines grouped the way they read: an indented line goes under the nearest line above that is not indented. An indented line with
// nothing above it stands on its own.
export function groupLines(lines: string[]): LineGroup[] {
  const groups: LineGroup[] = [];
  for (const line of lines) {
    const nested = /^\s{2,}\S/.test(line);
    if (nested && groups.length > 0) groups[groups.length - 1].children.push(line.trim());
    else groups.push({ text: line.trim(), children: [] });
  }
  return groups;
}

// What a card has collected, as a real list (MOM-111, quick-path card): a bullet for each line, a goal's targets in a list inside it,
// and a hanging indent, so a line that wraps on a phone lines up under its own first word. Before this the lines were kept in
// shape with leading spaces and `white-space: pre-wrap`, which shifted only the first line of a wrapped one and had no bullets.
export function PlaybackLines({ lines, gap = 'tight' }: PlaybackLinesProps) {
  const space = gap === 'loose' ? 'space-y-2' : 'space-y-1';
  return (
    <ul className={`ml-5 list-disc ${space} [overflow-wrap:anywhere] ${CARD_TEXT.body}`}>
      {groupLines(lines).map((group, index) => (
        <li key={`${index}-${group.text}`}>
          {group.text}
          {group.children.length > 0 && (
            <ul className="mt-1 ml-5 list-[circle] space-y-1">
              {group.children.map((child, i) => (
                <li key={`${i}-${child}`}>{child}</li>
              ))}
            </ul>
          )}
        </li>
      ))}
    </ul>
  );
}
