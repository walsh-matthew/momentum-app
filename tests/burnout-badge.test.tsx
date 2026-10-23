// @vitest-environment jsdom
//
// The burnout-risk badge at each level (MOM-61, closing the second criterion of MOM-58). The words carry the level;
// the dot's colour and shape only repeat it, so the badge is readable without colour.

import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { BurnoutRiskBadge } from '@/components/velocity/BurnoutRiskBadge';
import type { BurnoutRisk } from '@/lib/utils/velocity';

afterEach(cleanup);

const LEVELS: [BurnoutRisk, string][] = [
  ['low', 'Burnout risk: low'],
  ['rising', 'Burnout risk: rising'],
  ['high', 'Burnout risk: high'],
];

describe('BurnoutRiskBadge', () => {
  it.each(LEVELS)('%s says its level in words', (risk, label) => {
    const { container } = render(<BurnoutRiskBadge risk={risk} />);
    expect(container.textContent).toBe(label);
  });

  it.each(LEVELS)('%s carries its level as data, for the shape and colour rules', (risk) => {
    const { container } = render(<BurnoutRiskBadge risk={risk} />);
    expect((container.firstElementChild as HTMLElement).dataset.risk).toBe(risk);
  });

  it.each(LEVELS)('%s hides its dot from assistive technology, so the words are the whole message', (risk) => {
    const { container } = render(<BurnoutRiskBadge risk={risk} />);
    const dot = container.querySelector('.burnout-dot');
    expect(dot).toBeTruthy();
    expect(dot?.getAttribute('aria-hidden')).toBe('true');
    expect(dot?.textContent).toBe('');
  });

  it('the three levels read differently', () => {
    const texts = LEVELS.map(([risk]) => {
      const { container, unmount } = render(<BurnoutRiskBadge risk={risk} />);
      const text = container.textContent;
      unmount();
      return text;
    });
    expect(new Set(texts).size).toBe(3);
  });
});
