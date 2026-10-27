// The dotted paths of every leaf in a value, sorted and without repeats. An array contributes the paths of its elements
// (so `tasks: [{ id }]` gives `tasks.id`); an empty array, a primitive or null is a leaf at its own path. Used to compare
// what the code really sends or stores with the lists in lib/config/privacy.ts (MOM-102).

export function fieldPaths(value: unknown): string[] {
  const found = new Set<string>();
  const walk = (node: unknown, path: string) => {
    if (Array.isArray(node)) {
      const objects = node.filter((item) => item !== null && typeof item === 'object');
      if (objects.length === 0) found.add(path);
      else for (const item of objects) walk(item, path);
      return;
    }
    if (node !== null && typeof node === 'object') {
      const entries = Object.entries(node as Record<string, unknown>);
      if (entries.length === 0) found.add(path);
      for (const [key, child] of entries) walk(child, path ? `${path}.${key}` : key);
      return;
    }
    found.add(path);
  };
  walk(value, '');
  return [...found].sort();
}
