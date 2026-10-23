// Joins class names, skipping anything falsy. The wireframe's cn() also runs tailwind-merge; this repo does
// not depend on clsx or tailwind-merge, so callers must not pass two classes that set the same property.
export function cn(...inputs: Array<string | false | null | undefined>): string {
  return inputs.filter(Boolean).join(' ');
}
