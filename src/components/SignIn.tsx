'use client';

import { useEffect, useState } from 'react';
import { click } from '@/lib/audio';
import { authError, signIn, type Provider } from '@/lib/auth';
import { avatarUrl, useGame } from '@/lib/game/store';
import { ActionButton } from './ui';

const PRIVACY = 'https://docs.google.com/document/d/1zt5XKfBmBIVvWGR3UREkPFnlV8AqtOCTVko1zTrqCaA/edit?usp=sharing';
const TERMS = 'https://docs.google.com/document/d/1wPBLDU0QvTQTsrDjqFEB7DDN-EXINB34Ie1KpdATzSc/edit?usp=sharing';

/** The app's AuthScreen buttons: «Продолжить с Google» / «Продолжить с Apple» and the policy line. */
export function SignIn({ title }: { title?: string }) {
  const { account, signedIn, signOut } = useGame();
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    try {
      const email = localStorage.getItem('sg.auth') ? localStorage.getItem('sg.email') ?? '' : null;
      if (email !== null && useGame.getState().account === null) useGame.setState({ account: email });
    } catch {}
  }, []);

  if (account !== null) {
    return (
      <p className="signed-in">
        Вы вошли{account ? <> как <b>{account}</b></> : ''} · <button type="button" className="link" onClick={() => void signOut()}>Выйти</button>
      </p>
    );
  }

  const go = async (provider: Provider) => {
    click('next');
    setBusy(true);
    const { me } = useGame.getState();
    // The popup opens before anything is awaited, while the tap still counts.
    try {
      signedIn(await signIn(provider, { name: localStorage.getItem('sg.name') || me.name, avatarUrl: avatarUrl(me.avatar) }), provider);
    } catch (e) {
      const notice = authError(e);
      if (notice) useGame.setState({ notice });
    }
    setBusy(false);
  };

  return (
    <div className="signin">
      {title && <p className="signin-title">{title}</p>}
      <ActionButton primary disabled={busy} onClick={() => void go('google')}>
        <span className="signin-btn"><img src="ui/google.svg" width={20} height={20} alt="" />Продолжить с Google</span>
      </ActionButton>
      <ActionButton primary disabled={busy} onClick={() => void go('apple')}>
        <span className="signin-btn"><img src="ui/apple.svg" width={20} height={24} alt="" />Продолжить с Apple</span>
      </ActionButton>
      <p className="signin-policy">
        Продолжая вы соглашаетесь с <a href={PRIVACY} target="_blank" rel="noreferrer">Политикой Конфиденциальности</a> и{' '}
        <a href={TERMS} target="_blank" rel="noreferrer">Условиями использования</a>
      </p>
    </div>
  );
}
