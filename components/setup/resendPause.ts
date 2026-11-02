// The pause before setup sends a conversation again on its own (MOM-167 part 3, lib/setup/session.ts RESEND_AFTER_MS). It waits for the page
// to be in front again first: a request sent while the phone is in another app would be cancelled the same way. Its own module so a
// test can see how long the screen waited without waiting that long.

function whenVisible(): Promise<void> {
  if (typeof document === 'undefined' || document.visibilityState !== 'hidden') return Promise.resolve();
  return new Promise((resolve) => {
    const onChange = () => {
      if (document.visibilityState === 'hidden') return;
      document.removeEventListener('visibilitychange', onChange);
      resolve();
    };
    document.addEventListener('visibilitychange', onChange);
  });
}

export async function pauseBeforeResend(ms: number): Promise<void> {
  await whenVisible();
  await new Promise<void>((resolve) => setTimeout(resolve, ms));
}
