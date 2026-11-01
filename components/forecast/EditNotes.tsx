import Link from 'next/link';
import { SAVED, SEE_ON_HOME } from './wording';

interface EditNotesProps {
  // What the last tap answered: a refusal in words, or that it was saved. Both empty before the first tap.
  error: string | null;
  saved: boolean;
}

// The one place an edit screen says how the last tap went: "Saved. See it on home." (the second sentence leads home, where the
// forecast now reads the change) or the plain reason it was not saved. Read out when it appears.
export function EditNotes({ error, saved }: EditNotesProps) {
  return (
    <>
      {error && (
        <p role="alert" className="plan-error">
          {error}
        </p>
      )}
      {saved && !error && (
        <p role="status" className="home-notice">
          {SAVED} <Link href="/" className="review-link">{SEE_ON_HOME}</Link>
        </p>
      )}
    </>
  );
}
