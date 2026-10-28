'use client';

import {
  connectAuthEmulator,
  getAuth,
  GoogleAuthProvider,
  OAuthProvider,
  signInWithPopup,
  signOut as firebaseSignOut,
  type Auth,
  type User,
} from 'firebase/auth';
import { doc, getDoc, setDoc } from 'firebase/firestore/lite';
import { db } from '@/lib/data/firebase';
import { firebaseApp } from '@/lib/firebase-app';

// Sign-in as the app's AuthScreen does it: Google, or Apple ('apple.com'). The Users doc is keyed by
// the Firebase Auth uid, so the same account on a phone and on the web is one player.
export type Provider = 'google' | 'apple';

export interface Account {
  id: string;
  email: string;
  name: string;
  avatarUrl: string;
}

let auth: Auth | null = null;
function client(): Auth {
  if (auth) return auth;
  auth = getAuth(firebaseApp());
  auth.languageCode = 'ru';
  const emulator = process.env.NEXT_PUBLIC_AUTH_EMULATOR;
  if (emulator) connectAuthEmulator(auth, `http://${emulator}`, { disableWarnings: true });
  return auth;
}

function provider(kind: Provider) {
  if (kind === 'google') return new GoogleAuthProvider();
  const apple = new OAuthProvider('apple.com');
  apple.addScope('email');
  apple.addScope('name');
  apple.setCustomParameters({ locale: 'ru' });
  return apple;
}

/** Messages for the failures a player can act on; a closed popup is not an error. */
export function authError(e: unknown): string {
  const code = (e as { code?: string })?.code ?? '';
  if (code === 'auth/popup-closed-by-user' || code === 'auth/cancelled-popup-request') return '';
  if (code === 'auth/popup-blocked') return 'Браузер не дал открыть окно входа. Разрешите всплывающие окна и попробуйте ещё раз.';
  if (code === 'auth/unauthorized-domain' || code === 'auth/operation-not-allowed' || code === 'auth/invalid-oauth-client-id')
    return 'Вход на сайте ещё не включён. Пока можно играть как гость.';
  if (code === 'auth/account-exists-with-different-credential') return 'Этот email уже привязан к другому способу входа.';
  if (code === 'auth/network-request-failed') return 'Нет связи. Попробуйте ещё раз.';
  return 'Не получилось войти. Попробуйте ещё раз.';
}

export interface SignedIn {
  account: Account;
  isNew: boolean;
}

/**
 * Signs in and returns the player's account. A player who already has a profile (from the app)
 * keeps its name and avatar; a new one takes their Google or Apple name, else `fallback`.
 * Call it straight from the tap: browsers block a popup opened after an await.
 */
export async function signIn(kind: Provider, fallback: { name: string; avatarUrl: string }): Promise<SignedIn> {
  const { user } = await signInWithPopup(client(), provider(kind));
  return register(user, fallback);
}

/** Creates the player's Users doc on first sign-in, as the app's registerUser does. */
export async function register(user: User, fallback: { name: string; avatarUrl: string }): Promise<SignedIn> {
  const ref = doc(db, 'Users', user.uid);
  const snap = await getDoc(ref);
  const saved = snap.exists() ? snap.data() : null;
  const email = user.email ?? user.providerData.find((p) => p.email)?.email ?? '';
  const account: Account = {
    id: user.uid,
    email,
    name: (saved?.name as string) || user.displayName || fallback.name,
    avatarUrl: (saved?.avatarUrl as string) || fallback.avatarUrl,
  };
  const isNew = !saved || saved.isGuest !== false;
  // The fields the app's registerUser writes; history and statistics default to empty on its side.
  await setDoc(
    ref,
    isNew
      ? { id: user.uid, isGuest: false, email, contactEmail: email, name: account.name, avatarUrl: account.avatarUrl, winsAmount: 0, source: 'web' }
      : { isGuest: false, email },
    { merge: true },
  );
  return { account, isNew };
}

export async function signOut(): Promise<void> {
  await firebaseSignOut(client()).catch(() => {});
}
