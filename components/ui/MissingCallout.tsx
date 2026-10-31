// The plain callout of a form that is missing something (MOM-145, lib/forms/missing.ts): one sentence, on the amber note surface, read out
// when it appears. It shows nothing with no message.

interface MissingCalloutProps {
  message: string | null;
  id?: string;
}

export function MissingCallout({ message, id }: MissingCalloutProps) {
  if (message === null) return null;
  return (
    <p id={id} role="alert" data-slot="missing-callout" className="rounded-lg border border-streak/50 bg-[rgb(var(--amber-rgb)/8%)] px-3 py-2 text-sm text-foreground">
      {message}
    </p>
  );
}
