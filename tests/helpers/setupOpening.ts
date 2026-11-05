// MOM-180 B3: a first setup opens on code's idea question and then code's why question, with no request; the person's answer to the why is the first
// request, and one call reads both answers. Screen tests that start a setup answer both here, so the turn their stubbed server returns first is the
// first thing Claude says, as before B3.

import { fireEvent, screen } from '@testing-library/react';
import { FIXED_WORDS } from '@/lib/setup/fixedQuestions';

export const OPENING_IDEA = 'I want to run more.';
export const OPENING_WHY = 'It clears my head.';

const send = (text: string) => {
  fireEvent.change(screen.getByLabelText('Your answer'), { target: { value: text } });
  fireEvent.click(screen.getByRole('button', { name: 'Send' }));
};

// After the tap on Start: answers code's two questions. The why answer sends the first request.
export async function throughOpening(idea = OPENING_IDEA, why = OPENING_WHY): Promise<void> {
  await screen.findByRole('heading', { name: FIXED_WORDS.ideaQuestion });
  send(idea);
  await screen.findByRole('heading', { name: FIXED_WORDS.whyQuestion });
  send(why);
}
