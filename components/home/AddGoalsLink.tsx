import Link from 'next/link';
import { setupButtonClasses } from '@/components/setup/SetupButton';
import { ADD_WORDS } from '@/lib/setup/addWords';

interface AddGoalsLinkProps {
  // The one main button on home, when there is nothing to log (every goal the person has is set aside). Otherwise it is the second choice
  // under "Log an entry".
  main?: boolean;
}

// The way to add a goal, or a target for a goal the person has, once their first setup is saved (MOM-132 part 2). Since MOM-167 part 14 it
// is a secondary button, not a bare link, so it reads as something to tap: the approved words are its own, "Add to your goals". It opens
// /setup, which asks nothing of Claude until a tap. Before the first setup is saved, SetupLinkCard is shown instead. HomeActions lays it out
// under "Log an entry".
export function AddGoalsLink({ main = false }: AddGoalsLinkProps) {
  return (
    <Link href="/setup" className={setupButtonClasses(main ? 'main' : 'second')} data-tone={main ? 'main' : 'second'}>
      {ADD_WORDS.homeLink}
    </Link>
  );
}
