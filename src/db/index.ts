import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getFirestore, Firestore, FieldValue } from 'firebase-admin/firestore';
import { config } from '../config/index.js';

let db: Firestore;

export function initDb() {
  if (getApps().length === 0) {
    let appOptions: any = {};
    
    // Support for full service account JSON in an environment variable (best for Vercel)
    if (config.FIREBASE_SERVICE_ACCOUNT) {
      try {
        const serviceAccount = JSON.parse(config.FIREBASE_SERVICE_ACCOUNT);
        appOptions.credential = cert(serviceAccount);
      } catch (e) {
        console.error('Failed to parse FIREBASE_SERVICE_ACCOUNT JSON:', e);
      }
    } else if (config.FIREBASE_PROJECT_ID) {
      appOptions.projectId = config.FIREBASE_PROJECT_ID;
    }
    
    initializeApp(appOptions);
  }
  db = getFirestore();
}

export async function saveUserLocation(userId: string, lat: number, lon: number) {
  await db.collection('locations').doc(userId).set({
    lat,
    lon,
    timestamp: FieldValue.serverTimestamp()
  });
}

export async function getUserLocation(userId: string): Promise<{ lat: number, lon: number } | null> {
  const doc = await db.collection('locations').doc(userId).get();
  if (!doc.exists) return null;
  const data = doc.data();
  if (!data || typeof data.lat !== 'number' || typeof data.lon !== 'number') {
    return null;
  }
  return { lat: data.lat, lon: data.lon };
}

export async function saveMessage(userId: string, role: string, content: string) {
  // Use a subcollection for messages per user to keep it organized and scalable
  await db.collection('users').doc(userId).collection('messages').add({
    role,
    content,
    timestamp: FieldValue.serverTimestamp()
  });
}

export async function getMessages(userId: string, limit: number = 50) {
  const snapshot = await db.collection('users')
    .doc(userId)
    .collection('messages')
    .orderBy('timestamp', 'desc')
    .limit(limit)
    .get();

  const messages = snapshot.docs.map(doc => {
    const data = doc.data();
    return {
      role: data.role as 'system' | 'user' | 'assistant' | 'tool',
      content: data.content
    };
  });

  // Reverse because we want them in chronological order
  return messages.reverse();
}

export async function clearMessages(userId: string) {
  const batch = db.batch();
  const snapshot = await db.collection('users').doc(userId).collection('messages').get();
  snapshot.docs.forEach(doc => batch.delete(doc.ref));
  await batch.commit();
}
