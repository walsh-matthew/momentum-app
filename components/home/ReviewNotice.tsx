import Link from 'next/link';
import type { ReviewPrompt } from '@/types/review';

interface ReviewNoticeProps {
  prompt: ReviewPrompt;
}

// One quiet line above the scoreboard on the person's own planning day: the weekly review is there to read, or this week's
// is already done (MOM-113 block 3.2). It asks for nothing and never blocks anything; nothing shows on any other day.
export function ReviewNotice({ prompt }: ReviewNoticeProps) {
  if (prompt.state === 'none') return null;
  return (
    <section aria-label="Weekly review" className="home-notice review-notice">
      <p>{prompt.state === 'due' ? 'Your week is ready to look back on.' : "This week's review is done."}</p>
      <Link href="/review" className="review-link">
        {prompt.state === 'due' ? 'See your weekly review' : 'See it'}
      </Link>
    </section>
  );
}
