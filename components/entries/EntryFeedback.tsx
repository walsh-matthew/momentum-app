interface EntryFeedbackProps {
  // The service's refusal, in words.
  error: string | null;
  // Said after an entry was saved but will not count, such as one dated before its goal's start.
  notice: string | null;
}

// What a control says back after a log: a refusal (nothing was saved) or a notice (saved, with something to know).
export function EntryFeedback({ error, notice }: EntryFeedbackProps) {
  return (
    <>
      {notice && (
        <p role="status" className="mt-3 rounded-xl border border-border bg-secondary px-3 py-2 text-sm">
          {notice}
        </p>
      )}
      {error && (
        <p role="alert" className="mt-3 text-sm text-danger">
          {error}
        </p>
      )}
    </>
  );
}
