'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { preload } from '@/lib/audio';
import { dataSource } from '@/lib/data/source';
import { textLocale } from '@/lib/game/engine';
import { ActionButton, AppBar, BackIcon, BlueScreen, RoundButton } from './ui';
import { useGame } from '@/lib/game/store';
import { PUNISHMENT_KINDS } from '@/lib/punishments';
import type { Category, GameSettings, GameType } from '@/lib/types';

// Choices mirror the mobile app's create-game panels.
const AMOUNTS = [5, 10, 15, 20];
const QUIZ_SECONDS = [10, 20, 30, 40];
const MUSIC_SECONDS = 25;
const LANGUAGES: Array<[string, string]> = [
  ['ru', 'Русский'], ['AmE', 'English (AmE)'], ['BrE', 'English (BrE)'], ['NgE', 'English (NgE)'], ['es', 'Español'],
  ['uk', 'Українська'], ['id', 'Indonesia'], ['ms', 'Melayu'], ['de', 'Deutsch'], ['fr', 'Français'], ['it', 'Italiano'],
  ['pl', 'Polski'], ['pt', 'Português'], ['ro', 'Română'], ['tr', 'Türkçe'], ['hi', 'हिन्दी'], ['ja', '日本語'],
  ['zh', '汉语'], ['ko', '한국어'], ['ar', 'العربية'],
];

function Choice<T extends string | number>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: Array<[T, ReactNode]>;
  onChange(v: T): void;
}) {
  return (
    <div className="field">
      <h3>{label}</h3>
      <div className="chips">
        {options.map(([v, text]) => (
          <button key={String(v)} type="button" className="chip" aria-pressed={value === v} onClick={() => onChange(v)}>
            {text}
          </button>
        ))}
      </div>
    </div>
  );
}

const YES_NO: Array<[string, string]> = [['yes', 'Да'], ['no', 'Нет']];
function Toggle({ label, value, onChange, hint }: { label: string; value: boolean; onChange(v: boolean): void; hint?: string }) {
  return (
    <div className="field">
      <h3>{label}</h3>
      <div className="chips">
        {YES_NO.map(([v, text]) => (
          <button key={v} type="button" className="chip" aria-pressed={value === (v === 'yes')} onClick={() => onChange(v === 'yes')}>
            {text}
          </button>
        ))}
      </div>
      {hint && <small className="hint">{hint}</small>}
    </div>
  );
}

const DEFAULTS: Omit<GameSettings, 'type' | 'categories' | 'roundSeconds'> = {
  rounds: 10,
  difficulty: [1, 2, 3],
  answerType: 'choose',
  questionsType: 'mixed',
  winnerDetermination: 'automatically',
  takeIntoAnswerTime: true,
  // On the web players are usually on their own devices, so everyone hears the snippet.
  everyoneHasSound: true,
  isAdminPlayer: true,
  backgroundMusic: 'medium',
  punishment: 'nonePunishment',
  locale: 'ru',
  antiShazam: false,
  isPrivate: false,
  videoEnabled: false,
  bots: 3,
};

