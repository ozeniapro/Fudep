import { db } from './firebase';
import { 
  collection, 
  doc, 
  getDocs, 
  getDoc, 
  setDoc, 
  deleteDoc, 
  writeBatch
} from 'firebase/firestore';
import { INITIAL_TECHNICIANS, INITIAL_POSTS } from '../mockData';
import { NailTechnician, Post, BookingRequest, UserAccount, Analytics, FAQItem } from '../types';
import { DEFAULT_FUDEP_LOGO_BASE64 } from '../assets/defaultLogoBase64';

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  }
}

export function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {}, // Custom app-level accounts are used, not Firebase Auth
    operationType,
    path
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

export function cleanForFirestore<T>(obj: T): T {
  if (obj === null || obj === undefined) {
    return obj;
  }
  if (Array.isArray(obj)) {
    return obj.map(item => cleanForFirestore(item)) as unknown as T;
  }
  if (typeof obj === 'object') {
    const cleaned: any = {};
    for (const key in obj) {
      if (Object.prototype.hasOwnProperty.call(obj, key)) {
        const val = obj[key];
        if (val !== undefined) {
          cleaned[key] = cleanForFirestore(val);
        }
      }
    }
    return cleaned as T;
  }
  return obj;
}

// Seeding function: run only once if technicians collection is completely empty
export async function seedDatabaseIfEmpty() {
  const collectionPath = 'technicians';
  try {
    // Check if we already seeded previously
    const seededRef = doc(db, 'settings', 'seeded');
    const seededSnap = await getDoc(seededRef);
    if (seededSnap.exists() && seededSnap.data()?.value === true) {
      console.log('Firestore: Database has been previously seeded. Skipping.');
      return;
    }

    const techSnapshot = await getDocs(collection(db, collectionPath));
    if (techSnapshot.empty) {
      console.log('Firestore: Database is empty. Seeding with default mock data...');
      
      const batch = writeBatch(db);
      
      // Seed technicians
      INITIAL_TECHNICIANS.forEach(tech => {
        const techRef = doc(db, 'technicians', tech.id);
        batch.set(techRef, cleanForFirestore(tech));
      });
      
      // Seed posts
      INITIAL_POSTS.forEach(post => {
        const postRef = doc(db, 'posts', post.id);
        batch.set(postRef, cleanForFirestore(post));
      });

      // Seed default admin password (hashed SHA-256 of "OzeniaFudep2026!")
      const adminRef = doc(db, 'settings', 'admin');
      batch.set(adminRef, { password: '3c1ff10b0244766465f14e661642876a3be3fec9590daeb8e036dfdc4ef40cf8' });

      // Seed default policy texts
      const policiesRef = doc(db, 'settings', 'policies');
      batch.set(policiesRef, {
        cgv: `1. Objet\nLes présentes CGV régissent l'utilisation de la plateforme Fudep, une marketplace connectant des clients avec des prothésistes ongulaires qualifiés d'Île-de-France.\n\n2. Réservations et Acomptes\nPour confirmer toute réservation de prestation de manucure, un acompte obligatoire de 30% est perçu via notre partenaire sécurisé de paiement Stripe. Le solde de 70% est versé directement au prestataire le jour du rendez-vous.\n\n3. Annulation et Remboursement\nL'acompte de 30% est intégralement remboursable pour toute annulation effectuée plus de 24 heures avant l'heure fixée pour le rendez-vous. En cas d'annulation moins de 24 heures à l'avance, l'acompte sera conservé comme dédommagement.`,
        privacy: `Collecte des Données\nFudep collecte vos données d'inscription (nom, e-mail, téléphone, ville) exclusivement pour assurer le bon déroulement de vos réservations auprès des prothésistes ongulaires.\n\nSécurité et Stockage\nVos données sont protégées de manière confidentielle et sécurisée. Vos données de carte bancaire transitent directement via Stripe et ne sont jamais stockées en clair sur nos serveurs.\n\nDroit d'accès et d'effacement\nConformément au RGPD, vous disposez d'un droit d'accès, de rectification et de suppression de vos données personnelles sur simple demande par e-mail à l'adresse ozenia.pro@gmail.com.`,
        legal: `Editeur de la Plateforme : Fudep Marketplace Inc., SAS au capital de 5 000€, immatriculée au RCS de Paris.\nDirecteur de la Publication : Sophie Laurent (Ozenia)\nHébergement : Google Cloud Run Container Infrastructure.\nContact : ozenia.pro@gmail.com`
      });

      // Seed baseline analytics
      const analyticsRef = doc(db, 'settings', 'analytics');
      batch.set(analyticsRef, {
        profileClicks: {},
        feedViewsCount: 42,
        bookingAttempts: 12,
        bookingsCompleted: 3,
        favoritesCount: 18,
        viewDetailsCount: 35
      });

      // Seed default FAQs
      const faqsRef = doc(db, 'settings', 'faqs');
      batch.set(faqsRef, {
        list: [
          {
            id: 'faq_1',
            category: 'Réservations & Acomptes',
            question: 'Comment fonctionnent les réservations et les acomptes ?',
            answer: 'Pour réserver une prestation, vous réglez un acompte de 30% en ligne de manière sécurisée via Stripe. Le solde restant de 70% est à verser directement auprès du prestataire le jour de votre rendez-vous.'
          },
          {
            id: 'faq_2',
            category: 'Annulations & Reports',
            question: 'Puis-je annuler ou reporter mon rendez-vous ?',
            answer: "Oui, vous pouvez annuler votre réservation gratuitement jusqu'à 24 heures avant l'heure du rendez-vous et votre acompte de 30% vous sera intégralement remboursé. En cas d'annulation moins de 24h à l'avance, l'acompte sera conservé par le prestataire à titre de dédommagement."
          },
          {
            id: 'faq_3',
            category: 'Prestataires & Contact',
            question: "Comment contacter mon prestataire d'ongles ?",
            answer: "Une fois votre demande de réservation validée, vous recevrez les coordonnées complètes du prestataire (numéro de téléphone et adresse exacte) pour finaliser l'organisation de votre séance."
          }
        ]
      });

      // Seed default accounts (password is hashed SHA-256 of "sophie")
      const accountRef = doc(db, 'accounts', 'sophie.laurent@gmail.com'.toLowerCase());
      batch.set(accountRef, {
        name: 'Sophie Laurent',
        email: 'sophie.laurent@gmail.com',
        phone: '06 12 34 56 78',
        city: 'Paris',
        password: '9bcf308b2eb594412c9676da0594dbf068305c48197779fb0cc7b952f4ec62b0'
      });

      // Seed default logo
      const logoRef = doc(db, 'settings', 'logo');
      batch.set(logoRef, {
        logoUrl: DEFAULT_FUDEP_LOGO_BASE64,
        updatedAt: new Date().toLocaleString('fr-FR')
      });

      // Mark as seeded
      batch.set(seededRef, { value: true, createdAt: new Date().toLocaleString('fr-FR') });

      await batch.commit();
      console.log('Firestore: Database successfully seeded!');
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, collectionPath);
  }
}

