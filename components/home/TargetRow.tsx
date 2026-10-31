import type { ReactNode } from 'react';
import type { Tone } from '@/types/database.types';
import type { TargetCardView } from '@/types/home';
import type { LocalDate } from '@/types/scoreboard';
import { homeChangeLine } from '@/components/review/targetChangeWording';
import { formatNumber, levelChip, levelsText, patternLine, slotDaysText, toAspirationLine, toSettledAspirationLine, trendText } from './wording';

interface TargetRowProps {
  card: TargetCardView;
  tone: Tone;
  // A week that has already closed, as the weekly review's recap shows it: the count is "that week", what is left to the
  // aspiration is said as how far short it was, and a slipping run is not pointed at the review the person is in.
  settled?: boolean;
  // Shown at the end of a counted target, inside its card (the recap's crossings).
  children?: ReactNode;
  // The person's today, for the dates in its chip and levels (MOM-111 finding 7).
  today?: LocalDate | null;
}

const CHIP_CLASS = { accent: 'chip chip-accent', warn: 'chip chip-warn', dashed: 'chip chip-dashed', plain: 'chip' } as const;

// One target on its goal's card. Every number is the engine's, and the chip always says the level in words. A target
// that is not graded never shows a level word or a holding or slipping line, whatever level the engine's result holds.
export function TargetRow({ card, tone, settled = false, children, today = null }: TargetRowProps) {
  const chip = levelChip(card, today);
  const levels = levelsText(card, today);
  const head = (
    <div className="home-target-row">
      <h4>{card.title}</h4>
      <span className={CHIP_CLASS[chip.tone]}>{chip.label}</span>
    </div>
  );

  if (card.status === 'needs_week_start') {
    return (
      <div className="home-target">
        {head}
        <p className="home-note">
          {levels ? `${levels}. ` : ''}Set the day your week starts to see this week&apos;s count. Nothing is guessed.
        </p>
      </div>
    );
  }
  if (card.status === 'not_counted') {
    return (
      <div className="home-target">
        {head}
        <p className="home-note">{levels ? `${levels}. ` : ''}Momentum cannot count this one yet.</p>
      </div>
    );
  }
  if (card.status === 'not_started') {
    return (
      <div className="home-target">
        {head}
        {levels && <p className="home-note">{levels}</p>}
      </div>
    );
  }

  const unit = card.unit ? ` ${card.unit}` : '';
  const aspirationLine = settled ? toSettledAspirationLine(card) : toAspirationLine(card);
  const pattern = card.graded && card.pattern ? patternLine(card.pattern, tone, settled || card.pattern.reviewed === true) : null;
  const trend = card.trend ? trendText(card.trend) : null;
  const scaleMax = card.floor === null ? 0 : Math.max(card.aspiration ?? card.floor, card.counted);
  const percent = (value: number) => Math.min(100, (value / scaleMax) * 100);

  return (
    <div className="home-target">
      {head}
      {card.slots ? (
        <>
          <p className="home-count">
            {card.slots.filled} of {card.slots.total}
            <span>days filled</span>
          </p>
          <p className="home-note">{slotDaysText(card.slots)}</p>
        </>
      ) : (
        <p className="home-count">
          {formatNumber(card.counted)}
          {unit && <span>{card.unit}</span>}
          <span>{settled ? 'that week' : card.role === 'outcome' && card.period === 'weekly' ? 'this week' : 'so far'}</span>
        </p>
      )}
      {scaleMax > 0 && !card.slots && card.floor !== null && (
        <div className="home-track" data-graded={card.graded ? 'true' : 'false'} aria-hidden="true">
          <span style={{ width: `${percent(card.counted)}%` }} />
          <u className="home-tick" style={{ left: `${percent(card.floor)}%` }} />
          {card.aspiration !== null && <u className="home-tick home-tick-aspiration" style={{ left: `${percent(card.aspiration)}%` }} />}
        </div>
      )}
      {levels && !card.slots && (
        <p className="home-note">
          {levels}
          {card.startedPartway ? '. Started partway through the week, so it is shown and not graded.' : ''}
        </p>
      )}
      {card.slots && card.startedPartway && <p className="home-note">Started partway through the week, so it is shown and not graded.</p>}
      {aspirationLine && <p className="home-next">{aspirationLine}</p>}
      {/* Numbers the person saved that start on a later day (MOM-146), in the words they were promised when they saved. */}
      {card.change && <p className="home-note">{homeChangeLine(card.change.from, card, card.change.floor, card.change.aspiration, today)}</p>}
      {card.belowThreshold > 0 && (
        <p className="home-note">
          {card.belowThreshold} below your threshold, kept and not counted.
        </p>
      )}
      {trend && <p className="home-note">{trend}</p>}
      {pattern && (
        <p className="home-pattern" data-tone={pattern.tone}>
          {pattern.text}
        </p>
      )}
      {children}
    </div>
  );
}
