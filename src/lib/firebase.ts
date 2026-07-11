import { initializeApp } from 'firebase/app';
import { getFirestore } from 'firebase/firestore';

// Dynamically import from the root configuration file so that any change 
// of project made in AI Studio is automatically synchronized.
import firebaseConfig from '../../firebase-applet-config.json';

const app = initializeApp(firebaseConfig);

// Initialize Firestore with custom database ID
export const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);

export default app;