export async function markAsSeededInDb() {
  try {
    await setDoc(doc(db, 'settings', 'seeded'), { value: true, updatedAt: new Date().toLocaleString('fr-FR') });
  } catch (error) {
    console.error("Error setting seeded flag:", error);
  }
}

// --- DB GETTERS ---

export async function fetchTechnicians(): Promise<NailTechnician[]> {
  const path = 'technicians';
  try {
    const querySnapshot = await getDocs(collection(db, path));
    const list: NailTechnician[] = [];
    querySnapshot.forEach(doc => {
      list.push({ ...doc.data() } as NailTechnician);
    });
    return list;
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, path);
    return [];
  }
}

export async function fetchPosts(): Promise<Post[]> {
  const path = 'posts';
  try {
    const querySnapshot = await getDocs(collection(db, path));
    const list: Post[] = [];
    querySnapshot.forEach(doc => {
      list.push({ ...doc.data() } as Post);
    });
    return list;
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, path);
    return [];
  }
}

export async function fetchBookings(): Promise<BookingRequest[]> {
  const path = 'bookings';
  try {
    const querySnapshot = await getDocs(collection(db, path));
    const list: BookingRequest[] = [];
    querySnapshot.forEach(doc => {
      list.push({ ...doc.data() } as BookingRequest);
    });
    return list.sort((a, b) => b.id.localeCompare(a.id));
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, path);
    return [];
  }
}

