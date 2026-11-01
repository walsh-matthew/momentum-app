import Link from 'next/link';
import { ADD_WORDS } from '@/lib/setup/addWords';

// The way to add a goal, or a target for a goal the person has, once their first setup is saved (MOM-132 part 2). It is a quiet link,
// not a card: the approved words are the link's own, "Add to your goals". It opens /setup, which asks nothing of Claude until a tap.
// Before the first setup is saved, SetupLinkCard is shown instead. Styled like the other plain links on home (green, underlined), so it
// reads as something to tap and not as a button that is switched off.
export function AddGoalsLink() {
  return (
    <nav aria-label={ADD_WORDS.homeLink} className="mt-2">
      <Link href="/setup" className="inline-flex min-h-11 items-center text-sm font-medium text-primary underline underline-offset-4 hover:opacity-80">
        {ADD_WORDS.homeLink}
      </Link>
    </nav>
  );
}
