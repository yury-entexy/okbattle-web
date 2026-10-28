'use client';

import { useEffect, useMemo, useState } from 'react';
import { preload } from '@/lib/audio';
import { dataSource } from '@/lib/data/source';
import { useGame } from '@/lib/game/store';
import type { Category, GameType, MusicAsk } from '@/lib/types';

const ROUNDS = [5, 10];
const SECONDS = [15, 30];
const ASKS: Array<[MusicAsk, string]> = [
  ['author', 'Исполнитель'],
  ['title', 'Название'],
  ['mixed', 'Вперемешку'],
];

export function Setup() {
  const { goHome, openLobby, locale } = useGame();
  const [type, setType] = useState<GameType>('music');
  const [cats, setCats] = useState<Partial<Record<GameType, Category[]>>>({});
  const [error, setError] = useState('');
  const [catId, setCatId] = useState('');
  const [subId, setSubId] = useState('');
  const [rounds, setRounds] = useState(5);
  const [seconds, setSeconds] = useState(30);
  const [ask, setAsk] = useState<MusicAsk>('mixed');
  const [bots, setBots] = useState(3);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (cats[type]) return;
    let live = true;
    dataSource()
      .then((src) => src.categories(type))
      .then((list) => live && setCats((c) => ({ ...c, [type]: list })))
      .catch(() => live && setError('Не удалось загрузить категории. Проверьте соединение и обновите страницу.'));
    return () => {
      live = false;
    };
  }, [type, cats]);

  const list = cats[type];
  const category = useMemo(() => list?.find((c) => c.id === catId), [list, catId]);

  function chooseType(t: GameType) {
    setType(t);
    setCatId('');
    setSubId('');
  }
  function chooseCategory(c: Category) {
    setCatId(c.id);
    setSubId(c.subcategories[0]?.id ?? '');
  }

  async function create() {
    setBusy(true);
    setError('');
    try {
      const src = await dataSource();
      const questions = await src.questions(type, subId, rounds);
      if (!questions.length) throw new Error('empty');
      // Start downloading the first snippet while the lobby fills up.
      if (questions[0].kind === 'music') void preload(questions[0].audio);
      openLobby({ type, categoryId: catId, subcategoryId: subId, rounds: questions.length, roundSeconds: seconds, ask, bots }, questions);
    } catch {
      setError('В этой подборке не нашлось вопросов. Выберите другую.');
      setBusy(false);
    }
  }

  return (
    <>
      <header className="topbar">
        <button className="icon-btn" onClick={goHome} aria-label="Назад">←</button>
        <h1>Новая игра</h1>
      </header>

      <section className="card">
        <p className="label">Тип игры</p>
        <div className="modes">
          <button className="mode" aria-pressed={type === 'music'} onClick={() => chooseType('music')}>
            <img src="icons/music_game_type.svg" alt="" />
            <strong>Угадай мелодию</strong>
            <span>Звучит отрывок трека</span>
          </button>
          <button className="mode" aria-pressed={type === 'quiz'} onClick={() => chooseType('quiz')}>
            <img src="icons/quiz_game_type.svg" alt="" />
            <strong>Викторина</strong>
            <span>Вопросы на эрудицию</span>
          </button>
        </div>
      </section>

      <section className="card">
        <p className="label">Категория</p>
        {!list && !error && <div className="spinner" aria-label="Загрузка" />}
        {list && (
          <div className="cats">
            {list.map((c) => (
              <button key={c.id} className="cat" aria-pressed={c.id === catId} onClick={() => chooseCategory(c)}>
                {c.image && <img src={c.image} alt="" loading="lazy" />}
                <span>{c.name[locale]}</span>
              </button>
            ))}
          </div>
        )}
        {category && (
          <>
            <p className="label">Подборка</p>
            <div className="chips">
              {category.subcategories.map((s) => (
                <button key={s.id} className="chip" aria-pressed={s.id === subId} onClick={() => setSubId(s.id)}>
                  {s.name[locale]}
                  <small>{s.size}</small>
                </button>
              ))}
            </div>
          </>
        )}
      </section>

      <section className="card">
        <div className="row">
          <div className="field">
            <span className="label">Раундов</span>
            <div className="chips">
              {ROUNDS.map((n) => (
                <button key={n} className="chip" aria-pressed={rounds === n} onClick={() => setRounds(n)}>{n}</button>
              ))}
            </div>
          </div>
          <div className="field">
            <span className="label">Секунд на ответ</span>
            <div className="chips">
              {SECONDS.map((n) => (
                <button key={n} className="chip" aria-pressed={seconds === n} onClick={() => setSeconds(n)}>{n}</button>
              ))}
            </div>
          </div>
        </div>
        {type === 'music' && (
          <div className="field">
            <span className="label">Что угадываем</span>
            <div className="chips">
              {ASKS.map(([v, label]) => (
                <button key={v} className="chip" aria-pressed={ask === v} onClick={() => setAsk(v)}>{label}</button>
              ))}
            </div>
          </div>
        )}
        <div className="field">
          <span className="label">Соперники-боты</span>
          <div className="chips">
            {[1, 2, 3, 4, 5].map((n) => (
              <button key={n} className="chip" aria-pressed={bots === n} onClick={() => setBots(n)}>{n}</button>
            ))}
          </div>
        </div>
      </section>

      {error && <p className="notice" role="alert">{error}</p>}
      <button className="btn block" disabled={!subId || busy} onClick={create}>
        {busy ? 'Готовим вопросы…' : subId ? 'Открыть комнату' : 'Выберите категорию'}
      </button>
    </>
  );
}