export async function fetchAccounts(): Promise<UserAccount[]> {
  const path = 'accounts';
  try {
    const querySnapshot = await getDocs(collection(db, path));
    const list: UserAccount[] = [];
    querySnapshot.forEach(doc => {
      list.push({ ...doc.data() } as UserAccount);
    });
    return list;
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, path);
    return [];
  }
}

export async function fetchLogoFromDb(): Promise<string> {
  try {
    const logoDoc = await getDoc(doc(db, 'settings', 'logo'));
    if (logoDoc.exists() && logoDoc.data()?.logoUrl) {
      return logoDoc.data().logoUrl;
    }
  } catch (error) {
    console.error("Error fetching logo from Firestore:", error);
  }
  return DEFAULT_FUDEP_LOGO_BASE64;
}

export async function saveLogoToDb(logoUrlOrBase64: string): Promise<void> {
  try {
    await setDoc(doc(db, 'settings', 'logo'), {
      logoUrl: logoUrlOrBase64,
      updatedAt: new Date().toISOString()
    });
  } catch (error) {
    console.error("Error saving logo to Firestore:", error);
    handleFirestoreError(error, OperationType.WRITE, 'settings/logo');
  }
}

export async function fetchSettings(): Promise<{
  adminPassword?: string;
  policies?: { cgu: string; cgv: string; refund: string; privacy: string; legal: string };
  analytics?: Analytics;
  faqs?: FAQItem[];
  seeded?: boolean;
}> {
  const path = 'settings';
  try {
    const adminDoc = await getDoc(doc(db, 'settings', 'admin'));
    const policiesDoc = await getDoc(doc(db, 'settings', 'policies'));
    const analyticsDoc = await getDoc(doc(db, 'settings', 'analytics'));
    const faqsDoc = await getDoc(doc(db, 'settings', 'faqs'));
    const seededDoc = await getDoc(doc(db, 'settings', 'seeded'));

    return {
      adminPassword: adminDoc.exists() ? adminDoc.data().password : undefined,
      policies: policiesDoc.exists() ? policiesDoc.data() as any : undefined,
      analytics: analyticsDoc.exists() ? analyticsDoc.data() as Analytics : undefined,
      faqs: faqsDoc.exists() ? faqsDoc.data().list as FAQItem[] : undefined,
      seeded: seededDoc.exists() ? seededDoc.data().value : false
    };
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, path);
    return {};
  }
}

// --- DB MUTATIONS ---

export function extractHashtags(text: string): string[] {
  if (!text) return [];
  const regex = /#(\w+)/g;
  const matches = Array.from(text.matchAll(regex));
  return matches.map(m => m[1]);
}

export async function saveFavoriteToDb(userId: string, providerIdOrPostId: string, type: 'provider' | 'post') {
  const docId = `${userId.toLowerCase().replace(/[^a-zA-Z0-9_.-]/g, '_')}_${providerIdOrPostId}`;
  const path = `favorites/${docId}`;
  try {
    await setDoc(doc(db, 'favorites', docId), cleanForFirestore({
      userId: userId.toLowerCase(),
      [type === 'provider' ? 'providerId' : 'postId']: providerIdOrPostId,
      type,
      createdAt: new Date().toLocaleString('fr-FR')
    }));
  } catch (error) {
    console.error("Error saving favorite:", error);
  }
}

