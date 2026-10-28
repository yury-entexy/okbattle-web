'use client';

import { standings, type Answer, type Player, type Room } from '@/lib/game/engine';
import { Avatar } from './Avatar';
import { OnAirButton } from './OnAirButton';
import { TrafficLight } from './ui';

const MEDALS = ['ui/first_place.svg', 'ui/second_place.svg', 'ui/third_place.svg'];

export interface Row {
  player: Player;
  place: number;
  score: number;
  ms: number;
  stats: Array<boolean | null>;
  last?: Answer;
}

/** Standings after `upTo` rounds; places are shared on equal score unless answer time counts. */
export function rows(room: Room, upTo: number): Row[] {
  const byTime = room.doc.takeIntoAnswerTime;
  const answers = room.answers.slice(0, upTo + 1);
  const table = standings(Object.values(room.players), answers, byTime);
  let place = 0;
  return table.map((s, i) => {
    place = byTime || i === 0 || s.correct < table[i - 1].correct ? i + 1 : place;
    return {
      player: s.player,
      place,
      score: s.correct,
      ms: s.correctMs,
      stats: Array.from({ length: room.total }, (_, r) => (r > upTo ? null : !!room.answers[r]?.[s.player.id]?.correct)),
      last: room.answers[upTo]?.[s.player.id],
    };
  });
}

/** One player's line in the results lists (ResultsListItem). */
export function ResultCard({ row, me, byTime, index, showLast }: { row: Row; me: boolean; byTime: boolean; index: number; showLast?: boolean }) {
  const p = row.place - 1;
  return (
    <div className={`ritem ${p < 3 ? `p${p}` : ''} ${me ? 'me' : ''}`} style={{ animationDelay: `${Math.min(index, 10) * 40}ms` }}>
      {p < 3 ? <img className="ritem-medal" src={MEDALS[p]} alt={`${row.place} место`} /> : <span className="ritem-num">{row.place}</span>}
      <div className="ritem-top">
        <Avatar name={row.player.avatar} size={54} />
        <div className="ritem-info">
          <div className="ritem-name">
            <span>{row.player.name}</span>
            {showLast && <span className={`badge ${row.last?.correct ? 'ok' : 'bad'}`}>{row.last?.correct ? 'Правильно' : 'Неправильно'}</span>}
            <OnAirButton player={row.player} />
          </div>
          <div className="ritem-stats">
            <span><img src="ui/coin.svg" width={15} height={15} alt="Очки" />{row.score}</span>
            {byTime && <span><img src="ui/time.svg" width={16} height={16} alt="Время" />{(row.ms / 1000).toFixed(2)} сек</span>}
          </div>
        </div>
      </div>
      <TrafficLight stats={row.stats} />
    </div>
  );
}
