// Light formatting for quick notes. The note is still plain text; a few line
// prefixes are drawn as formatting on the desktop note page:
//   "# "   heading
//   "- "   bullet
//   "[ ] " / "[x] "  tick box
//   "> "   callout
// Anything else is a plain paragraph line.

export type LineKind = 'heading' | 'bullet' | 'todo' | 'callout' | 'text';

export interface ParsedLine {
  kind: LineKind;
  prefix: string; // the marker as typed, e.g. "# " or "[x] "
  content: string; // the rest of the line
  done: boolean; // todo lines only
}

// A trailing marker with nothing after it ("-", "[ ]") still counts, since saving
// trims the note's last line.
const TODO = /^\[( |x|X)\](?: |$)/;

export function parseLine(line: string): ParsedLine {
  const todo = TODO.exec(line);
  if (todo) return { kind: 'todo', prefix: todo[0], content: line.slice(todo[0].length), done: todo[1] !== ' ' };
  if (line.startsWith('# ')) return { kind: 'heading', prefix: '# ', content: line.slice(2), done: false };
  if (line.startsWith('- ') || line === '-') return { kind: 'bullet', prefix: line.slice(0, 2), content: line.slice(2), done: false };
  if (line.startsWith('> ')) return { kind: 'callout', prefix: '> ', content: line.slice(2), done: false };
  return { kind: 'text', prefix: '', content: line, done: false };
}

// Flips a tick-box line, keeping everything else exactly as typed.
export function toggleTodoLine(line: string): string {
  const todo = TODO.exec(line);
  if (!todo) return line;
  return `[${todo[1] === ' ' ? 'x' : ' '}]${line.slice(3)}`;
}

// What Enter carries onto the next line: a bullet or tick box continues the list.
export function continuation(line: string): string {
  const p = parseLine(line);
  if (p.kind === 'bullet') return '- ';
  if (p.kind === 'todo') return '[ ] ';
  return '';
}

// One-line previews (the grid cards): markers turned into symbols, not raw syntax.
export function previewText(text: string): string {
  return text
    .split('\n')
    .map((line) => {
      const p = parseLine(line);
      if (p.kind === 'bullet') return `• ${p.content}`;
      if (p.kind === 'todo') return `${p.done ? '☑' : '☐'} ${p.content}`;
      return p.content;
    })
    .join('\n');
}

export function hasFormatting(text: string): boolean {
  return text.split('\n').some((line) => parseLine(line).kind !== 'text');
}