export async function deleteFavoriteFromDb(userId: string, providerIdOrPostId: string) {
  const docId = `${userId.toLowerCase().replace(/[^a-zA-Z0-9_.-]/g, '_')}_${providerIdOrPostId}`;
  const path = `favorites/${docId}`;
  try {
    await deleteDoc(doc(db, 'favorites', docId));
  } catch (error) {
    console.error("Error deleting favorite:", error);
  }
}

export async function saveTechnicianToDb(tech: NailTechnician) {
  const path = `technicians/${tech.id}`;
  try {
    await setDoc(doc(db, 'technicians', tech.id), cleanForFirestore(tech));

    // Double-write to 'providers' collection
    await setDoc(doc(db, 'providers', tech.id), cleanForFirestore({
      id: tech.id,
      businessName: tech.name,
      description: tech.bio,
      city: tech.city,
      address: tech.city + ", France",
      email: tech.username + "@fudep.fr",
      profilePicture: tech.avatar,
      category: "Prothésiste Ongulaire",
      averageRating: 4.8,
      reviewCount: 15,
      isActive: true,
      createdAt: new Date().toLocaleString('fr-FR')
    }));
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

export async function savePostToDb(post: Post) {
  const path = `posts/${post.id}`;
  try {
    await setDoc(doc(db, 'posts', post.id), cleanForFirestore(post));

    // Double-write to 'publications' collection
    const p = post as any;
    await setDoc(doc(db, 'publications', post.id), cleanForFirestore({
      id: post.id,
      providerId: post.technicianId,
      imageUrl: post.imageUrl,
      caption: post.caption,
      description: post.caption,
      category: "Nail Art",
      price: p.price || 45,
      city: p.city || "Paris",
      likesCount: post.likes || 0,
      favoritesCount: post.likes || 0,
      reservationsCount: 1,
      createdAt: p.time || post.date || new Date().toLocaleString('fr-FR'),
      isActive: true
    }));

    // Write hashtags to subcollection or a 'hashtags' tracking collection
    const hashtags = extractHashtags(post.caption);
    for (const tag of hashtags) {
      const hashtagId = tag.toLowerCase();
      await setDoc(doc(db, 'hashtags', hashtagId), cleanForFirestore({
        name: tag,
        count: 1,
        createdAt: new Date().toLocaleString('fr-FR')
      }));
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

export async function deletePostFromDb(postId: string) {
  const path = `posts/${postId}`;
  try {
    await deleteDoc(doc(db, 'posts', postId));
    await deleteDoc(doc(db, 'publications', postId));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}

export async function saveBookingToDb(booking: BookingRequest) {
  const path = `bookings/${booking.id}`;
  try {
    // Write to both 'bookings' (plural) and 'booking' (singular) to ensure it is present under either collection name
    await setDoc(doc(db, 'bookings', booking.id), cleanForFirestore(booking));
    await setDoc(doc(db, 'booking', booking.id), cleanForFirestore(booking));

    // Double-write to 'reservations' collection as requested by the user
    const resStatus = booking.status === 'confirmed' ? 'confirmed' : booking.status === 'refused' ? 'refused' : booking.status === 'proposed' ? 'pending' : 'pending';
    await setDoc(doc(db, 'reservations', booking.id), cleanForFirestore({
      id: booking.id,
      clientId: booking.clientEmail,
      providerId: booking.technicianId,
      publicationId: booking.postRefId || "",
      desiredDate: booking.desiredDate,
      alternativeDates: booking.alternativeAvailabilities ? [booking.alternativeAvailabilities] : [],
      message: booking.message || "",
      price: booking.price,
      depositAmount: booking.depositPaid || 0,
      paymentStatus: (booking.depositPaid && booking.depositPaid > 0) ? 'paid' : 'pending',
      reservationStatus: resStatus,
      createdAt: booking.createdAt || new Date().toLocaleString('fr-FR')
    }));
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

export async function saveAccountToDb(account: UserAccount) {
  const path = `accounts/${account.email.toLowerCase()}`;
  try {
    await setDoc(doc(db, 'accounts', account.email.toLowerCase()), cleanForFirestore(account));

    // Double-write to 'users' collection as requested by the user
    const names = account.name.split(' ');
    const firstName = names[0] || '';
    const lastName = names.slice(1).join(' ') || '';

    await setDoc(doc(db, 'users', account.email.toLowerCase()), cleanForFirestore({
      firstName,
      lastName,
      email: account.email,
      phone: account.phone,
      city: account.city,
      accountType: account.email.toLowerCase() === 'ozenia.pro@gmail.com' ? 'provider' : 'client',
      client: account.email.toLowerCase() !== 'ozenia.pro@gmail.com',
      provider: account.email.toLowerCase() === 'ozenia.pro@gmail.com',
      profilePicture: "https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150&auto=format&fit=crop&q=80",
      createdAt: new Date().toLocaleString('fr-FR'),
      updatedAt: new Date().toLocaleString('fr-FR'),
      isActive: true,
      favorites: account.favorites || [],
      likedPosts: account.likedPosts || []
    }));
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

export async function saveAdminPasswordToDb(password: string) {
  const path = 'settings/admin';
  try {
    await setDoc(doc(db, 'settings', 'admin'), cleanForFirestore({ password }));
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

export async function savePoliciesToDb(policies: { cgu: string; cgv: string; refund: string; privacy: string; legal: string }) {
  const path = 'settings/policies';
  try {
    await setDoc(doc(db, 'settings', 'policies'), cleanForFirestore(policies));
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

export async function saveAnalyticsToDb(analytics: Analytics) {
  const path = 'settings/analytics';
  try {
    await setDoc(doc(db, 'settings', 'analytics'), cleanForFirestore(analytics));
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

export async function saveFaqsToDb(faqs: FAQItem[]) {
  const path = 'settings/faqs';
  try {
    await setDoc(doc(db, 'settings', 'faqs'), cleanForFirestore({ list: faqs }));
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

export async function deleteTechnicianFromDb(techId: string) {
  const path = `technicians/${techId}`;
  try {
    await deleteDoc(doc(db, 'technicians', techId));
    await deleteDoc(doc(db, 'providers', techId));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}

export async function sendNotificationEmail(to: string, subject: string, text: string, html: string, type: string) {
  const emailId = `mail_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
  const path = `emails/${emailId}`;
  
  const emailDoc = {
    id: emailId,
    to,
    subject,
    text,
    html,
    type,
    status: 'pending',
    createdAt: new Date().toLocaleString('fr-FR')
  };

  try {
    // 1. Write the email log to Firestore collection 'emails'
    await setDoc(doc(db, 'emails', emailId), cleanForFirestore(emailDoc));
    
    // 2. Trigger the server-side API to send the email
    const response = await fetch('/api/send-email', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ to, subject, text, html }),
    });

    if (!response.ok) {
      throw new Error(`HTTP Error: ${response.status}`);
    }

    const resData = await response.json();
    
    // 3. Update status in Firestore
    await setDoc(doc(db, 'emails', emailId), cleanForFirestore({
      ...emailDoc,
      status: resData.delivered ? 'delivered' : resData.logged ? 'logged_simulator' : 'failed'
    }));
    
    console.log(`Notification email logged and processed successfully (${resData.delivered ? 'delivered' : 'simulator'}).`);
  } catch (error: any) {
    console.error("Failed to send notification email:", error);
    // Update status to failed
    try {
      await setDoc(doc(db, 'emails', emailId), cleanForFirestore({
        ...emailDoc,
        status: 'failed',
        error: error.message || String(error)
      }));
    } catch (e) {
      console.error("Could not write email failure status to Firestore:", e);
    }
  }
}

export async function deleteAccountFromDb(email: string) {
  const path = `accounts/${email.toLowerCase()}`;
  try {
    await deleteDoc(doc(db, 'accounts', email.toLowerCase()));
    console.log(`Successfully deleted account from Firestore: ${email}`);
  } catch (error) {
    console.error(`Error deleting account ${email} from Firestore:`, error);
  }
}

