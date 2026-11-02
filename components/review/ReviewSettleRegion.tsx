'use client';

import { createContext, useContext, useTransition, type ReactNode, type TransitionStartFunction } from 'react';

interface FinishTransition {
  finishing: boolean;
  startFinish: TransitionStartFunction;
}

const FinishContext = createContext<FinishTransition | null>(null);

// The finishing transition the sitting shares with this region, or null when the sitting is rendered without one (component tests).
export function useSharedFinish(): FinishTransition | null {
  return useContext(FinishContext);
}

interface ReviewSettleRegionProps {
  children: ReactNode;
}

// MOM-120: the settled marker of the weekly review. "Finish review" runs an action and then refreshes the page, and once the page
// shows the finished review the sitting (and its button) is gone, so a test has no control left to wait for, and Playwright cannot
// see when the refresh's streamed body ends (failure log F-086). This region stays mounted across that refresh because it sits above
// the sitting, so it owns the finishing transition: `aria-busy` is "true" from the tap until the transition, including the nested
// router.refresh(), has committed, and "false" otherwise. Nothing on the screen changes.
export function ReviewSettleRegion({ children }: ReviewSettleRegionProps) {
  const [finishing, startFinish] = useTransition();
  return (
    <FinishContext.Provider value={{ finishing, startFinish }}>
      <div data-review-region aria-busy={finishing}>
        {children}
      </div>
    </FinishContext.Provider>
  );
}