export function Setup() {
  const { goHome, createRoom } = useGame();
  const [type, setType] = useState<GameType>('music');
  const [cats, setCats] = useState<Partial<Record<GameType, Category[]>>>({});
  const [error, setError] = useState('');
  const [open, setOpen] = useState('');
  // Chosen subcategory ids per category id.
  const [chosen, setChosen] = useState<Record<string, string[]>>({});
  const [s, setS] = useState(DEFAULTS);
  const [quizSeconds, setQuizSeconds] = useState(10);
  const [busy, setBusy] = useState(false);
  const patch = (p: Partial<typeof DEFAULTS>) => setS((old) => ({ ...old, ...p }));
  const lang = textLocale(s.locale);

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
  const categories = Object.entries(chosen)
    .filter(([, subs]) => subs.length)
    .map(([id, subcategories]) => ({ id, subcategories }));
  const subCount = categories.reduce((n, c) => n + c.subcategories.length, 0);

  function chooseType(t: GameType) {
    setType(t);
    setOpen('');
    setChosen({});
  }
  function toggleCategory(c: Category) {
    setOpen(c.id);
    // The first tap takes the whole category; then single subcategories can be switched off.
    if (!chosen[c.id]?.length) setChosen((old) => ({ ...old, [c.id]: c.subcategories.map((x) => x.id) }));
  }
  function toggleSub(catId: string, subId: string) {
    setChosen((old) => {
      const subs = old[catId] ?? [];
      return { ...old, [catId]: subs.includes(subId) ? subs.filter((x) => x !== subId) : [...subs, subId] };
    });
  }

  async function create() {
    setBusy(true);
    setError('');
    try {
      const src = await dataSource();
      const ids = categories.flatMap((c) => c.subcategories);
      const questions = await src.questions(type, ids, s.rounds, s.difficulty);
      if (!questions.length) throw new Error('empty');
      // Start downloading the first snippet while the lobby fills up.
      if (questions[0].kind === 'music') void preload(questions[0].audio);
      await createRoom(
        { ...s, type, categories, rounds: questions.length, roundSeconds: type === 'quiz' ? quizSeconds : MUSIC_SECONDS },
        questions,
      );
    } catch {
      setError('Не получилось собрать вопросы. Выберите другие подборки или попробуйте ещё раз.');
      setBusy(false);
    }
  }

  const openCat = list?.find((c) => c.id === open);

  return (
    <BlueScreen>
      <AppBar leading={<RoundButton label="Назад" onClick={goHome}><BackIcon /></RoundButton>} title="Создать игру" />

      <p className="section-title">В какую игру хотите поиграть?</p>
      <button className="type-btn" aria-pressed={type === 'music'} onClick={() => chooseType('music')}>
        <img className="type-icon music" src="ui/music_game_type.svg" alt="" />
        Музыкальная викторина
      </button>
      <button className="type-btn" aria-pressed={type === 'quiz'} onClick={() => chooseType('quiz')}>
        <img className="type-icon quiz" src="ui/quiz_game_type.svg" alt="" />
        Интеллектуальная викторина
      </button>

      <p className="section-title">Категория {subCount > 0 && `· выбрано подкатегорий: ${subCount}`}</p>
      {!list && !error && <div className="spinner" aria-label="Загрузка" />}
      {list && (
        <div className="cats">
          {list.map((c) => (
            <button
              key={c.id}
              className="cat"
              aria-pressed={!!chosen[c.id]?.length}
              aria-expanded={open === c.id}
              onClick={() => toggleCategory(c)}
            >
              {c.image && <img src={c.image} alt="" loading="lazy" />}
              {!!chosen[c.id]?.length && <i className="check"><img src="ui/checkmark.svg" width={11} height={11} alt="" /></i>}
              <span>{c.name[lang]}</span>
            </button>
          ))}
        </div>
      )}
      {openCat && (
        <div className="panel">
          <h3>Выберите подкатегорию: {openCat.name[lang]}</h3>
          <div className="chips">
            {openCat.subcategories.map((x) => (
              <button key={x.id} className="chip" aria-pressed={!!chosen[openCat.id]?.includes(x.id)} onClick={() => toggleSub(openCat.id, x.id)}>
                {x.name[lang]}
                <small>{x.size}</small>
              </button>
            ))}
          </div>
        </div>
      )}

      <p className="section-title">Настройки игры</p>
      <div className="panel">
        <Choice label="Количество вопросов" value={s.rounds} options={AMOUNTS.map((n) => [n, n])} onChange={(rounds) => patch({ rounds })} />
        <div className="field">
          <h3>Уровень сложности</h3>
          <div className="chips">
            {[1, 2, 3].map((level) => (
              <button
                key={level}
                className="chip"
                aria-pressed={s.difficulty.includes(level)}
                onClick={() => {
                  const has = s.difficulty.includes(level);
                  if (has && s.difficulty.length === 1) return;
                  patch({ difficulty: has ? s.difficulty.filter((l) => l !== level) : [...s.difficulty, level].sort() });
                }}
              >
                {level} уровень
              </button>
            ))}
          </div>
        </div>
        {type === 'quiz' ? (
          <Choice label="Время раунда, сек" value={quizSeconds} options={QUIZ_SECONDS.map((n): [number, number] => [n, n])} onChange={(v) => setQuizSeconds(Number(v))} />
        ) : (
          <small className="hint">Время раунда в музыкальной игре: {MUSIC_SECONDS} сек, как в приложении.</small>
        )}
        <Toggle
          label="Видеотрансляция"
          value={s.videoEnabled}
          onChange={(videoEnabled) => patch({ videoEnabled })}
          hint="Вы в эфире с камерой; до 4 игроков, которые захотят, можно пригласить в эфир."
        />
        <Toggle label="Приватная игра" value={s.isPrivate} onChange={(isPrivate) => patch({ isPrivate })} hint="В приватную игру не добавляются боты." />
      </div>

      <p className="section-title">Дополнительно</p>
      <div className="panel">        <Choice
          label="Тип ответа"
          value={s.answerType}
          options={[['choose', 'Выбор из вариантов'], ['enter', 'Ввод текста'], ['mixed', 'Вперемешку']]}
          onChange={(answerType) => patch({ answerType })}
        />
        {s.answerType === 'enter' && (
          <Choice
            label="Определение победителя раунда"
            value={s.winnerDetermination}
            options={[['automatically', 'Автоматически'], ['manually', 'Вручную ведущим']]}
            onChange={(winnerDetermination) => patch({ winnerDetermination })}
          />
        )}
        {type === 'music' && (
          <Choice
            label="Что угадываем"
            value={s.questionsType}
            options={[['songAuthorOnly', 'Исполнитель'], ['songTitleOnly', 'Название'], ['mixed', 'Вперемешку']]}
            onChange={(questionsType) => patch({ questionsType })}
          />
        )}
        <Toggle
          label="Учитывать время ответа"
          value={s.takeIntoAnswerTime}
          onChange={(takeIntoAnswerTime) => patch({ takeIntoAnswerTime })}
          hint="При равном счёте выше тот, кто отвечал быстрее; после раунда показываются ответы игроков."
        />
        {type === 'music' && (
          <Toggle
            label="Звук у всех игроков"
            value={s.everyoneHasSound}
            onChange={(everyoneHasSound) => patch({ everyoneHasSound })}
            hint="«Нет» — музыка звучит только у ведущего, как на вечеринке в одной комнате."
          />
        )}
        <Toggle label="Ведущий тоже играет" value={s.isAdminPlayer} onChange={(isAdminPlayer) => patch({ isAdminPlayer })} />
        <Choice
          label="Фоновая музыка"
          value={s.backgroundMusic}
          options={[['fast', 'Быстрая'], ['medium', 'Средняя'], ['slow', 'Медленная']]}
          onChange={(backgroundMusic) => patch({ backgroundMusic })}
        />
        <Choice
          label="Наказания для проигравших"
          value={s.punishment}
          options={PUNISHMENT_KINDS.map(([v, text]) => [v, text])}
          onChange={(punishment) => patch({ punishment })}
        />
        <div className="field">
          <h3><label htmlFor="game-language">Язык игры</label></h3>
          <select id="game-language" className="input select" value={s.locale} onChange={(e) => patch({ locale: e.target.value })}>
            {LANGUAGES.map(([v, text]) => (
              <option key={v} value={v}>{text}</option>
            ))}
          </select>
        </div>
        {type === 'music' && (
          <Toggle
            label="Антишазам"
            value={s.antiShazam}
            onChange={(antiShazam) => patch({ antiShazam })}
            hint="Искажает звук на iPhone в приложении, чтобы трек не распознавался Shazam."
          />
        )}
        {!s.isPrivate && (
          <Choice label="Боты в комнате" value={s.bots} options={[0, 1, 2, 3, 4, 5].map((n) => [n, n])} onChange={(bots) => patch({ bots })} />
        )}
      </div>

      {error && <p className="notice" role="alert" style={{ marginTop: 12 }}>{error}</p>}
      <div className="sticky-bottom">
        <ActionButton disabled={!subCount || busy} onClick={create}>
          {busy ? 'Готовим вопросы…' : subCount ? 'Создать игру' : 'Выберите категорию'}
        </ActionButton>
      </div>
    </BlueScreen>
  );
}
