import Link from 'next/link';
import { redirect } from 'next/navigation';
import { PlanScreen } from '@/components/plan/PlanScreen';
import { BACK_HOME, LOAD_FAILED_PLAN, PLAN_HEADING, needsDaysText } from '@/components/plan/wording';
import { getCurrentUser } from '@/lib/services/auth';
import { getWeekPlan } from '@/lib/services/weekPlan';

// Reads the signed-in user's session and rows, so this page renders per request.
export const dynamic = 'force-dynamic';

interface PlanPageProps {
  // ?week=N: which week, counted from the one that holds today. The service reads it as a whole number from 0 and treats
  // anything else as this week, so the address can never ask for something the plan does not offer.
  searchParams: Promise<{ week?: string | string[] }>;
}

// The week plan (MOM-112 block 2): the person's own choice of which things to do on which of their days. proxy.ts sends a
// signed-out visitor to /login before this renders; the redirect below is the same safe default as the other pages'.
export default async function PlanPage({ searchParams }: PlanPageProps) {
  const user = await getCurrentUser().catch(() => null);
  if (!user || !user.ok || user.data === null) redirect('/login');

  const query = await searchParams;
  const week = Array.isArray(query.week) ? query.week[0] : query.week;
  const plan = await getWeekPlan(week).catch(() => null);

  return (
    <main className="mx-auto min-h-dvh w-full max-w-2xl px-4 py-6">
      <Link href="/" className="text-sm text-muted underline-offset-4 hover:underline">
        {BACK_HOME}
      </Link>
      <h1 className="mt-3 text-[25px] font-semibold leading-tight tracking-[-0.055em]">{PLAN_HEADING}</h1>
      <div className="mt-5">
        {plan === null || !plan.ok ? (
          <p role="alert" className="text-sm text-danger">
            {plan === null ? LOAD_FAILED_PLAN : plan.error}
          </p>
        ) : plan.data.state === 'needs_day_anchors' ? (
          <p role="status" className="home-notice">
            {needsDaysText(plan.data)}
          </p>
        ) : (
          <PlanScreen plan={plan.data} />
        )}
      </div>
    </main>
  );
}
