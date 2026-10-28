import type { Tone } from '@/types/database.types';
import type { TargetCardView } from '@/types/home';
import { formatNumber, levelChip, levelsText, patternLine, slotsText, toAspirationLine, trendText } from './wording';

interface TargetRowProps {
  card: TargetCardView;
  tone: Tone;
}

const CHIP_CLASS = { accent: 'chip chip-accent', warn: 'chip chip-warn', dashed: 'chip chip-dashed', plain: 'chip' } as const;

// One target on its goal's card. Every number is the engine's, and the chip always says the level in words. A target
// that is not graded never shows a level word or a holding or slipping line, whatever level the engine's result holds.
export function TargetRow({ card, tone }: TargetRowProps) {
  const chip = levelChip(card);
  const levels = levelsText(card);
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
  const aspirationLine = toAspirationLine(card);
  const pattern = card.graded && card.pattern ? patternLine(card.pattern, tone) : null;
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
          <p className="home-note">{slotsText(card.slots)}</p>
        </>
      ) : (
        <p className="home-count">
          {formatNumber(card.counted)}
          {unit && <span>{card.unit}</span>}
          <span>{card.role === 'outcome' && card.period === 'weekly' ? 'this week' : 'so far'}</span>
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
    </div>
  );
}
