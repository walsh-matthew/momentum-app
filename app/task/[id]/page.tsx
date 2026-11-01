import { redirect } from 'next/navigation';
import { TaskEditScreen } from '@/components/forecast/TaskEditScreen';
import { LOAD_FAILED } from '@/components/forecast/wording';
import { PageBackRow } from '@/components/layout/PageBackRow';
import { getCurrentUser } from '@/lib/services/auth';
import { getTaskEdit } from '@/lib/services/forecastEdits';

// Reads the signed-in user's session and rows, so this page renders per request.
export const dynamic = 'force-dynamic';

interface TaskPageProps {
  params: Promise<{ id: string }>;
}

// A deadline task's own edit (MOM-138): its rough size, its steps and, only when setup recorded that it can move, its due date.
// Home's forecast lines lead here. proxy.ts sends a signed-out visitor to /login before this renders; the redirect below is the
// same safe default as the other pages'. The service checks the task is the signed-in person's own.
export default async function TaskPage({ params }: TaskPageProps) {
  const user = await getCurrentUser().catch(() => null);
  if (!user || !user.ok || user.data === null) redirect('/login');

  const { id } = await params;
  const task = await getTaskEdit(id).catch(() => null);

  return (
    <div className="mx-auto min-h-dvh w-full max-w-2xl px-4 py-6">
      <PageBackRow />
      <main>
        {task === null || !task.ok ? (
          <p role="alert" className="mt-5 text-sm text-danger">
            {task === null ? LOAD_FAILED : task.error}
          </p>
        ) : (
          <>
            <h1 className="mt-3 text-[25px] font-semibold leading-tight tracking-[-0.055em] [overflow-wrap:anywhere]">{task.data.title}</h1>
            <div className="mt-5">
              <TaskEditScreen task={task.data} />
            </div>
          </>
        )}
      </main>
    </div>
  );
}
