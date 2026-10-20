import { initializeApp, type FirebaseOptions } from 'firebase/app';
import { getAnalytics, isSupported } from 'firebase/analytics';

// Firebase web config is public by design; access is governed by the project's rules, not this key.
const firebaseConfig: FirebaseOptions = {
  apiKey: 'AIzaSyAoexeJYKlYpkB4aXIdDGZGgDN-mBVTQBw',
  authDomain: 'the-last-gate-b9c8a.firebaseapp.com',
  projectId: 'the-last-gate-b9c8a',
  storageBucket: 'the-last-gate-b9c8a.firebasestorage.app',
  messagingSenderId: '203892493600',
  appId: '1:203892493600:web:02f427fc9360d0ed121b45',
};

/**
 * Connect the deployed site to its Firebase project. Analytics runs only once the project has a
 * measurementId (Google Analytics enabled) and the browser allows it (not in privacy modes).
 */
export async function startAnalytics() {
  const app = initializeApp(firebaseConfig);
  if (firebaseConfig.measurementId && (await isSupported())) getAnalytics(app);
}
