import { getApp, getApps, initializeApp, type FirebaseApp } from 'firebase/app';

// Same Firebase project as the mobile app, so web and mobile share categories, questions and rooms.
export function firebaseApp(): FirebaseApp {
  if (getApps().length) return getApp();
  return initializeApp({
    apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
    authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN ?? 'sound-guess-95889.firebaseapp.com',
    projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID ?? 'sound-guess-95889',
    appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
    databaseURL:
      process.env.NEXT_PUBLIC_FIREBASE_DATABASE_URL ??
      'https://sound-guess-95889-default-rtdb.europe-west1.firebasedatabase.app',
  });
}
