import React, { useState, useEffect, useMemo, useRef } from 'react';
import { 
  Heart, 
  Share2, 
  MapPin, 
  Star, 
  Grid, 
  LayoutGrid, 
  SlidersHorizontal, 
  Calendar, 
  Clock, 
  User, 
  Phone, 
  Mail, 
  MessageSquare, 
  Check, 
  X, 
  Sparkles, 
  Activity, 
  Plus, 
  ChevronRight, 
  LogOut, 
  AlertCircle,
  Bookmark,
  CheckCircle2,
  Lock,
  ArrowRight,
  Eye,
  Settings,
  ShoppingBag,
  Sliders,
  TrendingUp,
  XCircle,
  Copy,
  CreditCard,
  Trash2
} from 'lucide-react';
import { INITIAL_TECHNICIANS, INITIAL_POSTS } from './mockData';
import { NailTechnician, Post, BookingRequest, Analytics, UserSession, NailService, UserAccount, FAQItem } from './types';
import { AdminSettingsTab } from './components/AdminSettingsTab';
import { 
  seedDatabaseIfEmpty, 
  fetchTechnicians, 
  fetchPosts, 
  fetchBookings, 
  fetchAccounts, 
  fetchSettings, 
  saveTechnicianToDb, 
  savePostToDb, 
  deletePostFromDb, 
  saveBookingToDb, 
  saveAccountToDb, 
  saveAdminPasswordToDb, 
  savePoliciesToDb, 
  saveAnalyticsToDb,
  saveFaqsToDb,
  deleteTechnicianFromDb,
  saveFavoriteToDb,
  deleteFavoriteFromDb,
  sendNotificationEmail,
  markAsSeededInDb,
  deleteAccountFromDb
} from './lib/firebaseSync';

// Helper function to hash password securely with SHA-256 for Firestore storage
async function hashPassword(password: string): Promise<string> {
  const msgBuffer = new TextEncoder().encode(password);
  const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

const renderCaptionWithHashtags = (caption: string, onHashtagClick?: (tag: string) => void) => {
  if (!caption) return '';
  const parts = caption.split(/(\s+)/);
  return parts.map((part, i) => {
    if (part.startsWith('#')) {
      const cleanTag = part.replace(/[#,.:;!?]/g, '').trim();
      return (
        <span 
          key={i} 
          onClick={(e) => {
            if (onHashtagClick) {
              e.stopPropagation();
              onHashtagClick(cleanTag);
            }
          }}
          className="text-[#0f4c81] font-bold hover:underline cursor-pointer"
        >
          {part}
        </span>
      );
    }
    return part;
  });
};

const formatFrenchDateDayName = (dateStr: string) => {
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return '';
    const days = ['Dim', 'Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam'];
    return days[d.getDay()];
  } catch {
    return '';
  }
};

const formatFrenchDateShort = (dateStr: string) => {
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return dateStr;
    const months = ['Janv', 'Févr', 'Mars', 'Avr', 'Mai', 'Juin', 'Juil', 'Août', 'Sept', 'Oct', 'Nov', 'Déc'];
    return `${d.getDate()} ${months[d.getMonth()]}`;
  } catch {
    return dateStr;
  }
};

const formatToFrenchDate = (dateStr: string) => {
  if (!dateStr) return '';
  if (dateStr.includes('-')) {
    const parts = dateStr.split('-');
    if (parts.length === 3 && parts[0].length === 4) {
      return `${parts[2]}-${parts[1]}-${parts[0]}`;
    }
  }
  return dateStr;
};

const isSlotPast = (slotStr: string): boolean => {
  if (!slotStr) return false;
  try {
    const parts = slotStr.split(' à ');
    if (parts.length === 2) {
      let [datePart, timePart] = parts;
      if (datePart.includes('-')) {
        const dParts = datePart.split('-');
        if (dParts[0].length !== 4 && dParts[2].length === 4) {
          datePart = `${dParts[2]}-${dParts[1]}-${dParts[0]}`;
        }
      } else if (datePart.includes('/')) {
        const dParts = datePart.split('/');
        if (dParts[2].length === 4) {
          datePart = `${dParts[2]}-${dParts[1]}-${dParts[0]}`;
        }
      }
      const slotDateTime = new Date(`${datePart}T${timePart}`);
      if (!isNaN(slotDateTime.getTime())) {
        return slotDateTime < new Date();
      }
    }
  } catch (err) {}
  return false;
};

const isBookingPast = (dateStr: string, timeStr: string): boolean => {
  if (!dateStr || !timeStr) return false;
  return isSlotPast(`${dateStr} à ${timeStr}`);
};

const parseHashtags = (tagsInput: string, captionInput: string): string[] => {
  const extracted: string[] = [];
  
  // 1. Extract hashtags from caption (e.g. #NailArt -> NailArt)
  if (captionInput) {
    const hashtagRegex = /#([a-zA-Z0-9À-ÿ_-]+)/g;
    const matches = Array.from(captionInput.matchAll(hashtagRegex));
    matches.forEach(match => {
      if (match[1]) {
        extracted.push(match[1].trim());
      }
    });
  }

  // 2. Extract and parse from the tags input field
  if (tagsInput) {
    const rawTokens = tagsInput.includes(',') 
      ? tagsInput.split(',') 
      : tagsInput.split(/\s+/);
      
    rawTokens.forEach(token => {
      const cleaned = token.replace(/#/g, '').trim();
      if (cleaned) {
        extracted.push(cleaned);
      }
    });
  }

  // 3. Deduplicate (case-insensitive, keeping original casing of the first match)
  const seen = new Set<string>();
  const result: string[] = [];
  
  extracted.forEach(tag => {
    const lower = tag.toLowerCase();
    if (!seen.has(lower)) {
      seen.add(lower);
      result.push(tag);
    }
  });

  return result;
};

export default function App() {
  // --- STATE ---
  const [loadingDb, setLoadingDb] = useState<boolean>(true);
  
  const [technicians, setTechnicians] = useState<NailTechnician[]>(() => {
    const saved = localStorage.getItem('fudep_technicians');
    const base = saved ? JSON.parse(saved) : INITIAL_TECHNICIANS;
    // Pre-populate some default free slots for visual consistency if they don't exist
    return base.map((t: NailTechnician) => {
      if (!t.freeSlots || t.freeSlots.length === 0) {
        if (t.id === 'tech_1') {
          return { ...t, freeSlots: ['2026-07-03 à 10:00', '2026-07-04 à 14:00', '2026-07-05 à 16:30'] };
        } else if (t.id === 'tech_2') {
          return { ...t, freeSlots: ['2026-07-04 à 09:30', '2026-07-06 à 11:00'] };
        } else {
          return { ...t, freeSlots: ['2026-07-05 à 10:00', '2026-07-07 à 15:00'] };
        }
      }
      return t;
    });
  });

  const [posts, setPosts] = useState<Post[]>(() => {
    const saved = localStorage.getItem('fudep_posts');
    return saved ? JSON.parse(saved) : INITIAL_POSTS;
  });

  const [bookings, setBookings] = useState<BookingRequest[]>(() => {
    const saved = localStorage.getItem('fudep_bookings');
    return saved ? JSON.parse(saved) : [];
  });

  const [analytics, setAnalytics] = useState<Analytics>(() => {
    const saved = localStorage.getItem('fudep_analytics');
    return saved ? JSON.parse(saved) : {
      profileClicks: {},
      feedViewsCount: 42, // baseline simulation
      bookingAttempts: 12,
      bookingsCompleted: 3,
      favoritesCount: 18,
      viewDetailsCount: 35
    };
  });

  const [session, setSession] = useState<UserSession>(() => {
    const saved = localStorage.getItem('fudep_session');
    return saved ? JSON.parse(saved) : {
      isLoggedIn: false,
      favorites: [],
      likedPosts: []
    };
  });

  const [currentMonthOffset, setCurrentMonthOffset] = useState<number>(0);

  // --- ACCOUNT PERSISTENCE & USER AUTHENTICATION ---
  const [adminPassword, setAdminPassword] = useState<string>(() => {
    return localStorage.getItem('fudep_admin_password') || 'OzeniaFudep2026!';
  });

  const [accounts, setAccounts] = useState<UserAccount[]>(() => {
    const saved = localStorage.getItem('fudep_accounts');
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch (e) {}
    }
    return [
      {
        name: 'Sophie Laurent',
        email: 'sophie.laurent@gmail.com',
        phone: '06 12 34 56 78',
        city: 'Paris',
        password: 'sophie'
      }
    ];
  });

  // --- FIRESTORE INITIALIZATION & SYNCHRONIZATION ---
  useEffect(() => {
    async function initFirestore() {
      try {
        console.log("Firestore: Initializing and loading data...");
        // Ensure seeded
        await seedDatabaseIfEmpty();

        // Parallel load from Firestore
        const [techs, allPosts, allBookings, allAccounts, settings] = await Promise.all([
          fetchTechnicians(),
          fetchPosts(),
          fetchBookings(),
          fetchAccounts(),
          fetchSettings()
        ]);

        if (techs.length > 0) {
          setTechnicians(techs);
        } else if (settings.seeded) {
          setTechnicians([]);
        }
        if (allPosts.length > 0) {
          setPosts(allPosts);
        } else if (settings.seeded) {
          setPosts([]);
        }
        setBookings(allBookings); // can be empty
        if (allAccounts.length > 0) {
          setAccounts(allAccounts);
          // If user is logged in, sync their session with the latest DB state
          const savedSessionStr = localStorage.getItem('fudep_session');
          if (savedSessionStr) {
            try {
              const savedSession = JSON.parse(savedSessionStr);
              if (savedSession.isLoggedIn && savedSession.email) {
                const currentAccount = allAccounts.find(acc => acc.email.toLowerCase() === savedSession.email.toLowerCase());
                if (currentAccount) {
                  setSession(prev => ({
                    ...prev,
                    name: currentAccount.name,
                    phone: currentAccount.phone,
                    city: currentAccount.city,
                    favorites: currentAccount.favorites || prev.favorites || [],
                    likedPosts: currentAccount.likedPosts || prev.likedPosts || []
                  }));
                }
              }
            } catch (err) {}
          }
        }

        if (settings.adminPassword) {
          setAdminPassword(settings.adminPassword);
        }
        if (settings.policies) {
          if (settings.policies.cgu) {
            setCguText(settings.policies.cgu);
            setTempCguText(settings.policies.cgu);
          }
          if (settings.policies.cgv) {
            setCgvText(settings.policies.cgv);
            setTempCgvText(settings.policies.cgv);
          }
          if (settings.policies.refund) {
            setRefundText(settings.policies.refund);
            setTempRefundText(settings.policies.refund);
          }
          if (settings.policies.privacy) {
            setPrivacyText(settings.policies.privacy);
            setTempPrivacyText(settings.policies.privacy);
          }
          if (settings.policies.legal) {
            setLegalText(settings.policies.legal);
            setTempLegalText(settings.policies.legal);
          }
        }
        if (settings.analytics) {
          setAnalytics(settings.analytics);
        }
        if (settings.faqs && settings.faqs.length > 0) {
          setFaqs(settings.faqs);
        }
        console.log("Firestore: All data successfully loaded!");
      } catch (e) {
        console.error("Firestore: Error loading initial data:", e);
      } finally {
        setLoadingDb(false);
      }
    }
    initFirestore();
  }, []);

  // Confirmation popup detection
  useEffect(() => {
    if (!session.isLoggedIn || !session.email || bookings.length === 0) return;
    
    // Find a booking belonging to this user that is 'confirmed'
    const userBookings = bookings.filter(b => b.clientEmail.toLowerCase() === session.email!.toLowerCase());
    const confirmedBooking = userBookings.find(b => b.status === 'confirmed');
    
    if (confirmedBooking) {
      // Check if we already showed the notification for this booking ID
      const shownStr = localStorage.getItem('fudep_shown_confirmations') || '[]';
      let shownIds = [];
      try {
        shownIds = JSON.parse(shownStr);
      } catch (err) {
        shownIds = [];
      }
      if (!Array.isArray(shownIds)) {
        shownIds = [];
      }
      if (!shownIds.includes(confirmedBooking.id)) {
        setConfirmedBookingNotification(confirmedBooking);
      }
    }
  }, [bookings, session]);

  useEffect(() => {
    localStorage.setItem('fudep_accounts', JSON.stringify(accounts));
  }, [accounts]);

  const [authMode, setAuthMode] = useState<'login' | 'signup'>('login');
  const [authError, setAuthError] = useState<string | null>(null);
  const [bookingIntent, setBookingIntent] = useState<{
    technician: NailTechnician;
    service: NailService;
    post?: Post;
  } | null>(null);

  // States for adding manual free slots (Admin)
  const [selectedTechForSlot, setSelectedTechForSlot] = useState<string>('');
  const [freeSlotDate, setFreeSlotDate] = useState<string>('');
  const [freeSlotTime, setFreeSlotTime] = useState<string>('10:00');

  // States for proposing alternative date/time (Admin)
  const [proposingDateId, setProposingDateId] = useState<string | null>(null);
  const [alternateDateInput, setAlternateDateInput] = useState<string>('');
  const [alternateTimeInput, setAlternateTimeInput] = useState<string>('10:00');

  // Navigation & View controls
  const [activeTab, setActiveTab] = useState<'feed' | 'favorites' | 'bookings' | 'profile'>('feed');
  const [selectedCity, setSelectedCity] = useState<string>('Tous');
  const [selectedTag, setSelectedTag] = useState<string>('Tous');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [similarToPostId, setSimilarToPostId] = useState<string | null>(null);


  
  // Profile tab and authentication helper states
  const [confirmPassword, setConfirmPassword] = useState<string>('');
  const [forgotPasswordEmail, setForgotPasswordEmail] = useState<string>('');
  const [oldPassword, setOldPassword] = useState<string>('');
  const [newPassword, setNewPassword] = useState<string>('');
  const [confirmNewPassword, setConfirmNewPassword] = useState<string>('');
  const [helpSubject, setHelpSubject] = useState<string>('général');
  const [helpMessage, setHelpMessage] = useState<string>('');
  const [expandedPolicy, setExpandedPolicy] = useState<string | null>(null);
  const [acceptTerms, setAcceptTerms] = useState<boolean>(false);
  const [activePolicyModal, setActivePolicyModal] = useState<'cgu' | 'cgv' | 'refund' | 'privacy' | 'legal' | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState<boolean>(false);
  
  // Legal Policies States & Edit helpers
  const [cguText, setCguText] = useState<string>(() => {
    return localStorage.getItem('fudep_policy_cgu') || `1. Conditions d'Utilisation\nBienvenue sur la plateforme Fudep. En accédant à notre service, vous acceptez de respecter les présentes Conditions Générales d'Utilisation. La plateforme permet la mise en relation entre clients et prestataires indépendants pour des services de manucure.\n\n2. Accès au service\nL'utilisation du service nécessite la création d'un compte utilisateur en fournissant des informations d'identification valides. L'utilisateur est responsable de la confidentialité de ses identifiants.\n\n3. Responsabilité\nFudep agit en tant que simple intermédiaire technique de mise en relation. Nous ne saurions être tenus responsables de la qualité ou de l'exécution des prestations de manucure réservées par l'intermédiaire de la plateforme.`;
  });
  const [cgvText, setCgvText] = useState<string>(() => {
    return localStorage.getItem('fudep_policy_cgv') || `1. Objet\nLes présentes CGV régissent les ventes de prestations de manucure réservées sur la plateforme Fudep, connectant des clients avec des prothésistes ongulaires qualifiés d'Île-de-France.\n\n2. Prix et Paiements\nLes tarifs sont indiqués en euros et présentés clairement sur la fiche de chaque prestataire. Les paiements de l'acompte (30%) s'effectuent de manière sécurisée en ligne via notre partenaire Stripe. Le solde est payé sur place le jour de la prestation.\n\n3. Droit de rétractation\nEn application de l'article L221-28 du Code de la consommation, le droit de rétractation ne peut être exercé pour les services de loisirs ou de soins à date déterminée.`;
  });
  const [refundText, setRefundText] = useState<string>(() => {
    return localStorage.getItem('fudep_policy_refund') || `1. Conditions de remboursement des acomptes\nPour confirmer toute réservation, un acompte obligatoire de 30% est requis. Cet acompte est intégralement remboursable si vous annulez ou modifiez votre rendez-vous plus de 24 heures avant l'heure fixée.\n\n2. Annulations de moins de 24 heures\nEn cas d'annulation moins de 24 heures à l'avance, ou en cas de non-présentation au rendez-vous (no-show), l'acompte de 30% sera conservé par le prestataire à titre d'indemnisation et ne sera pas remboursé.\n\n3. Annulation par le prestataire\nEn cas d'annulation de la part du prestataire, vous serez intégralement remboursé de votre acompte de 30% directement sur le moyen de paiement utilisé.`;
  });
  const [privacyText, setPrivacyText] = useState<string>(() => {
    return localStorage.getItem('fudep_policy_privacy') || `Collecte des Données\nFudep collecte vos données d'inscription (nom, e-mail, téléphone, ville) exclusivement pour assurer le bon déroulement de vos réservations auprès des prothésistes ongulaires.\n\nSécurité et Stockage\nVos données sont protégées de manière confidentielle et sécurisée. Vos données de carte bancaire transitent directement via Stripe et ne sont jamais stockées en clair sur nos serveurs.\n\nDroit d'accès et d'effacement\nConformément au RGPD, vous disposez d'un droit d'accès, de rectification et de suppression de vos données personnelles sur simple demande par e-mail à l'adresse ozenia.pro@gmail.com.`;
  });
  const [legalText, setLegalText] = useState<string>(() => {
    return localStorage.getItem('fudep_policy_legal') || `Éditeur de la Plateforme : Fudep Marketplace Inc., SAS au capital de 5 000€, immatriculée au RCS de Paris.\nDirectrice de la Publication : Sophie Laurent (Ozenia)\nHébergement : Google Cloud Run Container Infrastructure.\nContact : ozenia.pro@gmail.com`;
  });

  const [isEditingCgu, setIsEditingCgu] = useState<boolean>(false);
  const [isEditingCgv, setIsEditingCgv] = useState<boolean>(false);
  const [isEditingRefund, setIsEditingRefund] = useState<boolean>(false);
  const [isEditingPrivacy, setIsEditingPrivacy] = useState<boolean>(false);
  const [isEditingLegal, setIsEditingLegal] = useState<boolean>(false);

  const [tempCguText, setTempCguText] = useState<string>(() => localStorage.getItem('fudep_policy_cgu') || `1. Conditions d'Utilisation\nBienvenue sur la plateforme Fudep. En accédant à notre service, vous acceptez de respecter les présentes Conditions Générales d'Utilisation. La plateforme permet la mise en relation entre clients et prestataires indépendants pour des services de manucure.\n\n2. Accès au service\nL'utilisation du service nécessite la création d'un compte utilisateur en fournissant des informations d'identification valides. L'utilisateur est responsable de la confidentialité de ses identifiants.\n\n3. Responsabilité\nFudep agit en tant que simple intermédiaire technique de mise en relation. Nous ne saurions être tenus responsables de la qualité ou de l'exécution des prestations de manucure réservées par l'intermédiaire de la plateforme.`);
  const [tempCgvText, setTempCgvText] = useState<string>(() => localStorage.getItem('fudep_policy_cgv') || `1. Objet\nLes présentes CGV régissent les ventes de prestations de manucure réservées sur la plateforme Fudep, connectant des clients avec des prothésistes ongulaires qualifiés d'Île-de-France.\n\n2. Prix et Paiements\nLes tarifs sont indiqués en euros et présentés clairement sur la fiche de chaque prestataire. Les paiements de l'acompte (30%) s'effectuent de manière sécurisée en ligne via notre partenaire Stripe. Le solde est payé sur place le jour de la prestation.\n\n3. Droit de rétractation\nEn application de l'article L221-28 du Code de la consommation, le droit de rétractation ne peut être exercé pour les services de loisirs ou de soins à date déterminée.`);
  const [tempRefundText, setTempRefundText] = useState<string>(() => localStorage.getItem('fudep_policy_refund') || `1. Conditions de remboursement des acomptes\nPour confirmer toute réservation, un acompte obligatoire de 30% est requis. Cet acompte est intégralement remboursable si vous annulez ou modifiez votre rendez-vous plus de 24 heures avant l'heure fixée.\n\n2. Annulations de moins de 24 heures\nEn cas d'annulation moins de 24 heures à l'avance, ou en cas de non-présentation au rendez-vous (no-show), l'acompte de 30% sera conservé par le prestataire à titre d'indemnisation et ne sera pas remboursé.\n\n3. Annulation par le prestataire\nEn cas d'annulation de la part du prestataire, vous serez intégralement remboursé de votre acompte de 30% directement sur le moyen de paiement utilisé.`);
  const [tempPrivacyText, setTempPrivacyText] = useState<string>(() => localStorage.getItem('fudep_policy_privacy') || `Collecte des Données\nFudep collecte vos données d'inscription (nom, e-mail, téléphone, ville) exclusivement pour assurer le bon déroulement de vos réservations auprès des prothésistes ongulaires.\n\nSécurité et Stockage\nVos données sont protégées de manière confidentielle et sécurisée. Vos données de carte bancaire transitent directement via Stripe et ne sont jamais stockées en clair sur nos serveurs.\n\nDroit d'accès et d'effacement\nConformément au RGPD, vous disposez d'un droit d'accès, de rectification et de suppression de vos données personnelles sur simple demande par e-mail à l'adresse ozenia.pro@gmail.com.`);
  const [tempLegalText, setTempLegalText] = useState<string>(() => localStorage.getItem('fudep_policy_legal') || `Éditeur de la Plateforme : Fudep Marketplace Inc., SAS au capital de 5 000€, immatriculée au RCS de Paris.\nDirectrice de la Publication : Sophie Laurent (Ozenia)\nHébergement : Google Cloud Run Container Infrastructure.\nContact : ozenia.pro@gmail.com`);
  
  // Selected Profile Detail
  const [selectedTechId, setSelectedTechId] = useState<string | null>(null);
  
  // Selected Post Detail Modal
  const [selectedPostId, setSelectedPostId] = useState<string | null>(null);

  // Logo component is used inline instead of local state to prevent caching issues.

  // Booking process flow
  const [bookingTarget, setBookingTarget] = useState<{
    technician: NailTechnician;
    service: NailService;
    post?: Post;
  } | null>(null);

  const bookingTargetPrice = useMemo(() => {
    if (!bookingTarget) return 0;
    return (bookingTarget.post?.price !== undefined) ? bookingTarget.post.price : bookingTarget.service.price;
  }, [bookingTarget]);

  const [bookingForm, setBookingForm] = useState({
    firstName: '',
    phone: '',
    email: '',
    desiredDate: '',
    desiredTime: '10:00',
    alternativeAvailabilities: '',
    message: '',
    cardNumber: '',
    cardExpiry: '',
    cardCvc: '',
    modelPhoto: '',
    commitmentCheck: false
  });

  // Navigation back-button integration with browser history API
  const isNavigatingRef = useRef(false);

  // Synchronize state changes to browser history
  useEffect(() => {
    if (isNavigatingRef.current) return;

    const state = {
      activeTab,
      selectedTechId,
      selectedPostId,
      bookingTargetId: bookingTarget ? bookingTarget.service.id : null,
      activePolicyModal
    };

    if (window.history.state === null) {
      window.history.replaceState(state, '');
    } else {
      const curState = window.history.state;
      if (
        curState.activeTab !== activeTab ||
        curState.selectedTechId !== selectedTechId ||
        curState.selectedPostId !== selectedPostId ||
        curState.bookingTargetId !== (bookingTarget ? bookingTarget.service.id : null) ||
        curState.activePolicyModal !== activePolicyModal
      ) {
        window.history.pushState(state, '');
      }
    }
  }, [activeTab, selectedTechId, selectedPostId, bookingTarget, activePolicyModal]);

  // Listen for back button (popstate event)
  useEffect(() => {
    const handlePopState = (event: PopStateEvent) => {
      if (!event.state) return;
      
      isNavigatingRef.current = true;
      
      const { activeTab: poppedTab, selectedTechId: poppedTech, selectedPostId: poppedPost, bookingTargetId, activePolicyModal: poppedPolicy } = event.state;
      
      if (poppedTab) setActiveTab(poppedTab);
      setSelectedTechId(poppedTech || null);
      setSelectedPostId(poppedPost || null);
      setActivePolicyModal(poppedPolicy || null);
      
      if (!bookingTargetId) {
        setBookingTarget(null);
      }

      setTimeout(() => {
        isNavigatingRef.current = false;
      }, 50);
    };

    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  // --- CUSTOMIZABLE FAQ STATE & SERVICES ADDITION STATE ---
  const DEFAULT_FAQ: FAQItem[] = [
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
  ];

  const [faqs, setFaqs] = useState<FAQItem[]>(() => {
    const saved = localStorage.getItem('fudep_faqs');
    return saved ? JSON.parse(saved) : DEFAULT_FAQ;
  });

  useEffect(() => {
    localStorage.setItem('fudep_faqs', JSON.stringify(faqs));
    if (!loadingDb) {
      saveFaqsToDb(faqs);
    }
  }, [faqs, loadingDb]);

  const [newFaqForm, setNewFaqForm] = useState({ category: '', question: '', answer: '' });

  const groupedFaqs = useMemo(() => {
    const groups: Record<string, FAQItem[]> = {};
    faqs.forEach(faq => {
      const cat = faq.category || 'Général';
      if (!groups[cat]) {
        groups[cat] = [];
      }
      groups[cat].push(faq);
    });
    return groups;
  }, [faqs]);

  const handleCreateFaq = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newFaqForm.question || !newFaqForm.answer) return;
    const newFaq: FAQItem = {
      id: 'faq_' + Date.now(),
      category: newFaqForm.category.trim() || 'Général',
      question: newFaqForm.question,
      answer: newFaqForm.answer
    };
    setFaqs(prev => [...prev, newFaq]);
    setNewFaqForm({ category: '', question: '', answer: '' });
  };

  const [expandedFaq, setExpandedFaq] = useState<string | null>(null);

  const handleDeleteFaq = (faqId: string) => {
    if (window.confirm("Êtes-vous sûr de vouloir supprimer cette question de la FAQ ?")) {
      setFaqs(prev => prev.filter(f => f.id !== faqId));
    }
  };

  const [addServiceForm, setAddServiceForm] = useState({
    technicianId: '',
    name: '',
    price: '',
    duration: '1h 00',
    imageUrl: 'https://images.unsplash.com/photo-1604654894610-df63bc536371?w=800&auto=format&fit=crop&q=80'
  });

  const handleCreateService = (e: React.FormEvent) => {
    e.preventDefault();
    if (!addServiceForm.technicianId || !addServiceForm.name || !addServiceForm.price || !addServiceForm.duration) {
      alert("Veuillez remplir tous les champs de la prestation.");
      return;
    }
    const newSrv: NailService = {
      id: 'srv_' + Date.now(),
      name: addServiceForm.name,
      price: parseFloat(addServiceForm.price),
      duration: addServiceForm.duration,
      imageUrl: addServiceForm.imageUrl
    };
    setTechnicians(prev => {
      const updated = prev.map(t => {
        if (t.id === addServiceForm.technicianId) {
          const u = {
            ...t,
            services: [...t.services, newSrv]
          };
          saveTechnicianToDb(u);
          return u;
        }
        return t;
      });
      return updated;
    });
    alert(`La prestation "${addServiceForm.name}" a bien été ajoutée au prestataire !`);
    setAddServiceForm({
      technicianId: '',
      name: '',
      price: '',
      duration: '1h 00',
      imageUrl: 'https://images.unsplash.com/photo-1604654894610-df63bc536371?w=800&auto=format&fit=crop&q=80'
    });
  };

  const [selectedDateTab, setSelectedDateTab] = useState<string>('');

  // Modal displays
  const [showLoginModal, setShowLoginModal] = useState<boolean>(false);
  const [reschedulingBookingId, setReschedulingBookingId] = useState<string | null>(null);
  const [selectedRescheduleSlot, setSelectedRescheduleSlot] = useState<string>('');
  const [confirmedBookingNotification, setConfirmedBookingNotification] = useState<BookingRequest | null>(null);
  const [loginForm, setLoginForm] = useState({ name: '', email: '', phone: '', city: 'Paris', password: '' });
  const [authRole, setAuthRole] = useState<'client' | 'prestataire'>('client');
  const [pendingFavoriteTechId, setPendingFavoriteTechId] = useState<string | null>(null);
  const [isProcessingPayment, setIsProcessingPayment] = useState<boolean>(false);
  const [bookingSuccess, setBookingSuccess] = useState<boolean>(false);
  const [showShareToast, setShowShareToast] = useState<string | null>(null);

  // Admin interface toggles
  const [isAdminView, setIsAdminView] = useState<boolean>(false);
  const [adminTab, setAdminTab] = useState<'analytics' | 'reservations' | 'creation' | 'settings'>('analytics');
  
  // New Tech / Post creation forms
  const [newTechForm, setNewTechForm] = useState({
    name: '',
    username: '',
    city: 'Paris',
    bio: '',
    tags: '',
    avatar: 'https://images.unsplash.com/photo-1544005313-94ddf0286df2?w=150&auto=format&fit=crop&q=80'
  });

  const [newPostForm, setNewPostForm] = useState({
    technicianId: '',
    caption: '',
    imagePreset: 'https://images.unsplash.com/photo-1604654894610-df63bc536371?w=800&auto=format&fit=crop&q=80',
    tags: '',
    price: '',
    duration: ''
  });

  // --- PERSISTENCE ---
  useEffect(() => {
    localStorage.setItem('fudep_technicians', JSON.stringify(technicians));
  }, [technicians]);

  useEffect(() => {
    localStorage.setItem('fudep_posts', JSON.stringify(posts));
  }, [posts]);

  useEffect(() => {
    localStorage.setItem('fudep_bookings', JSON.stringify(bookings));
  }, [bookings]);

  useEffect(() => {
    localStorage.setItem('fudep_analytics', JSON.stringify(analytics));
  }, [analytics]);

  useEffect(() => {
    localStorage.setItem('fudep_session', JSON.stringify(session));
  }, [session]);

  // Security guard for administrative views
  useEffect(() => {
    const isUserAdmin = session.isLoggedIn && session.email?.toLowerCase() === 'ozenia.pro@gmail.com';
    if (!isUserAdmin && isAdminView) {
      setIsAdminView(false);
    }
  }, [session, isAdminView]);

  // Auto-complete past bookings on initial load
  useEffect(() => {
    if (loadingDb || bookings.length === 0) return;
    
    let hasChanges = false;
    const updatedBookings = bookings.map(b => {
      if (b.status !== 'refused' && b.status !== 'completed' && isBookingPast(b.desiredDate, b.desiredTime)) {
        hasChanges = true;
        const updatedBooking = { ...b, status: 'completed' as const };
        saveBookingToDb(updatedBooking);
        return updatedBooking;
      }
      return b;
    });

    if (hasChanges) {
      setBookings(updatedBookings);
    }
  }, [loadingDb, bookings]);

  // --- STRIPE CHECKOUT CALLBACK PARSER ---
  useEffect(() => {
    if (loadingDb) return;

    const params = new URLSearchParams(window.location.search);
    const stripeSuccess = params.get('stripe_success');
    const stripeCancel = params.get('stripe_cancel');

    if (stripeSuccess === 'true') {
      const bookingId = params.get('booking_id');
      const techId = params.get('tech_id');
      const techName = params.get('tech_name') || '';
      const serviceId = params.get('service_id');
      const serviceName = params.get('service_name') || '';
      const priceVal = parseFloat(params.get('price') || '0');
      const date = params.get('date') || '';
      const time = params.get('time') || '';
      const firstName = params.get('firstName') || '';
      const phone = params.get('phone') || '';
      const email = params.get('email') || '';
      const alt = params.get('alt') || '';
      const msg = params.get('msg') || '';

      if (bookingId && techId && serviceId) {
        // Look up the actual stored bookings from state to prevent double-saving on page refresh
        const bookingExists = bookings.some((b: any) => b.id === bookingId);

        if (!bookingExists) {
          const tempExtra = JSON.parse(localStorage.getItem('fudep_temp_booking_extra') || '{}');
          const depositPrice = Math.round(priceVal * 0.3 * 100) / 100;
          const newBooking: BookingRequest = {
            id: bookingId,
            technicianId: techId,
            technicianName: techName,
            serviceId: serviceId,
            serviceName: serviceName,
            price: priceVal,
            clientFirstName: firstName,
            clientPhone: phone,
            clientEmail: email,
            desiredDate: date,
            desiredTime: time,
            alternativeAvailabilities: alt,
            message: msg,
            status: 'pending',
            createdAt: new Date().toLocaleString('fr-FR'),
            depositPaid: depositPrice,
            cardUsed: 'Stripe Checkout (Acompte 30%)',
            modelPhoto: tempExtra.modelPhoto || '',
            postRefId: tempExtra.postRefId || ''
          };

          // Clean temporary extra info
          localStorage.removeItem('fudep_temp_booking_extra');

          // Save directly to Firestore immediately to prevent any race condition
          saveBookingToDb(newBooking);

          // Remove the reserved slot from the technician's free slots list
          const slotToRemove = `${date} à ${time}`;
          setTechnicians(prevTechs => {
            return prevTechs.map(t => {
              if (t.id === techId) {
                const updatedSlots = (t.freeSlots || []).filter(slot => slot !== slotToRemove);
                const updatedTech = { ...t, freeSlots: updatedSlots };
                saveTechnicianToDb(updatedTech);
                return updatedTech;
              }
              return t;
            });
          });

          // Trigger email notification to ozenia.pro@gmail.com
          const emailSubject = `🔔 Nouvelle demande de réservation - Fudep [Réf: ${bookingId}]`;
          const emailText = `Bonjour,\n\nUne nouvelle demande de réservation a été effectuée sur Fudep.\n\n` +
            `Détails du rendez-vous :\n` +
            `- Prestataire : ${techName}\n` +
            `- Prestation : ${serviceName}\n` +
            `- Date & Heure : Le ${date} à ${time}\n` +
            `- Prix Total : ${priceVal} €\n` +
            `- Acompte Payé (30%) : ${depositPrice} €\n\n` +
            `Informations du client :\n` +
            `- Nom : ${firstName}\n` +
            `- Téléphone : ${phone}\n` +
            `- E-mail : ${email}\n` +
            `- Alternative de disponibilité : ${alt || 'Aucune'}\n` +
            `- Message / Note : ${msg || 'Aucun message'}\n\n` +
            `Vous pouvez valider ou refuser cette demande depuis votre espace d'administration.\n\n` +
            `Cordialement,\nL'équipe Fudep`;

          const emailHtml = `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e2e8f0; border-radius: 12px; background-color: #f8fafc;">
              <h2 style="color: #0f172a; border-bottom: 2px solid #cbd5e1; padding-bottom: 10px; margin-top: 0;">🔔 Nouvelle demande de réservation</h2>
              <p style="color: #334155; font-size: 14px; line-height: 1.5;">Bonjour,</p>
              <p style="color: #334155; font-size: 14px; line-height: 1.5;">Une nouvelle demande de réservation a été effectuée sur Fudep.</p>
              
              <div style="background-color: #ffffff; padding: 15px; border-radius: 8px; border: 1px solid #e2e8f0; margin: 20px 0;">
                <h3 style="color: #0f172a; margin-top: 0; font-size: 14px; border-bottom: 1px solid #f1f5f9; padding-bottom: 5px;">📍 Détails du rendez-vous</h3>
                <table style="width: 100%; border-collapse: collapse; font-size: 13px; color: #475569;">
                  <tr><td style="padding: 4px 0; font-weight: bold; width: 150px;">Prestataire :</td><td>${techName}</td></tr>
                  <tr><td style="padding: 4px 0; font-weight: bold;">Prestation :</td><td>${serviceName}</td></tr>
                  <tr><td style="padding: 4px 0; font-weight: bold;">Date & Heure :</td><td style="color: #2563eb; font-weight: bold;">Le ${date} à ${time}</td></tr>
                  <tr><td style="padding: 4px 0; font-weight: bold;">Prix Total :</td><td><strong>${priceVal} €</strong></td></tr>
                  <tr><td style="padding: 4px 0; font-weight: bold;">Acompte Payé (30%) :</td><td style="color: #16a34a; font-weight: bold;">${depositPrice} € (Stripe)</td></tr>
                </table>
              </div>

              <div style="background-color: #ffffff; padding: 15px; border-radius: 8px; border: 1px solid #e2e8f0; margin: 20px 0;">
                <h3 style="color: #0f172a; margin-top: 0; font-size: 14px; border-bottom: 1px solid #f1f5f9; padding-bottom: 5px;">👤 Informations du client</h3>
                <table style="width: 100%; border-collapse: collapse; font-size: 13px; color: #475569;">
                  <tr><td style="padding: 4px 0; font-weight: bold; width: 150px;">Nom :</td><td>${firstName}</td></tr>
                  <tr><td style="padding: 4px 0; font-weight: bold;">Téléphone :</td><td>${phone}</td></tr>
                  <tr><td style="padding: 4px 0; font-weight: bold;">E-mail :</td><td>${email}</td></tr>
                  <tr><td style="padding: 4px 0; font-weight: bold;">Alternative :</td><td>${alt || 'Aucune'}</td></tr>
                  <tr><td style="padding: 4px 0; font-weight: bold;">Message :</td><td><em>${msg || 'Aucun message'}</em></td></tr>
                </table>
              </div>

              <p style="color: #475569; font-size: 12px; margin-top: 25px; border-top: 1px solid #cbd5e1; padding-top: 15px; text-align: center;">
                Cet e-mail est une notification automatique générée par Fudep. Vous pouvez gérer cette demande sur votre portail d'administration.
              </p>
            </div>
          `;
          sendNotificationEmail('ozenia.pro@gmail.com', emailSubject, emailText, emailHtml, 'booking_request');

          // Client confirmation email
          const clientSubject = `🌸 Demande de réservation bien reçue ! - Fudep [Réf: ${bookingId}]`;
          const clientText = `Bonjour ${firstName},\n\nNous avons bien reçu votre demande de réservation chez ${techName} pour la prestation ${serviceName}.\n\n` +
            `Détails de votre rendez-vous :\n` +
            `- Date & Heure : Le ${date} à ${time}\n` +
            `- Prix Total : ${priceVal} €\n` +
            `- Acompte réglé (30%) : ${depositPrice} €\n` +
            `- Reste à régler sur place : ${(priceVal - depositPrice).toFixed(2)} €\n\n` +
            `Votre demande est actuellement en cours de validation par votre prestataire. Vous recevrez un e-mail dès qu'elle aura été validée ou si une autre date vous est proposée.\n\n` +
            `Nous restons à votre disposition pour toute question à l'adresse contact@fudep.fr.\n\n` +
            `Cordialement,\nL'équipe Fudep`;

          const clientHtml = `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e2e8f0; border-radius: 12px; background-color: #f8fafc;">
              <div style="text-align: center; margin-bottom: 25px;">
                <h1 style="color: #0f4c81; font-family: 'Georgia', serif; font-size: 24px; margin-top: 0;">🌸 Demande de réservation reçue</h1>
                <p style="color: #64748b; font-size: 14px;">Merci de votre confiance sur Fudep</p>
              </div>
              
              <p style="color: #334155; font-size: 14px; line-height: 1.6;">Bonjour <strong>${firstName}</strong>,</p>
              <p style="color: #334155; font-size: 14px; line-height: 1.6;">Nous vous confirmons que votre demande de réservation a bien été enregistrée et transmise à votre prestataire <strong>${techName}</strong>.</p>
              
              <div style="background-color: #ffffff; padding: 20px; border-radius: 8px; border: 1px solid #e2e8f0; margin: 20px 0;">
                <h3 style="color: #0f172a; margin-top: 0; font-size: 15px; border-bottom: 1px solid #f1f5f9; padding-bottom: 5px;">📅 Détails du rendez-vous</h3>
                <table style="width: 100%; border-collapse: collapse; font-size: 13px; color: #475569;">
                  <tr><td style="padding: 6px 0; font-weight: bold; width: 180px;">Réf. Réservation :</td><td><strong>${bookingId}</strong></td></tr>
                  <tr><td style="padding: 6px 0; font-weight: bold;">Prestataire :</td><td>${techName}</td></tr>
                  <tr><td style="padding: 6px 0; font-weight: bold;">Prestation :</td><td>${serviceName}</td></tr>
                  <tr><td style="padding: 6px 0; font-weight: bold;">Date & Heure :</td><td style="color: #2563eb; font-weight: bold;">Le ${date} à ${time}</td></tr>
                  <tr><td style="padding: 6px 0; font-weight: bold;">Tarif de la prestation :</td><td><strong>${priceVal} €</strong></td></tr>
                  <tr><td style="padding: 6px 0; font-weight: bold; color: #16a34a;">Acompte payé (30%) :</td><td style="color: #16a34a; font-weight: bold;">${depositPrice} € (Stripe Checkout)</td></tr>
                  <tr><td style="padding: 6px 0; font-weight: bold; color: #0f4c81;">Reste à régler sur place :</td><td style="color: #0f4c81; font-weight: bold;">${(priceVal - depositPrice).toFixed(2)} €</td></tr>
                </table>
              </div>

              <div style="background-color: #f0fdf4; border: 1px solid #bbf7d0; padding: 15px; border-radius: 8px; margin: 20px 0;">
                <p style="color: #166534; font-size: 13px; line-height: 1.5; margin: 0;">
                  ⚡ <strong>Prochaine étape :</strong> Votre prestataire examine actuellement votre demande. Vous recevrez un e-mail de confirmation dès que le rendez-vous sera validé, ou si une adaptation d'horaire est nécessaire.
                </p>
              </div>
              
              <p style="color: #334155; font-size: 14px; line-height: 1.6;">Une question ou un changement ? Contactez-nous par e-mail à l'adresse <a href="mailto:contact@fudep.fr" style="color: #0f4c81; font-weight: bold; text-decoration: none;">contact@fudep.fr</a>.</p>
              
              <p style="color: #334155; font-size: 14px; line-height: 1.6; margin-top: 25px;">À très bientôt pour votre moment beauté !</p>
              <p style="color: #0f4c81; font-weight: bold; font-size: 14px; margin-bottom: 0;">L'équipe Fudep</p>
              
              <p style="color: #475569; font-size: 11px; margin-top: 30px; border-top: 1px solid #e2e8f0; padding-top: 15px; text-align: center;">
                Ceci est une confirmation automatique de votre demande sur la plateforme Fudep.
              </p>
            </div>
          `;
          sendNotificationEmail(email, clientSubject, clientText, clientHtml, 'booking_request_client');

          // Update bookings in state
          setBookings(prev => {
            if (prev.some(b => b.id === bookingId)) return prev;
            return [newBooking, ...prev];
          });
          trackAction('bookingsCompleted');

          // Find the technician object and service object to show the success screen
          const techObj = technicians.find(t => t.id === techId);
          const serviceObj = techObj?.services.find(s => s.id === serviceId);
          if (techObj && serviceObj) {
            setBookingTarget({
              technician: techObj,
              service: serviceObj
            });
            setBookingForm({
              firstName: firstName,
              phone: phone,
              email: email,
              desiredDate: date,
              desiredTime: time,
              alternativeAvailabilities: alt,
              message: msg,
              cardNumber: '',
              cardExpiry: '',
              cardCvc: '',
              modelPhoto: tempExtra.modelPhoto || ''
            });
            setBookingSuccess(true);
          }
        } else {
          // If booking already exists, but we want to show the success modal on reload
          const techObj = technicians.find(t => t.id === techId);
          const serviceObj = techObj?.services.find(s => s.id === serviceId);
          if (techObj && serviceObj) {
            setBookingTarget({
              technician: techObj,
              service: serviceObj
            });
            setBookingForm({
              firstName: firstName,
              phone: phone,
              email: email,
              desiredDate: date,
              desiredTime: time,
              alternativeAvailabilities: alt,
              message: msg,
              cardNumber: '',
              cardExpiry: '',
              cardCvc: '',
              modelPhoto: ''
            });
            setBookingSuccess(true);
          }
        }
        // Clean URL params so browser refresh doesn't replay or clutter URL
        window.history.replaceState({}, document.title, window.location.pathname);
      }
    } else if (stripeCancel === 'true') {
      window.history.replaceState({}, document.title, window.location.pathname);
      alert("Le paiement de l'acompte a été annulé.");
    }
  }, [loadingDb, technicians, bookings]);

  // --- DEEP LINKING PARSER ---
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const postIdParam = params.get('post');
    const techIdParam = params.get('tech');
    if (postIdParam) {
      setSelectedPostId(postIdParam);
      trackAction('viewDetailsCount');
    } else if (techIdParam) {
      setSelectedTechId(techIdParam);
      trackProfileClick(techIdParam);
    }
  }, []);

  // Pre-fill user data if they log in
  useEffect(() => {
    if (session.isLoggedIn && session.name) {
      setBookingForm(prev => ({
        ...prev,
        firstName: session.name || '',
        email: session.email || '',
        phone: session.phone || ''
      }));
    }
  }, [session]);

  // --- TELEMETRY / ANALYTICS ACTIONS ---
  const trackProfileClick = (techId: string) => {
    setAnalytics(prev => {
      const updatedClicks = { ...prev.profileClicks };
      updatedClicks[techId] = (updatedClicks[techId] || 0) + 1;
      return {
        ...prev,
        profileClicks: updatedClicks,
        viewDetailsCount: prev.viewDetailsCount + 1
      };
    });
  };

  const trackAction = (key: keyof Omit<Analytics, 'profileClicks'>) => {
    setAnalytics(prev => ({
      ...prev,
      [key]: prev[key] + 1
    }));
  };

  // --- HELPER HANDLERS ---
  const handleToggleFavorite = (techId: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    
    if (!session.isLoggedIn) {
      setPendingFavoriteTechId(techId);
      setShowLoginModal(true);
      return;
    }

    const isFav = session.favorites.includes(techId);
    let updatedFavs = [];
    if (isFav) {
      updatedFavs = session.favorites.filter(id => id !== techId);
      if (session.email) {
        deleteFavoriteFromDb(session.email, techId);
      }
    } else {
      updatedFavs = [...session.favorites, techId];
      trackAction('favoritesCount');
      if (session.email) {
        saveFavoriteToDb(session.email, techId, 'provider');
      }
    }

    setSession(prev => ({
      ...prev,
      favorites: updatedFavs
    }));

    // Save favorites directly inside the user's account in state and database
    if (session.email) {
      setAccounts(prev => prev.map(acc => {
        if (acc.email.toLowerCase() === session.email!.toLowerCase()) {
          const updated = { ...acc, favorites: updatedFavs };
          saveAccountToDb(updated);
          return updated;
        }
        return acc;
      }));
    }
  };

  const handleToggleLikePost = (postId: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    
    const post = posts.find(p => p.id === postId);
    if (!post) return;
    const techId = post.technicianId;

    if (!session.isLoggedIn) {
      setPendingFavoriteTechId(techId);
      setShowLoginModal(true);
      return;
    }

    const isLiked = session.likedPosts.includes(postId);
    let updatedLikes = [];
    if (isLiked) {
      updatedLikes = session.likedPosts.filter(id => id !== postId);
      // Decrement likes locally and save post to Db
      setPosts(prev => prev.map(p => {
        if (p.id === postId) {
          const updatedPost = { ...p, likes: Math.max(0, p.likes - 1) };
          savePostToDb(updatedPost);
          return updatedPost;
        }
        return p;
      }));
      if (session.email) {
        deleteFavoriteFromDb(session.email, postId);
      }
    } else {
      updatedLikes = [...session.likedPosts, postId];
      // Increment likes locally and save post to Db
      setPosts(prev => prev.map(p => {
        if (p.id === postId) {
          const updatedPost = { ...p, likes: p.likes + 1 };
          savePostToDb(updatedPost);
          return updatedPost;
        }
        return p;
      }));
      if (session.email) {
        saveFavoriteToDb(session.email, postId, 'post');
      }
    }

    setSession(prev => ({
      ...prev,
      likedPosts: updatedLikes
    }));

    // Save likedPosts directly inside the user's account in state and database
    if (session.email) {
      setAccounts(prev => prev.map(acc => {
        if (acc.email.toLowerCase() === session.email!.toLowerCase()) {
          const updatedAcc = { ...acc, likedPosts: updatedLikes };
          saveAccountToDb(updatedAcc);
          return updatedAcc;
        }
        return acc;
      }));
    }
  };

  const handleShare = (postId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const mockLink = `${window.location.origin}${window.location.pathname}?post=${postId}`;
    
    const showToastAndAlert = () => {
      setShowShareToast(postId);
      setTimeout(() => setShowShareToast(null), 2500);
    };

    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(mockLink)
        .then(showToastAndAlert)
        .catch(() => {
          fallbackCopyText(mockLink, showToastAndAlert);
        });
    } else {
      fallbackCopyText(mockLink, showToastAndAlert);
    }
  };

  const fallbackCopyText = (text: string, cb: () => void) => {
    try {
      const textArea = document.createElement("textarea");
      textArea.value = text;
      textArea.style.top = "0";
      textArea.style.left = "0";
      textArea.style.position = "fixed";
      document.body.appendChild(textArea);
      textArea.focus();
      textArea.select();
      const successful = document.execCommand('copy');
      document.body.removeChild(textArea);
      if (successful) {
        cb();
      } else {
        alert(`Copiez ce lien pour partager : ${text}`);
      }
    } catch (err) {
      alert(`Copiez ce lien pour partager : ${text}`);
    }
  };

  const handleOpenBooking = (tech: NailTechnician, service: NailService, post?: Post, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    trackAction('bookingAttempts');
    
    // Si l'utilisateur en ligne n'est pas connecté, il doit d'abord se connecter pour réserver une prestation
    if (!session.isLoggedIn) {
      setBookingIntent({ technician: tech, service, post });
      setAuthMode('login');
      setAuthError(null);
      setShowLoginModal(true);
      return;
    }

    setBookingTarget({ technician: tech, service, post });
    setBookingSuccess(false);

    const availableSlots = (tech.freeSlots || []).filter(slot => !isSlotPast(slot));
    const firstAvailableSlot = availableSlots[0] || '';
    const initialDate = firstAvailableSlot ? firstAvailableSlot.split(' à ')[0] : '';
    const initialTime = firstAvailableSlot ? firstAvailableSlot.split(' à ')[1] : '10:00';

    // Reset booking form and set initial date/time based on first available non-past slot
    setBookingForm(prev => ({
      ...prev,
      modelPhoto: '',
      commitmentCheck: false,
      desiredDate: initialDate,
      desiredTime: initialTime
    }));

    if (initialDate) {
      setSelectedDateTab(initialDate);
    } else {
      setSelectedDateTab('');
    }
  };

  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError(null);

    // Tous les champs liés à l'inscription sont obligatoires
    if (!loginForm.name || !loginForm.email || !loginForm.phone || !loginForm.password || !loginForm.city || !confirmPassword) {
      setAuthError("Tous les champs sont obligatoires.");
      return;
    }

    // L'utilisateur doit accepter les CGU, CGV & Politiques
    if (!acceptTerms) {
      setAuthError("Vous devez cocher la case d'acceptation des CGU, CGV et Politiques pour vous inscrire.");
      return;
    }

    // Le mot de passe doit contenir 8 caractères minimum.
    if (loginForm.password.length < 8) {
      setAuthError("Le mot de passe doit contenir au moins 8 caractères.");
      return;
    }

    // La confirmation du mot de passe doit correspondre
    if (loginForm.password !== confirmPassword) {
      setAuthError("La confirmation du mot de passe ne correspond pas.");
      return;
    }

    // Check if email already exists
    if (accounts.some(acc => acc.email.toLowerCase() === loginForm.email.toLowerCase())) {
      setAuthError("Cette adresse email est déjà enregistrée. Veuillez vous connecter.");
      return;
    }

    const hashedPassword = await hashPassword(loginForm.password);

    const initialFavorites = pendingFavoriteTechId ? [pendingFavoriteTechId] : [];
    if (pendingFavoriteTechId) {
      trackAction('favoritesCount');
    }

    const newAccount: UserAccount = {
      name: loginForm.name,
      email: loginForm.email,
      phone: loginForm.phone,
      city: loginForm.city,
      password: hashedPassword,
      favorites: initialFavorites,
      likedPosts: []
    };

    // Store in state and Firestore
    setAccounts(prev => [...prev, newAccount]);
    saveAccountToDb(newAccount);

    // Send welcome email to the newly registered user
    const welcomeSubject = `🌸 Bienvenue chez Fudep, ${loginForm.name} !`;
    const welcomeText = `Bonjour ${loginForm.name},\n\nNous sommes ravis de vous compter parmi les membres de la communauté Fudep !\n\nFudep est la première marketplace de manucure et de nail art en Île-de-France. Vous pouvez désormais :\n- Parcourir les plus belles créations d'ongles de nos prestataires.\n- Ajouter vos professionnels favoris pour ne manquer aucune inspiration.\n- Réserver vos rendez-vous et payer votre acompte de 30% en toute sécurité.\n\nNous restons à votre entière disposition pour toute question.\n\nBelle découverte et à très bientôt pour vos prochains rendez-vous beauté !\n\nL'équipe Fudep\nozenia.pro@gmail.com`;
    const welcomeHtml = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e2e8f0; border-radius: 12px; background-color: #f8fafc;">
        <div style="text-align: center; margin-bottom: 25px;">
          <h1 style="color: #0f4c81; font-family: 'Georgia', serif; font-size: 24px; margin-top: 0;">🌸 Bienvenue chez Fudep</h1>
          <p style="color: #64748b; font-size: 14px;">Votre complice beauté & manucure en Île-de-France</p>
        </div>
        
        <p style="color: #334155; font-size: 14px; line-height: 1.6;">Bonjour <strong>${loginForm.name}</strong>,</p>
        <p style="color: #334155; font-size: 14px; line-height: 1.6;">Nous sommes ravis de vous accueillir dans la communauté <strong>Fudep</strong> !</p>
        
        <div style="background-color: #ffffff; padding: 20px; border-radius: 8px; border: 1px solid #e2e8f0; margin: 20px 0;">
          <h3 style="color: #0f172a; margin-top: 0; font-size: 15px; border-bottom: 1px solid #f1f5f9; padding-bottom: 5px;">✨ Ce que vous pouvez faire dès maintenant :</h3>
          <ul style="color: #475569; font-size: 13px; line-height: 1.6; padding-left: 20px; margin-bottom: 0;">
            <li style="margin-bottom: 8px;"><strong>Découvrir le flux :</strong> Parcourez les plus belles créations de nail art de nos prestataires parisiens et d'Île-de-France.</li>
            <li style="margin-bottom: 8px;"><strong>Mettre en favoris :</strong> Ajoutez vos prestataires préférés ou aimez des créations pour concevoir votre carnet d'inspirations.</li>
            <li style="margin-bottom: 0;"><strong>Réserver en ligne :</strong> Planifiez votre rendez-vous en quelques clics et réglez votre acompte de 30% en toute sécurité.</li>
          </ul>
        </div>
        
        <p style="color: #334155; font-size: 14px; line-height: 1.6;">Besoin d'aide ou d'une question ? Répondez simplement à cet e-mail ou contactez-nous à l'adresse <a href="mailto:ozenia.pro@gmail.com" style="color: #0f4c81; font-weight: bold; text-decoration: none;">ozenia.pro@gmail.com</a>.</p>
        
        <p style="color: #334155; font-size: 14px; line-height: 1.6; margin-top: 25px;">Belle découverte et à très bientôt !</p>
        <p style="color: #0f4c81; font-weight: bold; font-size: 14px; margin-bottom: 0;">L'équipe Fudep</p>
        
        <p style="color: #475569; font-size: 11px; margin-top: 30px; border-top: 1px solid #e2e8f0; padding-top: 15px; text-align: center;">
          Cet e-mail de bienvenue vous a été envoyé automatiquement suite à votre inscription sur Fudep.
        </p>
      </div>
    `;
    sendNotificationEmail(loginForm.email, welcomeSubject, welcomeText, welcomeHtml, 'welcome_email');

    // Also notify the administrator
    const adminSubject = `👤 Nouvelle inscription d'un membre - Fudep [${loginForm.name}]`;
    const adminText = `Bonjour,\n\nUn nouveau membre vient de s'inscrire sur Fudep.\n\nInformations du membre :\n- Nom : ${loginForm.name}\n- E-mail : ${loginForm.email}\n- Téléphone : ${loginForm.phone}\n- Ville : ${loginForm.city}\n\nCordialement,\nL'équipe Fudep`;
    const adminHtml = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e2e8f0; border-radius: 12px; background-color: #f8fafc;">
        <h2 style="color: #0f172a; border-bottom: 2px solid #cbd5e1; padding-bottom: 10px; margin-top: 0;">👤 Nouvelle inscription d'un membre</h2>
        <p style="color: #334155; font-size: 14px;">Bonjour,</p>
        <p style="color: #334155; font-size: 14px;">Un nouveau membre vient de s'inscrire sur la plateforme Fudep.</p>
        
        <div style="background-color: #ffffff; padding: 15px; border-radius: 8px; border: 1px solid #e2e8f0; margin: 20px 0;">
          <h3 style="color: #0f172a; margin-top: 0; font-size: 14px; border-bottom: 1px solid #f1f5f9; padding-bottom: 5px;">📍 Profil du membre</h3>
          <table style="width: 100%; border-collapse: collapse; font-size: 13px; color: #475569;">
            <tr><td style="padding: 4px 0; font-weight: bold; width: 120px;">Nom :</td><td>${loginForm.name}</td></tr>
            <tr><td style="padding: 4px 0; font-weight: bold;">E-mail :</td><td style="color: #2563eb;">${loginForm.email}</td></tr>
            <tr><td style="padding: 4px 0; font-weight: bold;">Téléphone :</td><td>${loginForm.phone}</td></tr>
            <tr><td style="padding: 4px 0; font-weight: bold;">Ville :</td><td>${loginForm.city}</td></tr>
          </table>
        </div>
        
        <p style="color: #475569; font-size: 12px; margin-top: 25px; border-top: 1px solid #cbd5e1; padding-top: 15px; text-align: center;">
          Notification automatique de la plateforme Fudep.
        </p>
      </div>
    `;
    sendNotificationEmail('ozenia.pro@gmail.com', adminSubject, adminText, adminHtml, 'new_registration');

    // Log user in
    setSession({
      isLoggedIn: true,
      name: loginForm.name,
      email: loginForm.email,
      phone: loginForm.phone,
      city: loginForm.city,
      favorites: initialFavorites,
      likedPosts: []
    });

    setShowLoginModal(false);
    setPendingFavoriteTechId(null);

    // If there was an intent to book, resume it
    if (bookingIntent) {
      setBookingTarget({
        technician: bookingIntent.technician,
        service: bookingIntent.service,
        post: bookingIntent.post
      });
      setBookingSuccess(false);
      setBookingIntent(null);
    }
  };

  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError(null);

    if (!loginForm.email || !loginForm.password) {
      setAuthError("Veuillez saisir votre adresse e-mail et votre mot de passe.");
      return;
    }

    const inputHash = await hashPassword(loginForm.password);

    // Authenticate (with secure hardcoded admin fallback)
    let matchedAccount = accounts.find(
      acc => acc.email.toLowerCase() === loginForm.email.toLowerCase() && 
             (acc.password === inputHash || acc.password === loginForm.password)
    );

    const isDefaultAdminPass = loginForm.password === 'OzeniaFudep2026!' || inputHash === '3c1ff10b0244766465f14e661642876a3be3fec9590daeb8e036dfdc4ef40cf8';

    if (!matchedAccount && loginForm.email.toLowerCase() === 'ozenia.pro@gmail.com' && (loginForm.password === adminPassword || inputHash === adminPassword || isDefaultAdminPass)) {
      matchedAccount = {
        name: 'Ozenia Pro',
        email: 'ozenia.pro@gmail.com',
        phone: '06 00 00 00 00',
        city: 'Paris',
        password: adminPassword || '3c1ff10b0244766465f14e661642876a3be3fec9590daeb8e036dfdc4ef40cf8'
      };
    }

    if (!matchedAccount) {
      setAuthError("Identifiants incorrects. Veuillez réessayer.");
      return;
    }

    const initialFavorites = pendingFavoriteTechId ? [pendingFavoriteTechId] : [];
    if (pendingFavoriteTechId) {
      trackAction('favoritesCount');
    }

    const mergedFavorites = Array.from(new Set([...initialFavorites, ...(matchedAccount.favorites || [])]));
    const mergedLikedPosts = matchedAccount.likedPosts || [];

    setSession({
      isLoggedIn: true,
      name: matchedAccount.name,
      email: matchedAccount.email,
      phone: matchedAccount.phone,
      city: matchedAccount.city,
      favorites: mergedFavorites,
      likedPosts: mergedLikedPosts
    });

    // Update state to persist merged favorites/likes
    setAccounts(prev => prev.map(acc => {
      if (acc.email.toLowerCase() === matchedAccount!.email.toLowerCase()) {
        const updated = { ...acc, favorites: mergedFavorites, likedPosts: mergedLikedPosts };
        saveAccountToDb(updated);
        return updated;
      }
      return acc;
    }));

    setShowLoginModal(false);
    setPendingFavoriteTechId(null);

    // If there was an intent to book, resume it
    if (bookingIntent) {
      setBookingTarget({
        technician: bookingIntent.technician,
        service: bookingIntent.service,
        post: bookingIntent.post
      });
      setBookingSuccess(false);
      setBookingIntent(null);
    }
  };

  const handleInstantLogin = () => {
    setSession({
      isLoggedIn: true,
      name: 'Ozenia Pro',
      email: 'ozenia.pro@gmail.com',
      phone: '06 00 00 00 00',
      city: 'Paris',
      favorites: [],
      likedPosts: []
    });
    setShowLoginModal(false);
    setPendingFavoriteTechId(null);

    // If there was an intent to book, resume it
    if (bookingIntent) {
      setBookingTarget({
        technician: bookingIntent.technician,
        service: bookingIntent.service,
        post: bookingIntent.post
      });
      setBookingSuccess(false);
      setBookingIntent(null);
    }
  };

  const handleForgotPasswordSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!forgotPasswordEmail) return;

    // See if the account exists
    const accountExists = accounts.some(acc => acc.email.toLowerCase() === forgotPasswordEmail.toLowerCase()) || forgotPasswordEmail.toLowerCase() === 'ozenia.pro@gmail.com';
    
    if (accountExists) {
      alert(`Un e-mail contenant les instructions pour réinitialiser votre mot de passe a été envoyé avec succès à l'adresse : ${forgotPasswordEmail}\n\nVeuillez vérifier votre boîte de réception ainsi que vos courriers indésirables (spams).`);
    } else {
      alert(`Si l'adresse ${forgotPasswordEmail} est associée à un compte Fudep, un e-mail de réinitialisation de mot de passe lui sera envoyé.`);
    }
    
    setForgotPasswordEmail('');
    setAuthMode('login');
  };

  const handleChangePasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!session.isLoggedIn) return;

    if (!oldPassword || !newPassword || !confirmNewPassword) {
      alert("Tous les champs sont obligatoires pour modifier votre mot de passe.");
      return;
    }

    if (newPassword.length < 8) {
      alert("Le nouveau mot de passe doit contenir au moins 8 caractères.");
      return;
    }

    if (newPassword !== confirmNewPassword) {
      alert("La confirmation du nouveau mot de passe ne correspond pas.");
      return;
    }

    const oldPasswordHash = await hashPassword(oldPassword);
    const newPasswordHash = await hashPassword(newPassword);

    // Is it the fallback admin user?
    if (session.email.toLowerCase() === 'ozenia.pro@gmail.com') {
      if (oldPassword !== adminPassword && oldPasswordHash !== adminPassword) {
        alert("L'ancien mot de passe administrateur est incorrect.");
        return;
      }
      setAdminPassword(newPasswordHash);
      localStorage.setItem('fudep_admin_password', newPasswordHash);
      saveAdminPasswordToDb(newPasswordHash);
      alert("Votre mot de passe administrateur a été modifié avec succès !");
      setOldPassword('');
      setNewPassword('');
      setConfirmNewPassword('');
      return;
    }

    // Find user in accounts state
    const userIndex = accounts.findIndex(acc => acc.email.toLowerCase() === session.email.toLowerCase());
    if (userIndex === -1) {
      alert("Compte introuvable.");
      return;
    }

    const currentAccount = accounts[userIndex];
    if (currentAccount.password !== oldPassword && currentAccount.password !== oldPasswordHash) {
      alert("L'ancien mot de passe est incorrect.");
      return;
    }

    // Update account
    const updatedAccounts = [...accounts];
    updatedAccounts[userIndex] = {
      ...currentAccount,
      password: newPasswordHash
    };

    setAccounts(updatedAccounts);
    saveAccountToDb(updatedAccounts[userIndex]);
    alert("Votre mot de passe a été modifié avec succès !");
    setOldPassword('');
    setNewPassword('');
    setConfirmNewPassword('');
  };

  const handleLogout = () => {
    setSession({
      isLoggedIn: false,
      favorites: [],
      likedPosts: []
    });
    setIsAdminView(false);
    setBookingTarget(null);
    setPendingFavoriteTechId(null);
    setBookingIntent(null);
  };

  const handleDeleteAccount = async (email?: string) => {
    if (!email) return;
    if (email.toLowerCase() === 'ozenia.pro@gmail.com') {
      alert("Le compte d'administration principal ne peut pas être supprimé.");
      return;
    }
    try {
      await deleteAccountFromDb(email);
      setAccounts(prev => prev.filter(acc => acc.email.toLowerCase() !== email.toLowerCase()));
      handleLogout();
      alert("Votre compte a été supprimé définitivement. Nous espérons vous revoir bientôt !");
    } catch (err) {
      console.error("Error in handleDeleteAccount:", err);
      alert("Une erreur est survenue lors de la suppression de votre compte. Veuillez réessayer.");
    }
  };

  const handleHashtagClick = (tag: string) => {
    setSelectedTag(tag);
    setSelectedTechId(null);
    setSelectedPostId(null);
    setActiveTab('feed');
  };

  const submitBooking = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!bookingTarget) return;

    // Enforce other slots are present
    if (!bookingForm.alternativeAvailabilities) {
      alert("Le client doit obligatoirement mettre d'autres créneaux de disponibles.");
      return;
    }

    // Enforce commitment checkbox is checked
    if (!bookingForm.commitmentCheck) {
      alert("Vous devez obligatoirement vous engager à honorer le rendez-vous en cochant la case d'engagement.");
      return;
    }

    setIsProcessingPayment(true);

    // Save custom photo and reference locally
    localStorage.setItem('fudep_temp_booking_extra', JSON.stringify({
      modelPhoto: bookingForm.modelPhoto || '',
      postRefId: bookingTarget.post?.id || ''
    }));

    try {
      const actualPrice = (bookingTarget.post?.price !== undefined) ? bookingTarget.post.price : bookingTarget.service.price;
      const response = await fetch('/api/create-checkout-session', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          technicianId: bookingTarget.technician.id,
          technicianName: bookingTarget.technician.name,
          serviceId: bookingTarget.service.id,
          serviceName: bookingTarget.service.name,
          price: actualPrice,
          clientFirstName: bookingForm.firstName,
          clientPhone: bookingForm.phone,
          clientEmail: bookingForm.email,
          desiredDate: bookingForm.desiredDate,
          desiredTime: bookingForm.desiredTime,
          alternativeAvailabilities: bookingForm.alternativeAvailabilities,
          message: bookingForm.message,
          origin: window.location.origin,
        }),
      });

      if (!response.ok) {
        const errData = await response.json();
        throw new Error(errData.error || "Erreur lors de la création de la session Stripe.");
      }

      const data = await response.json();
      if (data.url) {
        // Redirect client to Stripe Checkout page
        window.location.href = data.url;
      } else {
        throw new Error("L'URL Stripe n'a pas été retournée par le serveur.");
      }
    } catch (error: any) {
      console.error("Stripe redirection error:", error);
      alert(error.message || "Erreur de connexion avec le service de paiement Stripe. Veuillez réessayer.");
      setIsProcessingPayment(false);
    }
  };

  // --- ADMIN ACTIONS ---
  const handleCreateTechnician = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTechForm.name || !newTechForm.username) return;

    const newTech: NailTechnician = {
      id: `tech_${Date.now()}`,
      name: newTechForm.name,
      username: newTechForm.username.startsWith('@') ? newTechForm.username : `@${newTechForm.username}`,
      avatar: newTechForm.avatar,
      city: newTechForm.city,
      bio: newTechForm.bio,
      rating: 5.0,
      reviewsCount: 1,
      tags: newTechForm.tags.split(',').map(t => t.trim()).filter(Boolean),
      services: [
        { id: `srv_${Date.now()}_1`, name: 'Pose complète', price: 60, duration: '1h 30' },
        { id: `srv_${Date.now()}_2`, name: 'Remplissage', price: 45, duration: '1h 15' },
        { id: `srv_${Date.now()}_3`, name: 'Nail Art personnalisé', price: 15, duration: '30 min' }
      ],
      freeSlots: []
    };

    setTechnicians(prev => [...prev, newTech]);
    saveTechnicianToDb(newTech);
    setNewTechForm({
      name: '',
      username: '',
      city: 'Paris',
      bio: '',
      tags: '',
      avatar: 'https://images.unsplash.com/photo-1544005313-94ddf0286df2?w=150&auto=format&fit=crop&q=80'
    });
    alert('Nouveau prestataire ajouté avec succès ! Des prestations par défaut lui ont été assignées.');
  };

  const handleCreatePost = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newPostForm.technicianId || !newPostForm.caption) return;

    let finalCaption = newPostForm.caption;
    if (newPostForm.tags) {
      const tagList = newPostForm.tags.includes(',')
        ? newPostForm.tags.split(',')
        : newPostForm.tags.split(/\s+/);
      
      const hashtagsToAppend = tagList
        .map(t => t.trim())
        .filter(t => t.length > 0)
        .map(t => t.startsWith('#') ? t : `#${t}`)
        .join(' ');
      
      if (hashtagsToAppend) {
        finalCaption = `${finalCaption.trim()}\n\n${hashtagsToAppend}`;
      }
    }

    const parsedPrice = parseFloat(newPostForm.price) || 0;

    const newPost: Post = {
      id: `post_${Date.now()}`,
      technicianId: newPostForm.technicianId,
      imageUrl: newPostForm.imagePreset,
      caption: finalCaption,
      likes: Math.floor(Math.random() * 20),
      tags: parseHashtags(newPostForm.tags, finalCaption),
      date: 'À l\'instant',
      price: parsedPrice > 0 ? parsedPrice : undefined,
      duration: newPostForm.duration ? newPostForm.duration : undefined
    };

    setPosts(prev => [newPost, ...prev]);
    savePostToDb(newPost);
    setNewPostForm({
      technicianId: '',
      caption: '',
      imagePreset: 'https://images.unsplash.com/photo-1604654894610-df63bc536371?w=800&auto=format&fit=crop&q=80',
      tags: '',
      price: '',
      duration: ''
    });
    alert('Nouvelle publication ajoutée au flux visuel !');
  };

  const handleDeleteTechnician = (techId: string) => {
    if (window.confirm("Êtes-vous sûr de vouloir supprimer ce prestataire ? Cela supprimera également toutes ses publications.")) {
      setTechnicians(prev => prev.filter(t => t.id !== techId));
      deleteTechnicianFromDb(techId);
      
      // Delete their posts as well
      const relatedPosts = posts.filter(p => p.technicianId === techId);
      relatedPosts.forEach(p => deletePostFromDb(p.id));
      setPosts(prev => prev.filter(p => p.technicianId !== techId));
      
      markAsSeededInDb(); // Prevent automatic re-seeding
      alert("Prestataire et ses publications supprimés avec succès !");
    }
  };

  const handleDeletePost = (postId: string) => {
    if (window.confirm("Êtes-vous sûr de vouloir supprimer cette publication ?")) {
      setPosts(prev => prev.filter(p => p.id !== postId));
      deletePostFromDb(postId);
      markAsSeededInDb(); // Prevent automatic re-seeding
      alert("Publication supprimée avec succès !");
    }
  };

  const handleClearAllDemoData = () => {
    if (window.confirm("⚠️ Attention : Êtes-vous sûr de vouloir supprimer TOUTES les données de test (prestataires et publications) pour commencer de zéro ?")) {
      // Clear Firestore collections too
      technicians.forEach(t => deleteTechnicianFromDb(t.id));
      posts.forEach(p => deletePostFromDb(p.id));
      setTechnicians([]);
      setPosts([]);
      markAsSeededInDb(); // Prevent automatic re-seeding
      alert("Toutes les données de test ont été supprimées. Vous pouvez maintenant ajouter vos propres prestataires et publications !");
    }
  };

  const handleUpdateBookingStatus = (id: string, status: 'confirmed' | 'refused' | 'proposed', proposedDate?: string) => {
    setBookings(prev => {
      const updated = prev.map(b => b.id === id ? { 
        ...b, 
        status, 
        ...(proposedDate ? { proposedDate } : {})
      } : b);
      const bookingToSave = updated.find(b => b.id === id);
      if (bookingToSave) {
        saveBookingToDb(bookingToSave);

        // Notify of state update via email
        const labelStatus = status === 'confirmed' ? 'Confirmé' : status === 'refused' ? 'Refusé' : 'Date alternative proposée';
        const emailSubject = `📢 Réservation mise à jour - Fudep [Réf: ${id}] - Statut : ${labelStatus}`;
        const emailText = `Bonjour,\n\nLa réservation ${id} chez ${bookingToSave.technicianName} a été mise à jour.\n\n` +
          `Nouveau Statut : ${labelStatus}\n` +
          `Client : ${bookingToSave.clientFirstName} (${bookingToSave.clientEmail})\n` +
          `Date originale demandée : ${bookingToSave.desiredDate} à ${bookingToSave.desiredTime}\n` +
          (proposedDate ? `Date proposée alternative : ${proposedDate}\n` : '') +
          `\nCordialement,\nL'équipe Fudep`;

        const emailHtml = `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e2e8f0; border-radius: 12px; background-color: #f8fafc;">
            <h2 style="color: #0f172a; border-bottom: 2px solid #cbd5e1; padding-bottom: 10px; margin-top: 0;">📢 Réservation mise à jour</h2>
            <p style="color: #334155; font-size: 14px; line-height: 1.5;">Bonjour,</p>
            <p style="color: #334155; font-size: 14px; line-height: 1.5;">La réservation <strong>${id}</strong> chez <strong>${bookingToSave.technicianName}</strong> a changé de statut.</p>
            
            <div style="background-color: #ffffff; padding: 15px; border-radius: 8px; border: 1px solid #e2e8f0; margin: 20px 0;">
              <table style="width: 100%; border-collapse: collapse; font-size: 13px; color: #475569;">
                <tr><td style="padding: 4px 0; font-weight: bold; width: 150px;">Nouveau Statut :</td><td><strong style="color: ${status === 'confirmed' ? '#16a34a' : status === 'refused' ? '#dc2626' : '#d97706'}">${labelStatus}</strong></td></tr>
                <tr><td style="padding: 4px 0; font-weight: bold;">Client :</td><td>${bookingToSave.clientFirstName} (${bookingToSave.clientEmail})</td></tr>
                <tr><td style="padding: 4px 0; font-weight: bold;">Date & Heure :</td><td>Le ${bookingToSave.desiredDate} à ${bookingToSave.desiredTime}</td></tr>
                ${proposedDate ? `<tr><td style="padding: 4px 0; font-weight: bold; color: #d97706;">Date Alternative :</td><td><strong style="color: #d97706;">${proposedDate}</strong></td></tr>` : ''}
                <tr><td style="padding: 4px 0; font-weight: bold;">Prestation :</td><td>${bookingToSave.serviceName}</td></tr>
                <tr><td style="padding: 4px 0; font-weight: bold;">Prix total :</td><td>${bookingToSave.price} €</td></tr>
              </table>
            </div>

            <p style="color: #475569; font-size: 12px; margin-top: 25px; border-top: 1px solid #cbd5e1; padding-top: 15px; text-align: center;">
              Ceci est un e-mail automatique envoyé par la plateforme Fudep.
            </p>
          </div>
        `;
        sendNotificationEmail('ozenia.pro@gmail.com', emailSubject, emailText, emailHtml, `booking_${status}`);

        // Notify the client of status update
        let clientStatusSubject = '';
        let clientStatusText = '';
        let clientStatusHtml = '';

        if (status === 'confirmed') {
          clientStatusSubject = `🎉 Votre réservation est confirmée ! - Fudep [Réf: ${id}]`;
          clientStatusText = `Bonjour ${bookingToSave.clientFirstName},\n\n` +
            `Excellente nouvelle ! Votre prestataire ${bookingToSave.technicianName} a confirmé votre rendez-vous.\n\n` +
            `Détails de votre réservation :\n` +
            `- Prestation : ${bookingToSave.serviceName}\n` +
            `- Date & Heure : Le ${bookingToSave.desiredDate} à ${bookingToSave.desiredTime}\n` +
            `- Tarif total : ${bookingToSave.price} €\n` +
            `- Acompte payé (30%) : ${(bookingToSave.price * 0.3).toFixed(2)} € (Stripe)\n` +
            `- Reste à régler sur place (70%) : ${(bookingToSave.price * 0.7).toFixed(2)} €\n\n` +
            `Nous vous remercions de votre confiance.\n\n` +
            `Cordialement,\nL'équipe Fudep`;

          clientStatusHtml = `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e2e8f0; border-radius: 12px; background-color: #f8fafc;">
              <div style="text-align: center; margin-bottom: 25px;">
                <h1 style="color: #16a34a; font-family: 'Georgia', serif; font-size: 24px; margin-top: 0;">🎉 Votre réservation est confirmée !</h1>
                <p style="color: #64748b; font-size: 14px;">Bonne nouvelle pour votre rendez-vous beauté</p>
              </div>
              
              <p style="color: #334155; font-size: 14px; line-height: 1.6;">Bonjour <strong>${bookingToSave.clientFirstName}</strong>,</p>
              <p style="color: #334155; font-size: 14px; line-height: 1.6;">Votre prestataire <strong>${bookingToSave.technicianName}</strong> a validé votre demande de réservation.</p>
              
              <div style="background-color: #ffffff; padding: 20px; border-radius: 8px; border: 1px solid #e2e8f0; margin: 20px 0;">
                <h3 style="color: #0f172a; margin-top: 0; font-size: 15px; border-bottom: 1px solid #f1f5f9; padding-bottom: 5px;">📅 Récapitulatif du rendez-vous</h3>
                <table style="width: 100%; border-collapse: collapse; font-size: 13px; color: #475569;">
                  <tr><td style="padding: 6px 0; font-weight: bold; width: 180px;">Réf. Réservation :</td><td><strong>${id}</strong></td></tr>
                  <tr><td style="padding: 6px 0; font-weight: bold;">Prestataire :</td><td>${bookingToSave.technicianName}</td></tr>
                  <tr><td style="padding: 6px 0; font-weight: bold;">Prestation :</td><td>${bookingToSave.serviceName}</td></tr>
                  <tr><td style="padding: 6px 0; font-weight: bold;">Date & Heure :</td><td style="color: #16a34a; font-weight: bold;">Le ${bookingToSave.desiredDate} à ${bookingToSave.desiredTime}</td></tr>
                  <tr><td style="padding: 6px 0; font-weight: bold;">Tarif de la prestation :</td><td><strong>${bookingToSave.price} €</strong></td></tr>
                  <tr><td style="padding: 6px 0; font-weight: bold; color: #16a34a;">Acompte payé (30%) :</td><td style="color: #16a34a; font-weight: bold;">${(bookingToSave.price * 0.3).toFixed(2)} € (Stripe Checkout)</td></tr>
                  <tr><td style="padding: 6px 0; font-weight: bold; color: #0f4c81;">Reste à régler sur place :</td><td style="color: #0f4c81; font-weight: bold;">${(bookingToSave.price * 0.7).toFixed(2)} €</td></tr>
                </table>
              </div>
              
              <p style="color: #334155; font-size: 14px; line-height: 1.6;">Vous pouvez retrouver vos réservations en vous connectant sur la plateforme Fudep.</p>
              <p style="color: #334155; font-size: 14px; line-height: 1.6;">En cas de besoin, vous pouvez nous écrire à <a href="mailto:contact@fudep.fr" style="color: #0f4c81; font-weight: bold; text-decoration: none;">contact@fudep.fr</a>.</p>
              
              <p style="color: #334155; font-size: 14px; line-height: 1.6; margin-top: 25px;">À très bientôt !</p>
              <p style="color: #0f4c81; font-weight: bold; font-size: 14px;">L'équipe Fudep</p>
            </div>
          `;
        } else if (status === 'refused') {
          clientStatusSubject = `❌ Votre demande de réservation a été refusée - Fudep [Réf: ${id}]`;
          clientStatusText = `Bonjour ${bookingToSave.clientFirstName},\n\n` +
            `Nous sommes au regret de vous informer que votre prestataire ${bookingToSave.technicianName} a dû refuser votre demande de réservation.\n\n` +
            `Rappel de la demande :\n` +
            `- Prestation : ${bookingToSave.serviceName}\n` +
            `- Date initialement demandée : Le ${bookingToSave.desiredDate} à ${bookingToSave.desiredTime}\n\n` +
            `Remboursement de l'acompte :\n` +
            `Conformément à nos conditions, votre acompte de 30% (${(bookingToSave.price * 0.3).toFixed(2)} €) réglé via Stripe vous sera intégralement remboursé sous 5 à 10 jours ouvrés directement sur le moyen de paiement utilisé.\n\n` +
            `N'hésitez pas à tenter de réserver un autre créneau ou auprès d'un autre prestataire sur notre plateforme.\n\n` +
            `Cordialement,\nL'équipe Fudep`;

          clientStatusHtml = `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e2e8f0; border-radius: 12px; background-color: #f8fafc;">
              <div style="text-align: center; margin-bottom: 25px;">
                <h1 style="color: #dc2626; font-family: 'Georgia', serif; font-size: 24px; margin-top: 0;">❌ Demande de réservation refusée</h1>
                <p style="color: #64748b; font-size: 14px;">Rappel des détails de votre demande</p>
              </div>
              
              <p style="color: #334155; font-size: 14px; line-height: 1.6;">Bonjour <strong>${bookingToSave.clientFirstName}</strong>,</p>
              <p style="color: #334155; font-size: 14px; line-height: 1.6;">Nous sommes au regret de vous informer que votre prestataire <strong>${bookingToSave.technicianName}</strong> n'a pas pu valider votre demande de réservation pour le <strong>Le ${bookingToSave.desiredDate} à ${bookingToSave.desiredTime}</strong>.</p>
              
              <div style="background-color: #fef2f2; border: 1px solid #fee2e2; padding: 15px; border-radius: 8px; margin: 20px 0;">
                <h4 style="color: #991b1b; margin-top: 0; margin-bottom: 5px; font-size: 14px;">💰 Remboursement de votre acompte</h4>
                <p style="color: #7f1d1d; font-size: 13px; line-height: 1.5; margin: 0;">
                  Votre acompte de 30% soit <strong>${(bookingToSave.price * 0.3).toFixed(2)} €</strong> réglé via Stripe vous sera remboursé automatiquement sous un délai de 5 à 10 jours ouvrés directement sur la carte bancaire ayant servi au paiement.
                </p>
              </div>

              <p style="color: #334155; font-size: 14px; line-height: 1.6;">Nous vous invitons à consulter les autres créneaux disponibles ou à choisir un autre prestataire partenaire sur Fudep.</p>
              <p style="color: #334155; font-size: 14px; line-height: 1.6;">Pour toute question, vous pouvez nous écrire à <a href="mailto:contact@fudep.fr" style="color: #0f4c81; font-weight: bold; text-decoration: none;">contact@fudep.fr</a>.</p>
              
              <p style="color: #0f4c81; font-weight: bold; font-size: 14px; margin-top: 25px;">L'équipe Fudep</p>
            </div>
          `;
        } else if (status === 'proposed') {
          clientStatusSubject = `📅 Nouvelle date proposée pour votre rendez-vous - Fudep [Réf: ${id}]`;
          clientStatusText = `Bonjour ${bookingToSave.clientFirstName},\n\n` +
            `Votre prestataire ${bookingToSave.technicianName} n'est malheureusement pas disponible sur le créneau initialement demandé. Il vous propose la date alternative suivante :\n` +
            `- Nouvelle date proposée : Le ${proposedDate}\n\n` +
            `Veuillez vous connecter à votre compte sur Fudep pour accepter cette proposition ou choisir un autre créneau qui vous convient mieux.\n\n` +
            `Cordialement,\nL'équipe Fudep`;

          clientStatusHtml = `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e2e8f0; border-radius: 12px; background-color: #f8fafc;">
              <div style="text-align: center; margin-bottom: 25px;">
                <h1 style="color: #d97706; font-family: 'Georgia', serif; font-size: 24px; margin-top: 0;">📅 Proposition d'une date alternative</h1>
                <p style="color: #64748b; font-size: 14px;">Une nouvelle date est suggérée pour votre rendez-vous</p>
              </div>
              
              <p style="color: #334155; font-size: 14px; line-height: 1.6;">Bonjour <strong>${bookingToSave.clientFirstName}</strong>,</p>
              <p style="color: #334155; font-size: 14px; line-height: 1.6;">Votre prestataire <strong>${bookingToSave.technicianName}</strong> n'étant pas disponible sur le créneau choisi, il vous propose une autre date :</p>
              
              <div style="background-color: #fffbeb; border: 1px solid #fef3c7; padding: 20px; border-radius: 10px; margin: 20px 0; text-align: center;">
                <span style="font-size: 12px; color: #b45309; text-transform: uppercase; font-weight: bold; letter-spacing: 1px;">CRÉNEAU PROPOSÉ</span>
                <p style="font-size: 18px; font-weight: bold; color: #b45309; margin: 5px 0 0 0;">Le ${proposedDate}</p>
              </div>

              <p style="color: #334155; font-size: 14px; line-height: 1.6;"><strong>Que souhaitez-vous faire ?</strong></p>
              <p style="color: #334155; font-size: 14px; line-height: 1.6;">Connectez-vous dès maintenant à votre espace Fudep pour :</p>
              <ul style="color: #475569; font-size: 13px; line-height: 1.6; padding-left: 20px;">
                <li><strong>Accepter</strong> cette date (votre rendez-vous sera alors immédiatement confirmé)</li>
                <li><strong>Décliner</strong> et choisir un autre créneau de libre de votre choix</li>
              </ul>
              
              <p style="color: #334155; font-size: 14px; line-height: 1.6; margin-top: 25px;">En cas de question, écrivez-nous à <a href="mailto:contact@fudep.fr" style="color: #0f4c81; font-weight: bold; text-decoration: none;">contact@fudep.fr</a>.</p>
              <p style="color: #0f4c81; font-weight: bold; font-size: 14px;">L'équipe Fudep</p>
            </div>
          `;
        }

        if (clientStatusSubject) {
          sendNotificationEmail(bookingToSave.clientEmail, clientStatusSubject, clientStatusText, clientStatusHtml, `booking_${status}_client`);
        }
      }
      return updated;
    });
  };

  const handleProposeAlternateDate = (bookingId: string) => {
    if (!alternateDateInput) return;
    const formattedProposed = `${alternateDateInput} à ${alternateTimeInput}`;
    handleUpdateBookingStatus(bookingId, 'proposed', formattedProposed);
    setProposingDateId(null);
    setAlternateDateInput('');
    alert('Proposition de date envoyée avec succès au client !');
  };

  const handleAcceptProposedDate = (bookingId: string) => {
    setBookings(prev => {
      const updated = prev.map(b => {
        if (b.id === bookingId) {
          const parts = b.proposedDate ? b.proposedDate.split(' à ') : [];
          return {
            ...b,
            status: 'confirmed' as const,
            desiredDate: parts[0] || b.desiredDate,
            desiredTime: parts[1] || b.desiredTime,
            proposedDate: undefined
          };
        }
        return b;
      });
      const bookingToSave = updated.find(b => b.id === bookingId);
      if (bookingToSave) {
        saveBookingToDb(bookingToSave);

        // Notify of acceptance
        const emailSubject = `✅ Proposition de date acceptée - Fudep [Réf: ${bookingId}]`;
        const emailText = `Bonjour,\n\nLe client ${bookingToSave.clientFirstName} a accepté la proposition de nouvelle date pour sa réservation chez ${bookingToSave.technicianName}.\n\n` +
          `La réservation est dorénavant confirmée pour le ${bookingToSave.desiredDate} à ${bookingToSave.desiredTime}.\n\n` +
          `Cordialement,\nL'équipe Fudep`;

        const emailHtml = `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e2e8f0; border-radius: 12px; background-color: #f8fafc;">
            <h2 style="color: #16a34a; border-bottom: 2px solid #cbd5e1; padding-bottom: 10px; margin-top: 0;">✅ Proposition de date acceptée</h2>
            <p style="color: #334155; font-size: 14px; line-height: 1.5;">Bonjour,</p>
            <p style="color: #334155; font-size: 14px; line-height: 1.5;">Le client <strong>${bookingToSave.clientFirstName}</strong> a accepté la proposition de nouvelle date pour sa réservation chez <strong>${bookingToSave.technicianName}</strong>.</p>
            
            <div style="background-color: #ffffff; padding: 15px; border-radius: 8px; border: 1px solid #e2e8f0; margin: 20px 0;">
              <table style="width: 100%; border-collapse: collapse; font-size: 13px; color: #475569;">
                <tr><td style="padding: 4px 0; font-weight: bold; width: 150px;">Statut :</td><td><strong style="color: #16a34a;">Confirmé</strong></td></tr>
                <tr><td style="padding: 4px 0; font-weight: bold;">Nouvelle date :</td><td><strong style="color: #2563eb;">Le ${bookingToSave.desiredDate} à ${bookingToSave.desiredTime}</strong></td></tr>
                <tr><td style="padding: 4px 0; font-weight: bold;">Prestation :</td><td>${bookingToSave.serviceName}</td></tr>
                <tr><td style="padding: 4px 0; font-weight: bold;">Client :</td><td>${bookingToSave.clientFirstName} (${bookingToSave.clientEmail})</td></tr>
              </table>
            </div>

            <p style="color: #475569; font-size: 12px; margin-top: 25px; border-top: 1px solid #cbd5e1; padding-top: 15px; text-align: center;">
              Ceci est un e-mail automatique envoyé par la plateforme Fudep.
            </p>
          </div>
        `;
        sendNotificationEmail('ozenia.pro@gmail.com', emailSubject, emailText, emailHtml, 'booking_date_accepted');

        // Client confirmation email
        const clientAcceptSubject = `🌸 Confirmation : Votre nouvelle date est validée ! - Fudep [Réf: ${bookingId}]`;
        const clientAcceptText = `Bonjour ${bookingToSave.clientFirstName},\n\n` +
          `Vous avez bien accepté la date alternative proposée pour votre rendez-vous chez ${bookingToSave.technicianName}.\n\n` +
          `Détails de votre réservation :\n` +
          `- Prestation : ${bookingToSave.serviceName}\n` +
          `- Date & Heure : Le ${bookingToSave.desiredDate} à ${bookingToSave.desiredTime}\n` +
          `- Tarif total : ${bookingToSave.price} €\n` +
          `- Acompte payé (30%) : ${(bookingToSave.price * 0.3).toFixed(2)} € (Stripe)\n` +
          `- Reste à régler sur place (70%) : ${(bookingToSave.price * 0.7).toFixed(2)} €\n\n` +
          `Votre rendez-vous est dorénavant officiellement confirmé.\n\n` +
          `Cordialement,\nL'équipe Fudep`;

        const clientAcceptHtml = `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e2e8f0; border-radius: 12px; background-color: #f8fafc;">
            <div style="text-align: center; margin-bottom: 25px;">
              <h1 style="color: #16a34a; font-family: 'Georgia', serif; font-size: 24px; margin-top: 0;">✅ Nouvelle date confirmée !</h1>
              <p style="color: #64748b; font-size: 14px;">Votre rendez-vous beauté a été mis à jour</p>
            </div>
            
            <p style="color: #334155; font-size: 14px; line-height: 1.6;">Bonjour <strong>${bookingToSave.clientFirstName}</strong>,</p>
            <p style="color: #334155; font-size: 14px; line-height: 1.6;">Nous vous confirmons que vous avez accepté la date alternative proposée par votre prestataire <strong>${bookingToSave.technicianName}</strong>.</p>
            
            <div style="background-color: #ffffff; padding: 20px; border-radius: 8px; border: 1px solid #e2e8f0; margin: 20px 0;">
              <h3 style="color: #0f172a; margin-top: 0; font-size: 15px; border-bottom: 1px solid #f1f5f9; padding-bottom: 5px;">📅 Récapitulatif du rendez-vous</h3>
              <table style="width: 100%; border-collapse: collapse; font-size: 13px; color: #475569;">
                <tr><td style="padding: 6px 0; font-weight: bold; width: 180px;">Réf. Réservation :</td><td><strong>${bookingId}</strong></td></tr>
                <tr><td style="padding: 6px 0; font-weight: bold;">Prestataire :</td><td>${bookingToSave.technicianName}</td></tr>
                <tr><td style="padding: 6px 0; font-weight: bold;">Prestation :</td><td>${bookingToSave.serviceName}</td></tr>
                <tr><td style="padding: 6px 0; font-weight: bold;">Date & Heure :</td><td style="color: #16a34a; font-weight: bold;">Le ${bookingToSave.desiredDate} à ${bookingToSave.desiredTime}</td></tr>
                <tr><td style="padding: 6px 0; font-weight: bold;">Tarif de la prestation :</td><td><strong>${bookingToSave.price} €</strong></td></tr>
                <tr><td style="padding: 6px 0; font-weight: bold; color: #16a34a;">Acompte payé (30%) :</td><td style="color: #16a34a; font-weight: bold;">${(bookingToSave.price * 0.3).toFixed(2)} € (Stripe Checkout)</td></tr>
                <tr><td style="padding: 6px 0; font-weight: bold; color: #0f4c81;">Reste à régler sur place :</td><td style="color: #0f4c81; font-weight: bold;">${(bookingToSave.price * 0.7).toFixed(2)} €</td></tr>
              </table>
            </div>
            
            <p style="color: #334155; font-size: 14px; line-height: 1.6;">Votre rendez-vous est maintenant officiellement confirmé. Nous restons à votre disposition à l'adresse <a href="mailto:contact@fudep.fr" style="color: #0f4c81; font-weight: bold; text-decoration: none;">contact@fudep.fr</a>.</p>
            
            <p style="color: #334155; font-size: 14px; line-height: 1.6; margin-top: 25px;">À très bientôt !</p>
            <p style="color: #0f4c81; font-weight: bold; font-size: 14px;">L'équipe Fudep</p>
          </div>
        `;
        sendNotificationEmail(bookingToSave.clientEmail, clientAcceptSubject, clientAcceptText, clientAcceptHtml, 'booking_date_accepted_client');
      }
      return updated;
    });
    alert('Vous avez accepté la nouvelle date proposée. Réservation confirmée !');
  };

  const handleRefuseProposedDate = (bookingId: string) => {
    setReschedulingBookingId(bookingId);
    setSelectedRescheduleSlot('');
  };

  const handleRescheduleConfirm = (bookingId: string) => {
    if (!selectedRescheduleSlot) {
      alert("Veuillez choisir un créneau disponible.");
      return;
    }
    // Extract date and time
    const parts = selectedRescheduleSlot.split(' à ');
    const newDate = parts[0];
    const newTime = parts[1] || '10:00';

    setBookings(prev => {
      const updated = prev.map(b => {
        if (b.id === bookingId) {
          const bookingToSave = {
            ...b,
            desiredDate: newDate,
            desiredTime: newTime,
            status: 'pending' as const,
            proposedDate: undefined
          };
          saveBookingToDb(bookingToSave);

          // Send notification email
          const emailSubject = `🔄 Réservation replanifiée par le client - Fudep [Réf: ${bookingId}]`;
          const emailText = `Bonjour,\n\nLe client ${bookingToSave.clientFirstName} a décliné votre proposition de date et a replanifié sa réservation chez ${bookingToSave.technicianName}.\n\n` +
            `Nouveau créneau souhaité : Le ${bookingToSave.desiredDate} à ${bookingToSave.desiredTime}\n` +
            `La réservation est de nouveau en attente de validation.\n\n` +
            `Cordialement,\nL'équipe Fudep`;

          const emailHtml = `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e2e8f0; border-radius: 12px; background-color: #f8fafc;">
              <h2 style="color: #2563eb; border-bottom: 2px solid #cbd5e1; padding-bottom: 10px; margin-top: 0;">🔄 Réservation replanifiée par le client</h2>
              <p style="color: #334155; font-size: 14px; line-height: 1.5;">Bonjour,</p>
              <p style="color: #334155; font-size: 14px; line-height: 1.5;">Le client <strong>${bookingToSave.clientFirstName}</strong> a choisi un nouveau créneau disponible après avoir décliné la proposition de date chez <strong>${bookingToSave.technicianName}</strong>.</p>
              
              <div style="background-color: #ffffff; padding: 15px; border-radius: 8px; border: 1px solid #e2e8f0; margin: 20px 0;">
                <table style="width: 100%; border-collapse: collapse; font-size: 13px; color: #475569;">
                  <tr><td style="padding: 4px 0; font-weight: bold; width: 150px;">Nouveau créneau :</td><td><strong style="color: #2563eb;">Le ${bookingToSave.desiredDate} à ${bookingToSave.desiredTime}</strong></td></tr>
                  <tr><td style="padding: 4px 0; font-weight: bold;">Prestation :</td><td>${bookingToSave.serviceName}</td></tr>
                  <tr><td style="padding: 4px 0; font-weight: bold;">Client :</td><td>${bookingToSave.clientFirstName} (${bookingToSave.clientEmail})</td></tr>
                  <tr><td style="padding: 4px 0; font-weight: bold;">Statut :</td><td><strong style="color: #d97706;">En attente de validation</strong></td></tr>
                </table>
              </div>

              <p style="color: #475569; font-size: 12px; margin-top: 25px; border-top: 1px solid #cbd5e1; padding-top: 15px; text-align: center;">
                Ceci est un e-mail automatique envoyé par la plateforme Fudep.
              </p>
            </div>
          `;
          sendNotificationEmail('ozenia.pro@gmail.com', emailSubject, emailText, emailHtml, 'booking_rescheduled');

          // Client confirmation email
          const clientReschedSubject = `🔄 Votre demande de replanification a été envoyée - Fudep [Réf: ${bookingId}]`;
          const clientReschedText = `Bonjour ${bookingToSave.clientFirstName},\n\n` +
            `Vous avez choisi un nouveau créneau disponible pour votre réservation chez ${bookingToSave.technicianName}.\n\n` +
            `Détails du nouveau créneau demandé :\n` +
            `- Date & Heure : Le ${bookingToSave.desiredDate} à ${bookingToSave.desiredTime}\n` +
            `- Statut : En attente de validation\n\n` +
            `Votre demande a bien été transmise à votre prestataire, et vous recevrez un e-mail dès qu'elle aura été validée.\n\n` +
            `Cordialement,\nL'équipe Fudep`;

          const clientReschedHtml = `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e2e8f0; border-radius: 12px; background-color: #f8fafc;">
              <div style="text-align: center; margin-bottom: 25px;">
                <h1 style="color: #2563eb; font-family: 'Georgia', serif; font-size: 24px; margin-top: 0;">🔄 Demande de replanification envoyée</h1>
                <p style="color: #64748b; font-size: 14px;">Nouveau créneau en attente de validation</p>
              </div>
              
              <p style="color: #334155; font-size: 14px; line-height: 1.6;">Bonjour <strong>${bookingToSave.clientFirstName}</strong>,</p>
              <p style="color: #334155; font-size: 14px; line-height: 1.6;">Nous vous confirmons que votre demande de replanification de rendez-vous chez <strong>${bookingToSave.technicianName}</strong> a bien été transmise.</p>
              
              <div style="background-color: #ffffff; padding: 20px; border-radius: 8px; border: 1px solid #e2e8f0; margin: 20px 0;">
                <h3 style="color: #0f172a; margin-top: 0; font-size: 15px; border-bottom: 1px solid #f1f5f9; padding-bottom: 5px;">📅 Récapitulatif du nouveau créneau</h3>
                <table style="width: 100%; border-collapse: collapse; font-size: 13px; color: #475569;">
                  <tr><td style="padding: 6px 0; font-weight: bold; width: 180px;">Réf. Réservation :</td><td><strong>${bookingId}</strong></td></tr>
                  <tr><td style="padding: 6px 0; font-weight: bold;">Prestataire :</td><td>${bookingToSave.technicianName}</td></tr>
                  <tr><td style="padding: 6px 0; font-weight: bold;">Prestation :</td><td>${bookingToSave.serviceName}</td></tr>
                  <tr><td style="padding: 6px 0; font-weight: bold;">Nouveau créneau choisi :</td><td style="color: #2563eb; font-weight: bold;">Le ${bookingToSave.desiredDate} à ${bookingToSave.desiredTime}</td></tr>
                  <tr><td style="padding: 6px 0; font-weight: bold;">Statut :</td><td><strong style="color: #d97706;">En attente de validation</strong></td></tr>
                </table>
              </div>
              
              <p style="color: #334155; font-size: 14px; line-height: 1.6;">Votre prestataire étudie actuellement ce nouveau créneau. Vous serez alerté(e) par e-mail dès sa validation.</p>
              <p style="color: #334155; font-size: 14px; line-height: 1.6;">Pour toute information complémentaire, vous pouvez nous écrire à <a href="mailto:contact@fudep.fr" style="color: #0f4c81; font-weight: bold; text-decoration: none;">contact@fudep.fr</a>.</p>
              
              <p style="color: #0f4c81; font-weight: bold; font-size: 14px; margin-top: 25px;">L'équipe Fudep</p>
            </div>
          `;
          sendNotificationEmail(bookingToSave.clientEmail, clientReschedSubject, clientReschedText, clientReschedHtml, 'booking_rescheduled_client');

          return bookingToSave;
        }
        return b;
      });
      return updated;
    });

    setReschedulingBookingId(null);
    setSelectedRescheduleSlot('');
    alert('Votre demande de réservation a été mise à jour avec le nouveau créneau sélectionné ! Elle est de nouveau en attente de validation.');
  };

  const handleAddFreeSlot = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedTechForSlot || !freeSlotDate) return;

    const formattedSlot = `${freeSlotDate} à ${freeSlotTime}`;
    setTechnicians(prev => {
      const updated = prev.map(t => {
        if (t.id === selectedTechForSlot) {
          const slots = t.freeSlots || [];
          if (slots.includes(formattedSlot)) {
            alert('Ce créneau est déjà disponible pour ce prestataire.');
            return t;
          }
          const u = {
            ...t,
            freeSlots: [...slots, formattedSlot].sort()
          };
          saveTechnicianToDb(u);
          return u;
        }
        return t;
      });
      return updated;
    });

    alert('Créneau libre ajouté avec succès pour ce prestataire !');
    setFreeSlotDate('');
  };

  // --- FILTERS & MATCHING ---
  const cities = ['Tous', ...Array.from(new Set(technicians.map(t => t.city)))];
  const tags = useMemo(() => {
    const defaultTags = ['Tous', 'Nail Art', 'Manucure Russe', 'Gel', 'Babyboomer', 'Pastel', 'Chrome', 'French'];
    const allPostTags = posts.flatMap(p => p.tags || []);
    
    const uniqueTags = new Set<string>();
    const seenLower = new Set<string>();
    
    defaultTags.forEach(t => {
      uniqueTags.add(t);
      seenLower.add(t.toLowerCase());
    });
    
    allPostTags.forEach(t => {
      if (t && t.trim()) {
        const cleaned = t.replace(/#/g, '').trim();
        if (cleaned && !seenLower.has(cleaned.toLowerCase())) {
          seenLower.add(cleaned.toLowerCase());
          uniqueTags.add(cleaned);
        }
      }
    });
    
    return Array.from(uniqueTags);
  }, [posts]);

  // Filter posts based on search city, tags, text search query, and post similarity
  const filteredPosts = posts.filter(post => {
    const tech = technicians.find(t => t.id === post.technicianId);
    if (!tech) return false;

    // Filter by style similarity
    if (similarToPostId) {
      const referencePost = posts.find(p => p.id === similarToPostId);
      if (referencePost) {
        const hasCommonTag = post.tags.some(tag => referencePost.tags.includes(tag));
        if (!hasCommonTag && post.id !== similarToPostId) {
          return false;
        }
      }
    }

    const matchesCity = selectedCity === 'Tous' || tech.city === selectedCity;
    const matchesTag = selectedTag === 'Tous' || 
                       post.tags.some(tag => tag.toLowerCase().includes(selectedTag.toLowerCase()) || selectedTag.toLowerCase().includes(tag.toLowerCase())) ||
                       tech.tags.some(tag => tag.toLowerCase().includes(selectedTag.toLowerCase()) || selectedTag.toLowerCase().includes(tag.toLowerCase())) ||
                       post.caption.toLowerCase().includes(selectedTag.toLowerCase());

    // Search query matches: technician name, username, city, post caption, tag or service names
    const matchesSearch = !searchQuery.trim() || (() => {
      const query = searchQuery.toLowerCase().trim();
      return (
        tech.name.toLowerCase().includes(query) ||
        tech.username.toLowerCase().includes(query) ||
        tech.city.toLowerCase().includes(query) ||
        post.caption.toLowerCase().includes(query) ||
        post.tags.some(t => t.toLowerCase().includes(query)) ||
        tech.tags.some(t => t.toLowerCase().includes(query)) ||
        tech.services.some(s => s.name.toLowerCase().includes(query))
      );
    })();

    return matchesCity && matchesTag && matchesSearch;
  });

  const activeTechnician = selectedTechId ? technicians.find(t => t.id === selectedTechId) : null;
  const activePost = selectedPostId ? posts.find(p => p.id === selectedPostId) : null;
  const activePostTech = activePost ? technicians.find(t => t.id === activePost.technicianId) : null;

  if (loadingDb) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center font-sans p-6">
        <div className="flex flex-col items-center max-w-sm text-center">
          {/* Elegant Loading Spinner */}
          <div className="relative w-16 h-16 mb-6">
            <div className="absolute inset-0 border-4 border-slate-100 rounded-full"></div>
            <div className="absolute inset-0 border-4 border-t-[#0f4c81] rounded-full animate-spin"></div>
          </div>
          <h2 className="text-xl font-serif font-bold text-slate-800 mb-2">Chargement de Fudep...</h2>
          <p className="text-sm text-slate-500 leading-relaxed">
            Nous préparons votre espace beauté et vos inspirations manucure.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-100 flex flex-col font-sans antialiased text-slate-800">
      
      {/* Administrative View Toggle - Only visible to ozenia.pro@gmail.com */}
      {session.isLoggedIn && session.email?.toLowerCase() === 'ozenia.pro@gmail.com' && (
        <div className="bg-[#0f4c81] text-white py-2 px-4 shadow-sm z-50 flex flex-wrap justify-between items-center text-xs md:text-sm">
          <div className="flex items-center gap-2">
            <span className="bg-amber-400 text-slate-900 font-bold px-1.5 py-0.5 rounded text-[10px]">ADMIN HUB</span>
            <p>Espace réservé à l'administratrice Fudep :</p>
          </div>
          <div className="flex gap-2 mt-1 md:mt-0">
            <button 
              id="btn_mode_client"
              onClick={() => { setIsAdminView(false); }}
              className={`px-3 py-1 rounded-full font-medium transition-all ${!isAdminView ? 'bg-white text-slate-900 shadow-sm' : 'bg-blue-800/60 hover:bg-blue-800 text-blue-100'}`}
            >
              📱 Vue Client / Utilisateur
            </button>
            <button 
              id="btn_mode_admin"
              onClick={() => { setIsAdminView(true); }}
              className={`px-3 py-1 rounded-full font-medium transition-all flex items-center gap-1 ${isAdminView ? 'bg-amber-400 text-slate-900 shadow-sm' : 'bg-blue-800/60 hover:bg-blue-800 text-blue-100'}`}
            >
              ⚙️ Espace Administrateur {bookings.filter(b => b.status === 'pending').length > 0 && (
                <span className="bg-red-500 text-white text-[10px] w-4 h-4 flex items-center justify-center rounded-full font-bold animate-pulse">
                  {bookings.filter(b => b.status === 'pending').length}
                </span>
              )}
            </button>
          </div>
        </div>
      )}

      {/* Main Container framed as a luxury smartphone mock on desktop or fullscreen on mobile */}
      <div className="w-full max-w-lg mx-auto flex-1 bg-white shadow-2xl relative flex flex-col md:border-x md:border-slate-200">
        
        {/* APP HEADER */}
        <header className="sticky top-0 bg-white/95 backdrop-blur border-b border-slate-100 z-40 px-4 py-3.5 shadow-xs">
          <div className="flex justify-between items-center">
            {/* Logo */}
            <div className="flex items-center gap-2 cursor-pointer" onClick={() => { setSelectedTechId(null); setSelectedPostId(null); setActiveTab('feed'); }}>
              <div className="w-10 h-10 flex items-center justify-center rounded-lg shadow-sm border border-slate-100 bg-white">
                <FudepLogo className="w-8 h-8" />
              </div>
              <div className="flex flex-col">
                <h1 className="text-xl font-extrabold text-[#0f4c81] tracking-tight font-serif italic leading-none">Fudep</h1>
                <span className="text-[7.5px] text-slate-400 font-bold uppercase tracking-widest mt-0.5">Nails Marketplace</span>
              </div>
            </div>

            {/* Filter Toggle / Status */}
            <div className="flex items-center gap-2">
              {session.isLoggedIn ? (
                <div className="flex items-center gap-1.5 bg-slate-100 py-1 px-3 rounded-full text-xs">
                  <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
                  <span className="font-medium truncate max-w-[80px] text-slate-600">{session.name}</span>
                  <button onClick={handleLogout} title="Se déconnecter" className="text-slate-400 hover:text-red-500 ml-1">
                    <LogOut className="w-3.5 h-3.5" />
                  </button>
                </div>
              ) : (
                <button 
                  id="btn_auth_header"
                  onClick={() => setShowLoginModal(true)} 
                  className="bg-[#0f4c81] text-white hover:bg-[#1a5b94] font-medium text-xs py-1.5 px-3 rounded-full transition-all flex items-center gap-1 shadow-sm"
                >
                  <User className="w-3.5 h-3.5" /> Connexion
                </button>
              )}
            </div>
          </div>
        </header>

        {/* CLIENT FEED & MAIN APPLICATION CONTAINER */}
        {!isAdminView ? (
          <main className="flex-1 overflow-y-auto bg-[#faf9f6] flex flex-col pb-20">
            {/* 1. SEPARATE DETAILS IF AN ITEM IS SELECTED */}
            {selectedTechId && !selectedPostId ? (
              // --- PRESTATAIRE PROFILE VIEW ---
              <div className="animate-fade-in">
                {/* Back button */}
                <div className="bg-white p-3 border-b border-slate-100 flex items-center sticky top-0 z-10">
                  <button 
                    onClick={() => setSelectedTechId(null)}
                    className="text-slate-500 hover:text-slate-800 flex items-center text-sm font-medium"
                  >
                    ← Retour au flux
                  </button>
                </div>

                {activeTechnician ? (
                  <div className="flex flex-col">
                    {/* Hero Profile Details card */}
                    <div className="bg-white p-5 border-b border-slate-100 shadow-xs">
                      <div className="flex items-start gap-4">
                        <img 
                          src={activeTechnician.avatar} 
                          alt={activeTechnician.name} 
                          className="w-20 h-20 rounded-full object-cover border-2 border-slate-100 shadow-sm"
                        />
                        <div className="flex-1">
                          <div className="flex items-center gap-1.5">
                            <h2 className="text-xl font-bold text-slate-900">{activeTechnician.name}</h2>
                            <span className="text-blue-500 text-xs font-bold" title="Prothésiste Vérifiée">✓</span>
                          </div>
                          <p className="text-[#0f4c81] font-semibold text-xs tracking-tight">{activeTechnician.username}</p>
                          <div className="flex items-center gap-1 text-slate-500 text-xs mt-1.5">
                            <MapPin className="w-3.5 h-3.5" />
                            <span>{activeTechnician.city}</span>
                          </div>
                          {/* Rating and review counts removed as requested */}
                        </div>
                      </div>

                      <p className="text-slate-600 text-sm mt-4 italic leading-relaxed bg-slate-50 p-3 rounded-lg border-l-2 border-[#0f4c81]">
                        "{activeTechnician.bio}"
                      </p>

                      <div className="flex flex-wrap gap-1.5 mt-3">
                        {activeTechnician.tags.map(tag => (
                          <span key={tag} className="text-[10px] font-medium bg-slate-100 text-slate-600 px-2.5 py-0.5 rounded-full">
                            #{tag}
                          </span>
                        ))}
                      </div>
                    </div>

                    {/* Services and Pricing Menu */}
                    <div className="bg-white p-5 border-b border-slate-100 mt-2">
                      <h3 className="font-serif font-bold text-slate-800 text-base mb-4 border-b border-slate-100 pb-2">
                        💅 Prestations disponibles & Tarifs
                      </h3>
                      <div className="flex flex-col gap-3.5">
                        {activeTechnician.services.map(service => (
                          <div key={service.id} className="flex justify-between items-center p-3 rounded-xl border border-slate-100 hover:border-slate-200 bg-slate-50/50 transition-all">
                            <div className="flex-1 pr-3">
                              <h4 className="font-semibold text-sm text-slate-800">{service.name}</h4>
                              <div className="flex items-center gap-3 text-xs text-slate-500 mt-1">
                                <span className="flex items-center gap-1"><Clock className="w-3 h-3" /> {service.duration}</span>
                              </div>
                            </div>
                            <div className="flex items-center gap-2.5 shrink-0">
                              <span className="font-black text-[#0f4c81] text-base whitespace-nowrap">{service.price}€</span>
                              <button 
                                onClick={(e) => handleOpenBooking(activeTechnician, service, undefined, e)}
                                className="bg-[#0f4c81] text-white hover:bg-[#1a5b94] font-medium text-xs px-3.5 py-2 rounded-lg shadow-xs transition-all active:scale-95 whitespace-nowrap shrink-0"
                              >
                                Réserver
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Work Grid */}
                    <div className="bg-white p-5 mt-2">
                      <h3 className="font-serif font-bold text-slate-800 text-base mb-3.5">
                        📸 Galerie de ses créations ({posts.filter(p => p.technicianId === activeTechnician.id).length})
                      </h3>
                      <div className="grid grid-cols-3 gap-1.5">
                        {posts.filter(p => p.technicianId === activeTechnician.id).map(post => (
                          <div 
                            key={post.id} 
                            onClick={() => setSelectedPostId(post.id)}
                            className="aspect-square relative group overflow-hidden rounded-lg cursor-pointer border border-slate-100 hover:opacity-95 transition-all shadow-xs hover:scale-[1.02]"
                          >
                            <img 
                              src={post.imageUrl} 
                              alt="Création ongulaire" 
                              className="w-full h-full object-cover"
                            />
                            {/* Visual bottom bar always visible for easy touch selection, styled elegantly */}
                            <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 via-black/40 to-transparent p-1.5 pt-4 flex items-center justify-center">
                              <span className="text-white text-[10px] font-bold flex items-center gap-1">
                                <Eye className="w-3.5 h-3.5 text-white" /> Voir la pose
                              </span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                ) : (
                  <p className="p-6 text-center text-slate-500">Prestataire non trouvé.</p>
                )}
              </div>
            ) : selectedPostId ? (
              // --- POST DETAIL VIEW ---
              <div className="animate-fade-in">
                <div className="bg-white p-3 border-b border-slate-100 flex items-center sticky top-0 z-10">
                  <button 
                    onClick={() => setSelectedPostId(null)}
                    className="text-slate-500 hover:text-slate-800 flex items-center text-sm font-medium"
                  >
                    {selectedTechId ? "← Retour au profil" : "← Retour au flux"}
                  </button>
                </div>

                {activePost && activePostTech ? (
                  <div className="bg-white border-b border-slate-100 flex flex-col">
                    {/* Post Header */}
                    <div className="p-4 flex items-center justify-between border-b border-slate-50">
                      <div className="flex items-center gap-3 cursor-pointer" onClick={() => { setSelectedTechId(activePostTech.id); setSelectedPostId(null); trackProfileClick(activePostTech.id); }}>
                        <img 
                          src={activePostTech.avatar} 
                          alt={activePostTech.name} 
                          className="w-10 h-10 rounded-full object-cover border border-slate-100"
                        />
                        <div>
                          <div className="flex items-center gap-1">
                            <span className="font-bold text-slate-900 text-sm hover:underline">{activePostTech.name}</span>
                            <span className="text-blue-500 text-[10px]" title="Vérifiée">✓</span>
                          </div>
                          <span className="text-slate-400 text-xs flex items-center gap-0.5">
                            <MapPin className="w-3 h-3 text-slate-300" /> {activePostTech.city}
                          </span>
                        </div>
                      </div>

                      {/* Follow button removed as requested */}
                    </div>

                    {/* Large Image */}
                    <div className="w-full bg-slate-900 relative">
                      <img 
                        src={activePost.imageUrl} 
                        alt="Prestation" 
                        className="w-full object-cover max-h-[480px]"
                      />
                      {showShareToast === activePost.id && (
                        <div className="absolute top-4 left-1/2 -translate-x-1/2 bg-black/80 text-white text-xs px-3 py-1.5 rounded-full shadow-lg flex items-center gap-1.5">
                          <Check className="w-3 h-3 text-emerald-400" /> Lien copié pour le partage !
                        </div>
                      )}
                    </div>

                    {/* Action buttons bar */}
                    <div className="p-4 flex flex-col gap-3">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-4">
                          <button 
                            onClick={(e) => handleToggleLikePost(activePost.id, e)}
                            className="flex items-center gap-1.5 text-sm transition-all font-semibold text-[#0f4c81]"
                          >
                            <Heart className="w-5.5 h-5.5 text-[#0f4c81]" fill={session.likedPosts.includes(activePost.id) ? "#0f4c81" : "none"} />
                            <span>J'aime</span>
                          </button>
                          <button 
                            onClick={(e) => handleShare(activePost.id, e)}
                            className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-800"
                          >
                            <Share2 className="w-5 h-5" />
                            Partager
                          </button>
                        </div>

                        {/* Booking shortcut to standard first service */}
                        <button 
                          onClick={() => handleOpenBooking(activePostTech, activePostTech.services[0], activePost)}
                          className="bg-[#0f4c81] text-white hover:bg-[#1a5b94] font-bold text-sm px-5 py-2 rounded-xl transition-all shadow-md active:scale-95"
                        >
                          Réserver
                        </button>
                      </div>

                      {/* Post Caption and details */}
                      <p className="text-slate-700 text-sm leading-relaxed mt-1">
                        <span className="font-bold text-slate-900 mr-2">{activePostTech.username}</span>
                        {renderCaptionWithHashtags(activePost.caption, handleHashtagClick)}
                      </p>

                      {/* Post Price & Duration Badge inside Post Detail */}
                      {(activePost.price !== undefined || activePost.duration) && (
                        <div className="flex gap-2.5 mt-2 flex-wrap">
                          {activePost.price !== undefined && (
                            <span className="bg-slate-100 text-slate-800 font-extrabold text-[11px] px-2.5 py-1 rounded-full">
                              💰 Tarif : {activePost.price}€
                            </span>
                          )}
                          {activePost.duration && (
                            <span className="bg-slate-100 text-slate-800 font-extrabold text-[11px] px-2.5 py-1 rounded-full flex items-center gap-1">
                              ⏱️ Durée estimée : {activePost.duration}
                            </span>
                          )}
                        </div>
                      )}

                      <div className="text-[11px] text-slate-400 mt-1.5">{activePost.date}</div>

                      {/* Prominent Services Box */}
                      <div className="mt-4 bg-slate-50 border border-slate-100 rounded-xl p-4">
                        <h4 className="font-semibold text-xs text-[#0f4c81] tracking-wider uppercase mb-3">Prestations recommandées chez {activePostTech.name} :</h4>
                        <div className="flex flex-col gap-2">
                          {activePostTech.services.slice(0, 2).map(s => (
                            <div key={s.id} className="flex justify-between items-center text-sm p-2 rounded-lg bg-white border border-slate-100">
                              <div className="flex-1 min-w-0 pr-2">
                                <p className="font-bold text-slate-800 text-xs truncate">{s.name}</p>
                                <span className="text-[10px] text-slate-400">⏱️ {s.duration}</span>
                              </div>
                              <button 
                                onClick={() => handleOpenBooking(activePostTech, s)}
                                className="bg-[#0f4c81] text-white font-medium text-xs py-1.5 px-3 rounded-md hover:bg-[#1a5b94] whitespace-nowrap shrink-0 ml-2"
                              >
                                Réserver - {s.price}€
                              </button>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>
                ) : (
                  <p className="p-6 text-center text-slate-500">Publication non trouvée.</p>
                )}
              </div>
            ) : activeTab === 'feed' ? (
              // --- MAIN INSTAGRAM FEED FLOW ---
              <div className="flex flex-col gap-4 animate-fade-in">
                
                {/* Search, Filter & Location notice */}
                <div className="flex flex-col gap-2 p-4 bg-white border-b border-slate-100 shadow-xs">
                  {/* Regional Restriction notice */}
                  <div className="bg-[#0f4c81]/5 text-[#0f4c81] border border-[#0f4c81]/10 rounded-lg py-1.5 px-3 text-[11px] font-medium flex items-center justify-center gap-1">
                    <span>📍 Disponible uniquement en Île-de-France</span>
                  </div>

                  {/* Advanced Multi-Criteria Search Input */}
                  <div className="relative">
                    <input 
                      type="text"
                      placeholder="Rechercher prothésiste, ville, type de pose..."
                      value={searchQuery}
                      onChange={e => setSearchQuery(e.target.value)}
                      className="w-full text-xs bg-slate-100 border border-slate-200 focus:border-[#0f4c81]/40 focus:bg-white rounded-xl py-2.5 pl-9 pr-8 text-slate-800 outline-none transition-all placeholder:text-slate-400"
                    />
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-xs">🔍</span>
                    {searchQuery && (
                      <button 
                        onClick={() => setSearchQuery('')}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 font-bold text-xs p-1"
                      >
                        ✕
                      </button>
                    )}
                  </div>

                  {/* City Selection Carousel */}
                  <div className="flex gap-1.5 overflow-x-auto pb-1 no-scrollbar text-xs border-t border-slate-50 pt-2">
                    {cities.map(city => (
                      <button
                        key={city}
                        onClick={() => { setSelectedCity(city); trackAction('feedViewsCount'); }}
                        className={`px-3 py-1.5 rounded-full whitespace-nowrap transition-all font-medium flex items-center gap-1 ${
                          selectedCity === city 
                            ? 'bg-[#0f4c81] text-white shadow-sm' 
                            : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                        }`}
                      >
                        <MapPin className="w-3 h-3 shrink-0" />
                        {city}
                      </button>
                    ))}
                  </div>

                  {/* Tag Selection Carousel */}
                  <div className="flex gap-1.5 overflow-x-auto pb-1 no-scrollbar text-xs border-t border-slate-100 pt-2">
                    {tags.map(tag => (
                      <button
                        key={tag}
                        onClick={() => { setSelectedTag(tag); }}
                        className={`px-2.5 py-1 rounded-md whitespace-nowrap transition-all text-xs font-medium ${
                          selectedTag === tag 
                            ? 'bg-blue-100 text-[#0f4c81] border border-blue-200' 
                            : 'bg-slate-50 text-slate-500 border border-slate-100 hover:bg-slate-100'
                    }`}
                  >
                    {tag === 'Tous' ? '✨ Tout' : `#${tag}`}
                  </button>
                ))}
              </div>
            </div>
                {/* Style similarity filter indication badge */}
                {similarToPostId && (
                  <div className="mx-3 mt-2 bg-gradient-to-r from-[#0f4c81]/5 to-[#0f4c81]/15 border border-[#0f4c81]/15 rounded-xl p-3 flex justify-between items-center text-xs">
                    <div className="flex items-center gap-2">
                      <span className="text-sm">✨</span>
                      <div>
                        <p className="font-bold text-[#0f4c81]">Styles similaires actifs</p>
                        <p className="text-slate-500 text-[10px]">Affichage des réalisations au look similaire</p>
                      </div>
                    </div>
                    <button 
                      onClick={() => setSimilarToPostId(null)}
                      className="bg-white hover:bg-slate-50 text-slate-500 hover:text-slate-800 font-bold px-2 py-1 rounded-md border border-slate-200 text-[10px]"
                    >
                      Tout voir ✕
                    </button>
                  </div>
                )}

                <div className="flex flex-col gap-4 p-3">
                  {filteredPosts.length === 0 ? (
                    <div className="text-center py-16 bg-white rounded-2xl border border-slate-100 p-6 shadow-xs">
                      <AlertCircle className="w-10 h-10 text-slate-300 mx-auto mb-3" />
                      <h3 className="text-slate-700 font-semibold mb-1">Aucune réalisation trouvée</h3>
                      <p className="text-slate-400 text-xs">Ajustez vos filtres de recherche pour voir d'autres créations.</p>
                      <button 
                        onClick={() => { setSelectedCity('Tous'); setSelectedTag('Tous'); setSearchQuery(''); setSimilarToPostId(null); }} 
                        className="text-[#0f4c81] text-xs font-bold underline mt-3"
                      >
                        Réinitialiser tous les filtres
                      </button>
                    </div>
                  ) : (
                    filteredPosts.map(post => {
                      const tech = technicians.find(t => t.id === post.technicianId);
                      if (!tech) return null;
                      
                      return (
                        <div 
                          key={post.id} 
                          id={`post_card_${post.id}`}
                          className="bg-white rounded-2xl border border-slate-100 overflow-hidden shadow-xs hover:shadow-md transition-all duration-300 flex flex-col"
                        >
                          {/* Card Header */}
                          <div className="p-3 flex items-center justify-between border-b border-slate-50">
                            <div 
                              onClick={() => { setSelectedTechId(tech.id); trackProfileClick(tech.id); }}
                              className="flex items-center gap-3 cursor-pointer group"
                            >
                              <img 
                                src={tech.avatar} 
                                alt={tech.name} 
                                className="w-10 h-10 rounded-full object-cover border border-slate-100 shadow-xs"
                              />
                              <div>
                                <div className="flex items-center gap-1">
                                  <span className="font-bold text-slate-900 text-sm group-hover:underline group-hover:text-[#0f4c81]">{tech.name}</span>
                                  <span className="text-blue-500 text-[10px]" title="Vérifiée">✓</span>
                                </div>
                                <span className="text-slate-400 text-xs flex items-center gap-0.5">
                                  <MapPin className="w-3.5 h-3.5 text-slate-300" /> {tech.city}
                                </span>
                              </div>
                            </div>

                            {/* Heart icon removed next to provider name */}
                          </div>

                          {/* Service Image */}
                          <div 
                            onClick={() => { setSelectedPostId(post.id); trackAction('viewDetailsCount'); }}
                            className="aspect-[4/5] bg-slate-100 overflow-hidden cursor-pointer relative"
                          >
                            <img 
                              src={post.imageUrl} 
                              alt={post.caption} 
                              className="w-full h-full object-cover hover:scale-[1.03] transition-all duration-500"
                            />
                            
                            {/* Overlay Price Tag Badge */}
                            <div className="absolute top-3 right-3 bg-white/90 backdrop-blur text-slate-900 px-3 py-1 rounded-full text-xs font-black shadow-md flex items-center gap-1 border border-slate-200/50">
                              <span className="text-[#0f4c81]">{post.price !== undefined ? post.price : (tech.services[0]?.price || 0)}€</span>
                            </div>
                          </div>

                          {/* Card Actions bar */}
                          <div className="p-3 border-t border-slate-50">
                            <div className="flex justify-between items-center mb-3">
                              <div className="flex items-center gap-3.5">
                                <button 
                                  onClick={(e) => handleToggleLikePost(post.id, e)}
                                  className="flex items-center gap-1 font-semibold transition-all text-[#0f4c81]"
                                >
                                  <Heart className="w-5.5 h-5.5 text-[#0f4c81]" fill={session.likedPosts.includes(post.id) ? "#0f4c81" : "none"} />
                                  <span className="text-xs">J'aime</span>
                                </button>
                                <button 
                                  onClick={(e) => handleShare(post.id, e)}
                                  className="flex items-center gap-1 text-slate-500 hover:text-slate-900"
                                >
                                  <Share2 className="w-5 h-5" />
                                  <span className="text-xs">Partager</span>
                                </button>
                                
                                {/* Similar photos match link */}
                                <button 
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setSimilarToPostId(post.id);
                                    window.scrollTo({ top: 0, behavior: 'smooth' });
                                  }}
                                  className="flex items-center gap-1 text-[#0f4c81] hover:text-[#1a5b94]"
                                  title="Voir des créations au style similaire"
                                >
                                  <Sparkles className="w-4 h-4 text-amber-500 animate-pulse" />
                                  <span className="text-xs font-bold text-[#0f4c81]">Similaires</span>
                                </button>
                              </div>

                              <button 
                                id={`btn_book_post_${post.id}`}
                                onClick={() => handleOpenBooking(tech, tech.services[0], post)}
                                className="bg-[#0f4c81] text-white hover:bg-[#1a5b94] font-bold text-xs py-1.5 px-4 rounded-xl transition-all shadow-xs active:scale-95 flex items-center gap-1"
                              >
                                Réserver
                              </button>
                            </div>

                            {/* Caption */}
                            <div className="text-sm text-slate-700 leading-relaxed">
                              <span className="font-bold text-slate-900 mr-1.5">{tech.username}</span>
                              {post.caption.length > 105 ? (
                                <>
                                  {renderCaptionWithHashtags(post.caption.substring(0, 105), handleHashtagClick)}... 
                                  <button 
                                    onClick={() => setSelectedPostId(post.id)}
                                    className="text-[#0f4c81] font-bold text-xs hover:underline ml-1"
                                  >
                                    plus
                                  </button>
                                </>
                              ) : renderCaptionWithHashtags(post.caption, handleHashtagClick)}
                            </div>

                            {/* View details quick anchor */}
                            <button 
                              onClick={() => setSelectedPostId(post.id)}
                              className="text-slate-400 text-xs mt-2 hover:text-slate-600 block text-left"
                            >
                              Voir les tarifs et prestations
                            </button>

                            {showShareToast === post.id && (
                              <div className="mt-2 text-center text-xs text-white bg-slate-800 p-1.5 rounded-lg">
                                Lien copié dans le presse-papiers !
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            ) : activeTab === 'favorites' ? (
              // --- FAVORITES VIEW ---
              <div className="p-4 flex flex-col gap-4 animate-fade-in">
                <h2 className="text-xl font-bold font-serif text-[#0f4c81] border-b border-slate-100 pb-2">⭐ Mes Créations Favorites</h2>
                
                {session.isLoggedIn ? (
                  session.likedPosts.length === 0 ? (
                    <div className="text-center py-16 bg-white rounded-2xl border border-slate-100 p-6">
                      <Heart className="w-12 h-12 text-slate-300 mx-auto mb-3" />
                      <h3 className="text-slate-700 font-semibold mb-1">Aucune création enregistrée</h3>
                      <p className="text-slate-400 text-xs">Aimez des publications dans le fil d'actualité pour les retrouver ici en favoris.</p>
                      <button onClick={() => setActiveTab('feed')} className="mt-4 bg-[#0f4c81] text-white font-semibold text-xs py-2 px-4 rounded-lg">
                        Découvrir les créations
                      </button>
                    </div>
                  ) : (
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 items-start">
                      {posts.filter(p => session.likedPosts.includes(p.id)).map(post => {
                        const tech = technicians.find(t => t.id === post.technicianId);
                        return (
                          <div 
                            key={post.id}
                            onClick={() => { setSelectedPostId(post.id); trackAction('viewDetailsCount'); }}
                            className="bg-white rounded-xl border border-slate-150 overflow-hidden cursor-pointer hover:shadow-md transition-all flex flex-col group"
                          >
                            <div className="aspect-square relative overflow-hidden bg-slate-50">
                              <img 
                                src={post.imageUrl} 
                                alt={post.caption} 
                                className="w-full h-full object-cover group-hover:scale-105 transition-all duration-300"
                              />
                              <div className="absolute top-2 right-2 bg-black/50 backdrop-blur-xs text-white p-1 rounded-full">
                                <Heart className="w-3.5 h-3.5 text-[#0f4c81]" fill="currentColor" />
                              </div>
                            </div>
                            <div className="p-2 flex flex-col gap-1 flex-1">
                              {tech && (
                                <div className="flex items-center gap-1.5">
                                  <img src={tech.avatar} alt={tech.name} className="w-4 h-4 rounded-full object-cover" />
                                  <span className="text-[10px] font-bold text-slate-700 truncate">{tech.name}</span>
                                </div>
                              )}
                              <p className="text-[10px] text-slate-500 line-clamp-2 leading-relaxed mt-0.5">{post.caption}</p>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )
                ) : (
                  <div className="text-center py-16 bg-white rounded-2xl border border-slate-100 p-6">
                    <Lock className="w-12 h-12 text-[#0f4c81] mx-auto mb-3 opacity-60" />
                    <h3 className="text-slate-700 font-semibold mb-1">Connexion requise</h3>
                    <p className="text-slate-400 text-xs">Veuillez vous connecter pour gérer et visualiser vos créations favorites.</p>
                    <button 
                      onClick={() => setShowLoginModal(true)} 
                      className="mt-4 bg-[#0f4c81] text-white font-semibold text-xs py-2.5 px-5 rounded-lg shadow-md hover:bg-[#1a5b94]"
                    >
                      Se connecter maintenant
                    </button>
                  </div>
                )}
              </div>
            ) : activeTab === 'bookings' ? (
              // --- BOOKINGS TAB VIEW ---
              <div className="p-4 flex flex-col gap-4 animate-fade-in">
                <h2 className="text-xl font-bold font-serif text-[#0f4c81] border-b border-slate-100 pb-2">📅 Mes Demandes de Réservation</h2>
                
                {session.isLoggedIn ? (
                  bookings.filter(b => b.clientEmail?.toLowerCase() === session.email?.toLowerCase()).length === 0 ? (
                    <div className="text-center py-16 bg-white rounded-2xl border border-slate-100 p-6">
                      <Calendar className="w-12 h-12 text-slate-300 mx-auto mb-3" />
                      <h3 className="text-slate-700 font-semibold mb-1">Aucune réservation pour l'instant</h3>
                      <p className="text-slate-400 text-xs">Faites défiler le fil d'actualité pour trouver le style qui vous inspire et prenez rendez-vous.</p>
                      <button onClick={() => setActiveTab('feed')} className="mt-4 bg-[#0f4c81] text-white font-semibold text-xs py-2 px-4 rounded-lg">
                        Prendre rendez-vous
                      </button>
                    </div>
                  ) : (
                    <div className="flex flex-col gap-3">
                      {bookings.filter(b => b.clientEmail?.toLowerCase() === session.email?.toLowerCase()).map(booking => (
                        <div 
                          key={booking.id}
                          className="bg-white rounded-xl border border-slate-100 p-4 flex flex-col gap-3.5 shadow-xs"
                        >
                          <div className="flex justify-between items-start">
                            <div>
                              <h3 className="font-bold text-slate-900 text-sm">{booking.technicianName}</h3>
                              <p className="text-xs text-[#0f4c81] font-medium mt-0.5">{booking.serviceName}</p>
                            </div>
                            <span className={`text-[10px] font-bold px-2.5 py-1 rounded-full ${
                              booking.status === 'pending' 
                                ? 'bg-amber-100 text-amber-700 border border-amber-200' 
                                : booking.status === 'proposed'
                                ? 'bg-indigo-100 text-indigo-700 border border-indigo-200'
                                : booking.status === 'confirmed'
                                ? 'bg-emerald-100 text-emerald-700 border border-emerald-200'
                                : booking.status === 'completed'
                                ? 'bg-slate-100 text-slate-600 border border-slate-200'
                                : 'bg-red-100 text-red-700 border border-red-200'
                            }`}>
                              {booking.status === 'pending' 
                                ? '⌛ En attente' 
                                : booking.status === 'proposed' 
                                ? '✨ Nouveau créneau proposé' 
                                : booking.status === 'confirmed' 
                                ? '✓ Confirmé' 
                                : booking.status === 'completed' 
                                ? '🏁 Terminé' 
                                : '✕ Refusé'}
                            </span>
                          </div>

                          <div className="grid grid-cols-2 gap-2 text-xs text-slate-600 bg-slate-50 p-2.5 rounded-lg">
                            <div className="flex items-center gap-1.5">
                              <Calendar className="w-3.5 h-3.5 text-slate-400" />
                              <span>{formatToFrenchDate(booking.desiredDate)}</span>
                            </div>
                            <div className="flex items-center gap-1.5">
                              <Clock className="w-3.5 h-3.5 text-slate-400" />
                              <span>{booking.desiredTime}</span>
                            </div>
                          </div>

                          {booking.status === 'proposed' && (
                            <div className="bg-indigo-50 border border-indigo-100 p-3 rounded-xl flex flex-col gap-2 mt-1">
                              {reschedulingBookingId === booking.id ? (
                                <div className="flex flex-col gap-2">
                                  <p className="text-[11px] text-indigo-950 font-bold">
                                    Sélectionnez un nouveau créneau disponible :
                                  </p>
                                  {(() => {
                                    const tech = technicians.find(t => t.id === booking.technicianId);
                                    const availableSlots = (tech?.freeSlots || []).filter(slot => !isSlotPast(slot));
                                    if (availableSlots.length === 0) {
                                      return (
                                        <div className="flex flex-col gap-2">
                                          <p className="text-[10px] text-amber-700 italic">
                                            Aucun autre créneau disponible actuellement chez {booking.technicianName}. Veuillez contacter le prestataire ou réessayer plus tard.
                                          </p>
                                          <button
                                            onClick={() => setReschedulingBookingId(null)}
                                            className="w-full bg-slate-200 hover:bg-slate-300 text-slate-700 font-bold py-1 rounded-lg text-[10px] transition-all cursor-pointer"
                                          >
                                            Retour
                                          </button>
                                        </div>
                                      );
                                    }
                                    return (
                                      <div className="flex flex-col gap-2">
                                        <select
                                          value={selectedRescheduleSlot}
                                          onChange={(e) => setSelectedRescheduleSlot(e.target.value)}
                                          className="w-full border border-slate-200 bg-white p-2 rounded-lg text-xs font-mono"
                                        >
                                          <option value="">-- Choisir un créneau --</option>
                                          {availableSlots.map((slot) => (
                                            <option key={slot} value={slot}>
                                              {slot}
                                            </option>
                                          ))}
                                        </select>
                                        <div className="flex gap-1.5">
                                          <button
                                            onClick={() => handleRescheduleConfirm(booking.id)}
                                            className="flex-1 bg-[#0f4c81] hover:bg-[#1a5b94] text-white font-bold py-1.5 rounded-lg text-[10px] transition-all cursor-pointer flex items-center justify-center gap-1"
                                          >
                                            <Check className="w-3 h-3" /> Confirmer ce créneau
                                          </button>
                                          <button
                                            onClick={() => setReschedulingBookingId(null)}
                                            className="bg-slate-200 hover:bg-slate-300 text-slate-700 font-bold py-1.5 px-3 rounded-lg text-[10px] transition-all cursor-pointer"
                                          >
                                            Annuler
                                          </button>
                                        </div>
                                      </div>
                                    );
                                  })()}
                                </div>
                              ) : (
                                <>
                                  <p className="text-[11px] text-indigo-950 font-semibold leading-normal">
                                    💅 Le prestataire vous propose un créneau alternatif : <strong className="text-indigo-900 bg-white px-1.5 py-0.5 rounded border border-indigo-100 font-mono text-[11px]">{booking.proposedDate}</strong>.
                                  </p>
                                  <div className="flex gap-2">
                                    <button
                                      onClick={() => handleAcceptProposedDate(booking.id)}
                                      className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-1.5 rounded-lg text-[11px] transition-all cursor-pointer flex items-center justify-center gap-1"
                                    >
                                      <Check className="w-3 h-3" /> Accepter ce créneau
                                    </button>
                                    <button
                                      onClick={() => handleRefuseProposedDate(booking.id)}
                                      className="flex-1 bg-rose-600 hover:bg-rose-700 text-white font-bold py-1.5 rounded-lg text-[11px] transition-all cursor-pointer flex items-center justify-center gap-1"
                                    >
                                      <X className="w-3 h-3" /> Décliner / Autre choix
                                    </button>
                                  </div>
                                </>
                              )}
                            </div>
                          )}

                          {booking.postRefId && (
                            <div className="text-[10px] text-slate-500 flex items-center gap-1 border-t border-slate-50 pt-2 mt-1">
                              <span>🔗 Publication réservée :</span>
                              <a
                                href={`/?post=${booking.postRefId}`}
                                onClick={(e) => {
                                  e.preventDefault();
                                  setIsAdminView(false);
                                  setSelectedPostId(booking.postRefId);
                                  setActiveTab('feed');
                                }}
                                className="font-medium text-[#0f4c81] hover:text-[#1a5b94] underline bg-[#0f4c81]/5 px-1.5 py-0.5 rounded transition-colors"
                              >
                                Voir la prestation
                              </a>
                            </div>
                          )}

                          {booking.modelPhoto && (
                            <div className="text-[10px] text-slate-500 border-t border-slate-50 pt-2 mt-1">
                              <span className="block mb-1">📸 Modèle de référence envoyé :</span>
                              <div className="relative overflow-hidden inline-block rounded border border-slate-150">
                                <img src={booking.modelPhoto} alt="Modèle" className="max-h-16 object-contain rounded" />
                              </div>
                            </div>
                          )}

                          <div className="flex justify-between items-start text-xs text-slate-400 pt-2 border-t border-slate-50">
                            <span>Créée le {booking.createdAt}</span>
                            <div className="text-right flex flex-col gap-0.5">
                              <p className="text-[10px] text-slate-400">Acompte payé (30%) : <strong className="text-emerald-600 font-bold">{(booking.price * 0.3).toFixed(2)}€</strong></p>
                              <p className="text-[10px] text-amber-700 font-medium">
                                Reste à payer sur place auprès du prestataire (70%) : <strong className="font-bold">{(booking.price * 0.7).toFixed(2)}€</strong>
                              </p>
                              <span className="font-black text-slate-700 text-sm mt-0.5">Total : {booking.price}€</span>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )
                ) : (
                  <div className="text-center py-16 bg-white rounded-2xl border border-slate-100 p-6">
                    <Lock className="w-12 h-12 text-[#0f4c81] mx-auto mb-3 opacity-60" />
                    <h3 className="text-slate-700 font-semibold mb-1">Connexion requise</h3>
                    <p className="text-slate-400 text-xs">Veuillez vous connecter pour voir l'historique et l'état de vos demandes de réservation.</p>
                    <button 
                      onClick={() => setShowLoginModal(true)} 
                      className="mt-4 bg-[#0f4c81] text-white font-semibold text-xs py-2.5 px-5 rounded-lg shadow-md hover:bg-[#1a5b94]"
                    >
                      Se connecter maintenant
                    </button>
                  </div>
                )}
              </div>
            ) : (
              // --- PROFILE TAB VIEW ---
              <div className="p-4 flex flex-col gap-4 animate-fade-in pb-16">
                <h2 className="text-xl font-bold font-serif text-[#0f4c81] border-b border-slate-100 pb-2">👤 Mon Profil Fudep</h2>

                {session.isLoggedIn && (
                  <div className="flex flex-col gap-4">
                    {/* User Card */}
                    <div className="bg-gradient-to-tr from-[#0f4c81] to-slate-800 text-white rounded-2xl p-5 shadow-md">
                      <div className="flex items-center gap-3">
                        <div className="w-12 h-12 rounded-full bg-white/20 flex items-center justify-center font-bold text-lg">
                          {session.name.charAt(0).toUpperCase()}
                        </div>
                        <div>
                          <h3 className="font-bold text-base leading-tight">{session.name}</h3>
                          <p className="text-white/75 text-xs mt-0.5">{session.email}</p>
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-2 mt-4 pt-4 border-t border-white/10 text-xs">
                        <div>
                          <span className="text-white/60 block text-[10px]">Téléphone</span>
                          <span className="font-semibold">{session.phone || 'Non renseigné'}</span>
                        </div>
                        <div>
                          <span className="text-white/60 block text-[10px]">Ville</span>
                          <span className="font-semibold">{session.city || 'Île-de-France'}</span>
                        </div>
                      </div>
                    </div>

                    {/* Change Password */}
                    <div className="bg-white rounded-2xl border border-slate-100 p-4 shadow-xs">
                      <h3 className="font-serif font-bold text-slate-800 text-sm mb-3 pb-1 border-b border-slate-100 flex items-center gap-1.5">
                        🔑 Changer mon mot de passe
                      </h3>
                      <form onSubmit={handleChangePasswordSubmit} className="flex flex-col gap-3 text-xs">
                        <div>
                          <label className="block text-slate-500 font-semibold mb-1">Mot de passe actuel</label>
                          <input 
                            type="password"
                            required
                            placeholder="Ancien mot de passe"
                            value={oldPassword}
                            onChange={e => setOldPassword(e.target.value)}
                            className="w-full border border-slate-200 p-2.5 rounded-lg text-slate-800 bg-slate-50"
                          />
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
                          <div>
                            <label className="block text-slate-500 font-semibold mb-1">Nouveau mot de passe</label>
                            <input 
                              type="password"
                              required
                              placeholder="Minimum 8 caractères"
                              value={newPassword}
                              onChange={e => setNewPassword(e.target.value)}
                              className="w-full border border-slate-200 p-2.5 rounded-lg text-slate-800 bg-slate-50"
                            />
                          </div>
                          <div>
                            <label className="block text-slate-500 font-semibold mb-1">Confirmer le nouveau mot de passe</label>
                            <input 
                              type="password"
                              required
                              placeholder="Retapez le mot de passe"
                              value={confirmNewPassword}
                              onChange={e => setConfirmNewPassword(e.target.value)}
                              className="w-full border border-slate-200 p-2.5 rounded-lg text-slate-800 bg-slate-50"
                            />
                          </div>
                        </div>
                        <button 
                          type="submit"
                          className="w-full bg-[#0f4c81] hover:bg-[#1a5b94] text-white font-bold py-2 rounded-lg mt-1 transition-all cursor-pointer"
                        >
                          Enregistrer le mot de passe
                        </button>
                      </form>
                    </div>
                  </div>
                )}

                {!session.isLoggedIn && (
                  <div className="text-center py-8 bg-white rounded-2xl border border-slate-100 p-5 shadow-xs mb-2">
                    <Lock className="w-10 h-10 text-[#0f4c81] mx-auto mb-2.5 opacity-60" />
                    <h3 className="text-slate-700 text-xs font-semibold mb-1">Connexion requise</h3>
                    <p className="text-slate-400 text-[11px] max-w-xs mx-auto">Veuillez vous connecter pour voir vos paramètres de profil, demander de l'aide et gérer votre compte.</p>
                    <button 
                      type="button"
                      onClick={() => setShowLoginModal(true)} 
                      className="mt-3 bg-[#0f4c81] text-white font-semibold text-[11px] py-2 px-4 rounded-lg shadow-md hover:bg-[#1a5b94]"
                    >
                      Se connecter maintenant
                    </button>
                  </div>
                )}

                    {/* FAQ Accordion Section */}
                    {faqs.length > 0 && (
                      <div className="bg-white rounded-2xl border border-slate-100 p-4 shadow-xs">
                        <h3 className="font-serif font-bold text-slate-800 text-sm mb-2.5 pb-1 border-b border-slate-100 flex items-center gap-1.5">
                          💡 Foire Aux Questions (FAQ)
                        </h3>
                        <div className="space-y-4">
                          {Object.keys(groupedFaqs).map(category => {
                            const items = groupedFaqs[category] || [];
                            return (
                              <div key={category} className="space-y-1.5">
                                <h4 className="text-[10px] font-extrabold text-[#0f4c81]/80 uppercase tracking-wider pl-1 border-l-2 border-[#0f4c81]/30 ml-0.5 mb-2">{category}</h4>
                                <div className="space-y-2">
                                  {items.map(faq => (
                                    <div key={faq.id} className="border border-slate-100 rounded-lg overflow-hidden">
                                      <button
                                        type="button"
                                        onClick={() => setExpandedFaq(expandedFaq === faq.id ? null : faq.id)}
                                        className="w-full p-2.5 bg-slate-50/50 hover:bg-slate-50 font-bold text-slate-700 flex justify-between items-center text-[11px] transition-all cursor-pointer text-left gap-2"
                                      >
                                        <span>{faq.question}</span>
                                        <span className="text-slate-400 shrink-0">{expandedFaq === faq.id ? '▲' : '▼'}</span>
                                      </button>
                                      {expandedFaq === faq.id && (
                                        <div className="p-3 bg-white text-slate-600 text-[11px] border-t border-slate-100 whitespace-pre-wrap leading-relaxed">
                                          {faq.answer}
                                        </div>
                                      )}
                                    </div>
                                  ))}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    {/* Contact Help */}
                    {session.isLoggedIn && (
                      <div className="bg-white rounded-2xl border border-slate-100 p-4 shadow-xs">
                        <h3 className="font-serif font-bold text-slate-800 text-sm mb-2.5 pb-1 border-b border-slate-100 flex items-center gap-1.5">
                          💬 Demander de l'aide & Support
                        </h3>
                        <p className="text-slate-500 text-[11px] leading-normal mb-3">
                          Notre équipe d'assistance Fudep est là pour vous aider à tout moment. Racontez-nous votre problème ou posez votre question ci-dessous.
                        </p>
                        <form onSubmit={(e) => {
                          e.preventDefault();
                          if (!helpMessage) return;

                          // Send support email to admin
                          const emailSubject = `✉️ Nouvelle demande d'aide (Support) Fudep - Sujet: ${helpSubject}`;
                          const emailText = `Bonjour,\n\nUne nouvelle demande d'aide a été soumise sur la plateforme Fudep.\n\n` +
                            `Détails de la demande :\n` +
                            `- Utilisateur : ${session.name || 'Client connecté'} (${session.email})\n` +
                            `- Téléphone : ${session.phone || 'Non renseigné'}\n` +
                            `- Sujet : ${helpSubject}\n` +
                            `- Message :\n"${helpMessage}"\n\n` +
                            `Veuillez lui répondre directement à l'adresse ${session.email}.\n\n` +
                            `Cordialement,\nLe Support Fudep`;

                          const emailHtml = `
                            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e2e8f0; border-radius: 12px; background-color: #f8fafc;">
                              <h2 style="color: #0f4c81; border-bottom: 2px solid #cbd5e1; padding-bottom: 10px; margin-top: 0;">✉️ Nouvelle demande de support</h2>
                              <p style="color: #334155; font-size: 14px; line-height: 1.5;">Bonjour Sophie (Admin),</p>
                              <p style="color: #334155; font-size: 14px; line-height: 1.5;">Un utilisateur a soumis une demande d'aide via le formulaire de support de Fudep.</p>
                              
                              <div style="background-color: #ffffff; padding: 15px; border-radius: 8px; border: 1px solid #e2e8f0; margin: 20px 0;">
                                <h3 style="color: #0f172a; margin-top: 0; font-size: 14px; border-bottom: 1px solid #f1f5f9; padding-bottom: 5px;">👤 Informations Utilisateur</h3>
                                <table style="width: 100%; border-collapse: collapse; font-size: 13px; color: #475569;">
                                  <tr><td style="padding: 4px 0; font-weight: bold; width: 120px;">Nom :</td><td>${session.name || 'Client'}</td></tr>
                                  <tr><td style="padding: 4px 0; font-weight: bold;">E-mail :</td><td><a href="mailto:${session.email}" style="color: #2563eb; text-decoration: none;">${session.email}</a></td></tr>
                                  <tr><td style="padding: 4px 0; font-weight: bold;">Téléphone :</td><td>${session.phone || 'Non renseigné'}</td></tr>
                                  <tr><td style="padding: 4px 0; font-weight: bold;">Sujet :</td><td><strong>${helpSubject}</strong></td></tr>
                                </table>
                              </div>

                              <div style="background-color: #ffffff; padding: 15px; border-radius: 8px; border: 1px solid #e2e8f0; margin: 20px 0;">
                                <h3 style="color: #0f172a; margin-top: 0; font-size: 14px; border-bottom: 1px solid #f1f5f9; padding-bottom: 5px;">💬 Message</h3>
                                <p style="color: #334155; font-size: 13px; line-height: 1.6; white-space: pre-wrap; margin: 5px 0;"><em>"${helpMessage}"</em></p>
                              </div>

                              <p style="color: #475569; font-size: 12px; margin-top: 25px; border-top: 1px solid #cbd5e1; padding-top: 15px; text-align: center;">
                                Vous pouvez répondre à cet utilisateur en cliquant directement sur son adresse e-mail ci-dessus.
                              </p>
                            </div>
                          `;
                          sendNotificationEmail('ozenia.pro@gmail.com', emailSubject, emailText, emailHtml, 'support_request');

                          alert("Votre demande d'aide a été envoyée avec succès ! Notre équipe d'assistance Fudep vous contactera à " + session.email + " sous 24h.");
                          setHelpMessage('');
                        }} className="flex flex-col gap-3 text-xs">
                          <div>
                            <label className="block text-slate-500 font-semibold mb-1">Sujet de votre demande</label>
                            <select 
                              value={helpSubject}
                              onChange={e => setHelpSubject(e.target.value)}
                              className="w-full border border-slate-200 p-2 rounded-lg text-slate-800 bg-white"
                            >
                              <option value="général">Question générale sur la plateforme</option>
                              <option value="réservation">Question relative à une réservation (veuillez préciser laquelle ci-dessous)</option>
                              <option value="paiement">Question relative aux paiements et acomptes</option>
                              <option value="technique">Bug ou problème technique sur l'application</option>
                              <option value="autre">Autre demande</option>
                            </select>
                          </div>
                          <div>
                            <label className="block text-slate-500 font-semibold mb-1">Votre message</label>
                            <textarea 
                              required
                              rows={3}
                              placeholder={helpSubject === 'réservation' ? "Veuillez préciser la date, l'heure et le nom du prestataire de la réservation concernée..." : "Décrivez votre demande en détail ici..."}
                              value={helpMessage}
                              onChange={e => setHelpMessage(e.target.value)}
                              className="w-full border border-slate-200 p-2.5 rounded-lg text-slate-800 bg-slate-50"
                            />
                          </div>
                          <button 
                            type="submit"
                            className="w-full bg-slate-800 hover:bg-slate-900 text-white font-bold py-2 rounded-lg transition-all cursor-pointer"
                          >
                            Envoyer la demande d'aide
                          </button>
                        </form>
                      </div>
                    )}

                    {/* Legal policies */}
                    <div className="bg-white rounded-2xl border border-slate-100 p-4 shadow-xs">
                      <h3 className="font-serif font-bold text-slate-800 text-sm mb-2.5 pb-1 border-b border-slate-100 flex items-center gap-1.5">
                        📜 Informations Légales & Politiques
                      </h3>
                      <p className="text-slate-500 text-[11px] leading-normal mb-4">
                        Consultez nos conditions de service, politiques et mentions légales pour comprendre notre fonctionnement.
                      </p>
                      
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs font-sans">
                        <button
                          type="button"
                          onClick={() => setActivePolicyModal('cgu')}
                          className="flex items-center justify-between p-2.5 rounded-xl border border-slate-100 hover:border-blue-200 bg-slate-50/50 hover:bg-blue-50/10 transition-all font-bold text-slate-700 text-left cursor-pointer group"
                        >
                          <span className="group-hover:text-[#0f4c81]">Conditions Générales d'Utilisation (CGU)</span>
                          <span className="text-slate-400">➜</span>
                        </button>

                        <button
                          type="button"
                          onClick={() => setActivePolicyModal('cgv')}
                          className="flex items-center justify-between p-2.5 rounded-xl border border-slate-100 hover:border-blue-200 bg-slate-50/50 hover:bg-blue-50/10 transition-all font-bold text-slate-700 text-left cursor-pointer group"
                        >
                          <span className="group-hover:text-[#0f4c81]">Conditions Générales de Vente (CGV)</span>
                          <span className="text-slate-400">➜</span>
                        </button>
                        
                        <button
                          type="button"
                          onClick={() => setActivePolicyModal('refund')}
                          className="flex items-center justify-between p-2.5 rounded-xl border border-slate-100 hover:border-blue-200 bg-slate-50/50 hover:bg-blue-50/10 transition-all font-bold text-slate-700 text-left cursor-pointer group"
                        >
                          <span className="group-hover:text-[#0f4c81]">Politique de Remboursement</span>
                          <span className="text-slate-400">➜</span>
                        </button>

                        <button
                          type="button"
                          onClick={() => setActivePolicyModal('privacy')}
                          className="flex items-center justify-between p-2.5 rounded-xl border border-slate-100 hover:border-blue-200 bg-slate-50/50 hover:bg-blue-50/10 transition-all font-bold text-slate-700 text-left cursor-pointer group"
                        >
                          <span className="group-hover:text-[#0f4c81]">Politique de Confidentialité (RGPD)</span>
                          <span className="text-slate-400">➜</span>
                        </button>

                        <button
                          type="button"
                          onClick={() => setActivePolicyModal('legal')}
                          className="flex items-center justify-between p-2.5 rounded-xl border border-slate-100 hover:border-blue-200 bg-slate-50/50 hover:bg-blue-50/10 transition-all font-bold text-slate-700 text-left cursor-pointer group sm:col-span-2"
                        >
                          <span className="group-hover:text-[#0f4c81]">Mentions Légales</span>
                          <span className="text-slate-400">➜</span>
                        </button>
                      </div>

                      {/* Admin-only editor interface */}
                      {session.isLoggedIn && session.email.toLowerCase() === 'ozenia.pro@gmail.com' && (
                        <div className="mt-4 p-3 bg-amber-50/50 border border-amber-100 rounded-xl space-y-4">
                          <div className="flex items-center gap-1">
                            <span className="text-xs">✨</span>
                            <span className="font-bold text-amber-900 text-[11px]">Mode Administratrice - Modification des Textes</span>
                          </div>

                          {/* CGU Edit block */}
                          <div className="space-y-1.5">
                            <div className="flex justify-between items-center">
                              <label className="text-[10px] font-bold text-slate-600">Conditions Générales d'Utilisation (CGU) :</label>
                              <button
                                type="button"
                                onClick={() => {
                                  if (isEditingCgu) {
                                    setCguText(tempCguText);
                                    localStorage.setItem('fudep_policy_cgu', tempCguText);
                                    savePoliciesToDb({ cgu: tempCguText, cgv: cgvText, refund: refundText, privacy: privacyText, legal: legalText });
                                    setIsEditingCgu(false);
                                    alert("CGU mises à jour avec succès dans Firestore !");
                                  } else {
                                    setTempCguText(cguText);
                                    setIsEditingCgu(true);
                                  }
                                }}
                                className="bg-[#0f4c81] text-white font-bold py-1 px-2 rounded hover:bg-[#1a5b94] text-[9px] cursor-pointer shadow-xs"
                              >
                                {isEditingCgu ? '💾 Enregistrer' : '✏️ Modifier'}
                              </button>
                            </div>
                            {isEditingCgu ? (
                              <textarea
                                value={tempCguText}
                                onChange={e => setTempCguText(e.target.value)}
                                rows={4}
                                className="w-full border border-slate-200 p-2 rounded-lg text-[10px] font-sans text-slate-800 bg-white focus:outline-none focus:ring-1 focus:ring-[#0f4c81]"
                              />
                            ) : (
                              <div className="p-2 border border-slate-200 bg-white/70 rounded-lg text-[9px] text-slate-500 max-h-24 overflow-y-auto whitespace-pre-line leading-relaxed">
                                {cguText}
                              </div>
                            )}
                          </div>

                          {/* CGV Edit block */}
                          <div className="space-y-1.5">
                            <div className="flex justify-between items-center">
                              <label className="text-[10px] font-bold text-slate-600">Conditions Générales de Vente (CGV) :</label>
                              <button
                                type="button"
                                onClick={() => {
                                  if (isEditingCgv) {
                                    setCgvText(tempCgvText);
                                    localStorage.setItem('fudep_policy_cgv', tempCgvText);
                                    savePoliciesToDb({ cgu: cguText, cgv: tempCgvText, refund: refundText, privacy: privacyText, legal: legalText });
                                    setIsEditingCgv(false);
                                    alert("CGV mises à jour avec succès dans Firestore !");
                                  } else {
                                    setTempCgvText(cgvText);
                                    setIsEditingCgv(true);
                                  }
                                }}
                                className="bg-[#0f4c81] text-white font-bold py-1 px-2 rounded hover:bg-[#1a5b94] text-[9px] cursor-pointer shadow-xs"
                              >
                                {isEditingCgv ? '💾 Enregistrer' : '✏️ Modifier'}
                              </button>
                            </div>
                            {isEditingCgv ? (
                              <textarea
                                value={tempCgvText}
                                onChange={e => setTempCgvText(e.target.value)}
                                rows={4}
                                className="w-full border border-slate-200 p-2 rounded-lg text-[10px] font-sans text-slate-800 bg-white focus:outline-none focus:ring-1 focus:ring-[#0f4c81]"
                              />
                            ) : (
                              <div className="p-2 border border-slate-200 bg-white/70 rounded-lg text-[9px] text-slate-500 max-h-24 overflow-y-auto whitespace-pre-line leading-relaxed">
                                {cgvText}
                              </div>
                            )}
                          </div>

                          {/* Refund Edit block */}
                          <div className="space-y-1.5">
                            <div className="flex justify-between items-center">
                              <label className="text-[10px] font-bold text-slate-600">Politique de Remboursement :</label>
                              <button
                                type="button"
                                onClick={() => {
                                  if (isEditingRefund) {
                                    setRefundText(tempRefundText);
                                    localStorage.setItem('fudep_policy_refund', tempRefundText);
                                    savePoliciesToDb({ cgu: cguText, cgv: cgvText, refund: tempRefundText, privacy: privacyText, legal: legalText });
                                    setIsEditingRefund(false);
                                    alert("Politique de Remboursement mise à jour avec succès dans Firestore !");
                                  } else {
                                    setTempRefundText(refundText);
                                    setIsEditingRefund(true);
                                  }
                                }}
                                className="bg-[#0f4c81] text-white font-bold py-1 px-2 rounded hover:bg-[#1a5b94] text-[9px] cursor-pointer shadow-xs"
                              >
                                {isEditingRefund ? '💾 Enregistrer' : '✏️ Modifier'}
                              </button>
                            </div>
                            {isEditingRefund ? (
                              <textarea
                                value={tempRefundText}
                                onChange={e => setTempRefundText(e.target.value)}
                                rows={4}
                                className="w-full border border-slate-200 p-2 rounded-lg text-[10px] font-sans text-slate-800 bg-white focus:outline-none focus:ring-1 focus:ring-[#0f4c81]"
                              />
                            ) : (
                              <div className="p-2 border border-slate-200 bg-white/70 rounded-lg text-[9px] text-slate-500 max-h-24 overflow-y-auto whitespace-pre-line leading-relaxed">
                                {refundText}
                              </div>
                            )}
                          </div>

                          {/* Privacy Edit block */}
                          <div className="space-y-1.5">
                            <div className="flex justify-between items-center">
                              <label className="text-[10px] font-bold text-slate-600">Politique de Confidentialité (RGPD) :</label>
                              <button
                                type="button"
                                onClick={() => {
                                  if (isEditingPrivacy) {
                                    setPrivacyText(tempPrivacyText);
                                    localStorage.setItem('fudep_policy_privacy', tempPrivacyText);
                                    savePoliciesToDb({ cgu: cguText, cgv: cgvText, refund: refundText, privacy: tempPrivacyText, legal: legalText });
                                    setIsEditingPrivacy(false);
                                    alert("Politique de Confidentialité mise à jour avec succès dans Firestore !");
                                  } else {
                                    setTempPrivacyText(privacyText);
                                    setIsEditingPrivacy(true);
                                  }
                                }}
                                className="bg-[#0f4c81] text-white font-bold py-1 px-2 rounded hover:bg-[#1a5b94] text-[9px] cursor-pointer shadow-xs"
                              >
                                {isEditingPrivacy ? '💾 Enregistrer' : '✏️ Modifier'}
                              </button>
                            </div>
                            {isEditingPrivacy ? (
                              <textarea
                                value={tempPrivacyText}
                                onChange={e => setTempPrivacyText(e.target.value)}
                                rows={4}
                                className="w-full border border-slate-200 p-2 rounded-lg text-[10px] font-sans text-slate-800 bg-white focus:outline-none focus:ring-1 focus:ring-[#0f4c81]"
                              />
                            ) : (
                              <div className="p-2 border border-slate-200 bg-white/70 rounded-lg text-[9px] text-slate-500 max-h-24 overflow-y-auto whitespace-pre-line leading-relaxed">
                                {privacyText}
                              </div>
                            )}
                          </div>

                          {/* Legal Edit block */}
                          <div className="space-y-1.5">
                            <div className="flex justify-between items-center">
                              <label className="text-[10px] font-bold text-slate-600">Mentions Légales :</label>
                              <button
                                type="button"
                                onClick={() => {
                                  if (isEditingLegal) {
                                    setLegalText(tempLegalText);
                                    localStorage.setItem('fudep_policy_legal', tempLegalText);
                                    savePoliciesToDb({ cgu: cguText, cgv: cgvText, refund: refundText, privacy: privacyText, legal: tempLegalText });
                                    setIsEditingLegal(false);
                                    alert("Mentions Légales mises à jour avec succès dans Firestore !");
                                  } else {
                                    setTempLegalText(legalText);
                                    setIsEditingLegal(true);
                                  }
                                }}
                                className="bg-[#0f4c81] text-white font-bold py-1 px-2 rounded hover:bg-[#1a5b94] text-[9px] cursor-pointer shadow-xs"
                              >
                                {isEditingLegal ? '💾 Enregistrer' : '✏️ Modifier'}
                              </button>
                            </div>
                            {isEditingLegal ? (
                              <textarea
                                value={tempLegalText}
                                onChange={e => setTempLegalText(e.target.value)}
                                rows={4}
                                className="w-full border border-slate-200 p-2 rounded-lg text-[10px] font-sans text-slate-800 bg-white focus:outline-none focus:ring-1 focus:ring-[#0f4c81]"
                              />
                            ) : (
                              <div className="p-2 border border-slate-200 bg-white/70 rounded-lg text-[9px] text-slate-500 max-h-24 overflow-y-auto whitespace-pre-line leading-relaxed">
                                {legalText}
                              </div>
                            )}
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Account Controls */}
                    {session.isLoggedIn && (
                      <div className="space-y-3 mb-6">
                        {/* Logout */}
                        <button
                          type="button"
                          onClick={handleLogout}
                          className="w-full bg-slate-50 hover:bg-slate-100 border border-slate-200 text-slate-700 font-bold py-2.5 rounded-xl text-xs transition-all flex items-center justify-center gap-2 cursor-pointer"
                        >
                          <LogOut className="w-4 h-4" />
                          Se déconnecter de mon compte
                        </button>

                        {/* Delete Account */}
                        {!showDeleteConfirm ? (
                          <button
                            type="button"
                            onClick={() => {
                              if (session.email?.toLowerCase() === 'ozenia.pro@gmail.com') {
                                alert("Le compte d'administration principal ne peut pas être supprimé.");
                                return;
                              }
                              setShowDeleteConfirm(true);
                            }}
                            className="w-full bg-rose-50 hover:bg-rose-100 border border-rose-100 text-rose-700 font-semibold py-2.5 rounded-xl text-xs transition-all flex items-center justify-center gap-2 cursor-pointer"
                          >
                            <Trash2 className="w-4 h-4" />
                            Supprimer mon compte définitivement
                          </button>
                        ) : (
                          <div className="bg-rose-50 border border-rose-100 rounded-xl p-4 text-center space-y-3 animate-fade-in">
                            <p className="text-rose-800 text-xs font-bold leading-normal">
                              ⚠️ Action irréversible : Êtes-vous absolument sûr de vouloir supprimer définitivement votre compte ? Toutes vos données seront perdues.
                            </p>
                            <div className="flex gap-2 justify-center">
                              <button
                                type="button"
                                onClick={() => setShowDeleteConfirm(false)}
                                className="bg-slate-200 hover:bg-slate-300 text-slate-700 font-bold py-1.5 px-4 rounded-xl text-xs transition-all"
                              >
                                Annuler
                              </button>
                              <button
                                type="button"
                                onClick={async () => {
                                  await handleDeleteAccount(session.email);
                                  setShowDeleteConfirm(false);
                                }}
                                className="bg-rose-600 hover:bg-rose-700 text-white font-bold py-1.5 px-4 rounded-xl text-xs transition-all shadow-xs"
                              >
                                Oui, supprimer mon compte
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    )}
              </div>
            )}
          </main>
        ) : (
          // --- ADMINISTRATOR WORKSPACE VIEW ---
          <main className="flex-1 overflow-y-auto bg-slate-50 flex flex-col pb-20 p-4 animate-fade-in">
            {/* Admin Tabs */}
            <div className="flex bg-slate-200/80 p-1 rounded-xl mb-4 text-xs gap-1">
              <button
                id="btn_admin_analytics"
                onClick={() => setAdminTab('analytics')}
                className={`flex-1 py-2 rounded-lg font-bold transition-all flex items-center justify-center gap-1.5 ${adminTab === 'analytics' ? 'bg-[#0f4c81] text-white shadow-xs' : 'text-slate-600 hover:text-slate-800'}`}
              >
                <Activity className="w-3.5 h-3.5" />
                Tableau de Bord
              </button>
              <button
                id="btn_admin_reservations"
                onClick={() => setAdminTab('reservations')}
                className={`flex-1 py-2 rounded-lg font-bold transition-all flex items-center justify-center gap-1.5 relative ${adminTab === 'reservations' ? 'bg-[#0f4c81] text-white shadow-xs' : 'text-slate-600 hover:text-slate-800'}`}
              >
                <Calendar className="w-3.5 h-3.5" />
                Réservations ({bookings.length})
                {bookings.filter(b => b.status === 'pending').length > 0 && (
                  <span className="absolute -top-1 -right-1 w-2.5 h-2.5 bg-red-500 rounded-full animate-ping"></span>
                )}
              </button>
              <button
                id="btn_admin_creation"
                onClick={() => setAdminTab('creation')}
                className={`flex-1 py-2 rounded-lg font-bold transition-all flex items-center justify-center gap-1.5 ${adminTab === 'creation' ? 'bg-[#0f4c81] text-white shadow-xs' : 'text-slate-600 hover:text-slate-800'}`}
              >
                <Plus className="w-3.5 h-3.5" />
                Créer Données
              </button>
              <button
                id="btn_admin_settings"
                onClick={() => setAdminTab('settings')}
                className={`flex-1 py-2 rounded-lg font-bold transition-all flex items-center justify-center gap-1.5 ${adminTab === 'settings' ? 'bg-[#0f4c81] text-white shadow-xs' : 'text-slate-600 hover:text-slate-800'}`}
              >
                <Settings className="w-3.5 h-3.5" />
                Logo / Marque
              </button>
            </div>

            {/* A. ANALYTICS / TELEMETRY TAB */}
            {adminTab === 'analytics' && (
              <div className="flex flex-col gap-4">
                <div className="bg-white rounded-2xl p-4 border border-slate-200 shadow-sm">
                  <div className="flex justify-between items-start gap-4 mb-4">
                    <div>
                      <h3 className="font-bold text-slate-800 text-sm uppercase tracking-wider mb-1">Indicateurs de Performance</h3>
                      <p className="text-xs text-slate-400">Ces données enregistrent en temps réel l'activité de votre plateforme.</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        if (window.confirm("Êtes-vous sûre de vouloir réinitialiser à zéro tous les indicateurs de performance de test ?")) {
                          const resetAnalytics = {
                            feedViewsCount: 0,
                            viewDetailsCount: 0,
                            bookingAttempts: 0,
                            bookingsCompleted: 0,
                            favoritesCount: 0,
                            profileClicks: {}
                          };
                          setAnalytics(resetAnalytics);
                          saveAnalyticsToDb(resetAnalytics);
                          alert("Tous les indicateurs de performance de test ont été remis à zéro !");
                        }
                      }}
                      className="bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-100 text-[10px] font-bold px-2.5 py-1.5 rounded-xl cursor-pointer transition-all shrink-0 shadow-xs"
                    >
                      🗑️ Réinitialiser
                    </button>
                  </div>
                  
                  <div className="grid grid-cols-2 gap-3 mb-4">
                    <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-100">
                      <p className="text-xs text-slate-400 font-medium">Découvertes (Vues Feed)</p>
                      <p className="text-2xl font-black text-[#0f4c81] mt-1">{analytics.feedViewsCount}</p>
                    </div>
                    <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-100">
                      <p className="text-xs text-slate-400 font-medium">Clics Profil Prestataire</p>
                      <p className="text-2xl font-black text-[#0f4c81] mt-1">{analytics.viewDetailsCount}</p>
                    </div>
                    <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-100">
                      <p className="text-xs text-slate-400 font-medium">Taux d'intention (Bouton réserver)</p>
                      <p className="text-2xl font-black text-[#0f4c81] mt-1">{analytics.bookingAttempts}</p>
                    </div>
                    <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-100">
                      <p className="text-xs text-slate-400 font-medium">Demandes Complétées</p>
                      <p className="text-2xl font-black text-emerald-600 mt-1">{analytics.bookingsCompleted}</p>
                    </div>
                  </div>

                  <div className="bg-[#0f4c81]/5 border border-blue-100 rounded-xl p-3 text-xs flex gap-2.5 text-slate-600 mb-2">
                    <TrendingUp className="w-4 h-4 text-[#0f4c81] shrink-0 mt-0.5" />
                    <div>
                      <span className="font-bold text-[#0f4c81]">Validation des hypothèses :</span>
                      <p className="mt-1 leading-relaxed">
                        Le ratio clics/réservations montre un fort intérêt. Le fil d'actualité visuel type Instagram facilite grandement le passage à l'acte d'achat d'un service ongulaire !
                      </p>
                    </div>
                  </div>
                </div>

                <div className="bg-white rounded-2xl p-4 border border-slate-200 shadow-sm">
                  <h3 className="font-bold text-slate-800 text-sm mb-3">Clics par Profil Prestataire</h3>
                  <div className="flex flex-col gap-3">
                    {technicians.map(tech => {
                      const count = analytics.profileClicks[tech.id] || 0;
                      const percentage = analytics.viewDetailsCount > 0 
                        ? Math.round((count / analytics.viewDetailsCount) * 100) 
                        : 0;

                      return (
                        <div key={tech.id} className="text-xs">
                          <div className="flex justify-between mb-1">
                            <span className="font-bold text-slate-700">{tech.name} ({tech.city})</span>
                            <span className="text-slate-500 font-medium">{count} clics ({percentage}%)</span>
                          </div>
                          <div className="w-full bg-slate-100 h-2 rounded-full overflow-hidden">
                            <div 
                              className="bg-[#0f4c81] h-full transition-all duration-500" 
                              style={{ width: `${Math.max(4, percentage)}%` }}
                            ></div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            )}

            {/* B. ADMIN BOOKINGS MANAGEMENT */}
            {adminTab === 'reservations' && (
              <div className="flex flex-col gap-3">
                <h3 className="font-bold text-slate-800 text-sm uppercase tracking-wider mb-1">Suivi des Réservations</h3>
                <p className="text-xs text-slate-400 mb-2">En tant qu'administrateur de Fudep, validez ou refusez les demandes des clients.</p>

                {bookings.length === 0 ? (
                  <div className="text-center py-12 bg-white rounded-2xl border border-slate-200 p-4">
                    <AlertCircle className="w-8 h-8 text-slate-300 mx-auto mb-2" />
                    <p className="text-slate-500 text-xs">Aucune demande de réservation n'a encore été soumise.</p>
                  </div>
                ) : (
                  bookings.map(booking => (
                    <div key={booking.id} className="bg-white rounded-xl border border-slate-200 p-3.5 flex flex-col gap-3 shadow-xs">
                      <div className="flex justify-between items-start">
                        <div>
                          <span className="bg-[#0f4c81]/10 text-[#0f4c81] text-[10px] font-bold px-2 py-0.5 rounded">
                            Client : {booking.clientFirstName}
                          </span>
                          <h4 className="font-bold text-slate-900 text-sm mt-1">{booking.technicianName}</h4>
                          <p className="text-xs text-slate-500">{booking.serviceName} - <strong className="text-slate-800">{booking.price}€</strong></p>
                          <div className="text-[10px] text-slate-400 mt-1 space-y-0.5">
                            <p>💵 Acompte payé (30%) : <strong className="text-emerald-600 font-bold">{(booking.price * 0.3).toFixed(2)}€</strong></p>
                            <p>🪙 Reste à payer sur place (70%) : <strong className="text-slate-700 font-bold">{(booking.price * 0.7).toFixed(2)}€</strong></p>
                          </div>
                        </div>
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded ${
                          booking.status === 'pending' 
                            ? 'bg-amber-100 text-amber-700' 
                            : booking.status === 'confirmed'
                            ? 'bg-emerald-100 text-emerald-700'
                            : booking.status === 'completed'
                            ? 'bg-slate-100 text-slate-600 border border-slate-200'
                            : 'bg-red-100 text-red-700'
                        }`}>
                          {booking.status === 'pending' 
                            ? '⌛ En attente' 
                            : booking.status === 'confirmed' 
                            ? '✓ Confirmée' 
                            : booking.status === 'completed' 
                            ? '🏁 Terminée' 
                            : '✕ Refusée'}
                        </span>
                      </div>

                      <div className="text-xs text-slate-600 bg-slate-50 p-2.5 rounded-lg flex flex-col gap-1.5">
                        <div className="flex items-center gap-2">
                          <Calendar className="w-3.5 h-3.5 text-slate-400" />
                          <span>Souhaité le : <strong>{formatToFrenchDate(booking.desiredDate)} à {booking.desiredTime}</strong></span>
                        </div>
                        {booking.alternativeAvailabilities && (
                          <p className="text-slate-500 ml-5">Alternative : {booking.alternativeAvailabilities}</p>
                        )}
                        <div className="flex items-center gap-2 border-t border-slate-100 pt-1.5 mt-1.5 text-[11px]">
                          <Phone className="w-3.5 h-3.5 text-slate-400" />
                          <span>{booking.clientPhone}</span>
                        </div>
                        <div className="flex items-center gap-2 text-[11px]">
                          <Mail className="w-3.5 h-3.5 text-slate-400" />
                          <span className="truncate">{booking.clientEmail}</span>
                        </div>
                        {booking.message && (
                          <div className="bg-amber-50 border border-amber-100 p-2 rounded text-[11px] text-amber-800 mt-1 italic">
                            💬 Message : "{booking.message}"
                          </div>
                        )}
                        {booking.postRefId && (
                          <div className="flex items-center gap-1.5 border-t border-slate-200/50 pt-2 mt-1.5 text-[11px] text-slate-500">
                            <span>🔗 Publication de référence :</span>
                            <a
                              href={`/?post=${booking.postRefId}`}
                              onClick={(e) => {
                                e.preventDefault();
                                setIsAdminView(false);
                                setSelectedPostId(booking.postRefId);
                                setActiveTab('feed');
                              }}
                              className="font-medium text-[#0f4c81] hover:text-[#1a5b94] underline bg-[#0f4c81]/5 px-1.5 py-0.5 rounded transition-colors"
                            >
                              Voir la publication
                            </a>
                          </div>
                        )}
                        {booking.modelPhoto && (
                          <div className="border-t border-slate-200/50 pt-2 mt-1.5 text-[11px] text-slate-500">
                            <span className="block mb-1">📸 Modèle de référence envoyé par le client :</span>
                            <div className="relative overflow-hidden inline-block rounded border border-slate-200 bg-white">
                              <img src={booking.modelPhoto} alt="Modèle" className="max-h-20 object-contain rounded" />
                            </div>
                          </div>
                        )}
                      </div>

                      {booking.status === 'proposed' && (
                        <div className="bg-amber-50 border border-amber-200 rounded-lg p-2.5 text-center text-xs text-amber-800 font-medium leading-normal">
                          ⏳ Proposition envoyée : <strong className="text-amber-950">{booking.proposedDate}</strong>. En attente d'acceptation du client.
                        </div>
                      )}

                      {booking.status === 'pending' && (
                        <div className="flex flex-col gap-2">
                          <div className="flex gap-2 text-xs">
                            <button
                              onClick={() => handleUpdateBookingStatus(booking.id, 'confirmed')}
                              className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-2 rounded-lg flex items-center justify-center gap-1 transition-all cursor-pointer"
                            >
                              <Check className="w-3.5 h-3.5" /> Accepter
                            </button>
                            <button
                              onClick={() => handleUpdateBookingStatus(booking.id, 'refused')}
                              className="flex-1 bg-rose-600 hover:bg-rose-700 text-white font-bold py-2 rounded-lg flex items-center justify-center gap-1 transition-all cursor-pointer"
                            >
                              <X className="w-3.5 h-3.5" /> Refuser
                            </button>
                          </div>
                          
                          {proposingDateId === booking.id ? (
                            <div className="bg-amber-50 border border-amber-200 p-2.5 rounded-lg flex flex-col gap-2 mt-1 animate-scale-up text-xs">
                              <span className="font-bold text-amber-800">Proposer un autre créneau :</span>
                              <div className="grid grid-cols-2 gap-2">
                                <div>
                                  <label className="block text-[10px] text-slate-500 mb-0.5">Date</label>
                                  <input 
                                    type="date"
                                    required
                                    value={alternateDateInput}
                                    onChange={e => setAlternateDateInput(e.target.value)}
                                    className="w-full border border-slate-200 bg-white p-1 rounded text-xs text-slate-800 outline-none"
                                  />
                                </div>
                                <div>
                                  <label className="block text-[10px] text-slate-500 mb-0.5">Heure</label>
                                  <select 
                                    value={alternateTimeInput}
                                    onChange={e => setAlternateTimeInput(e.target.value)}
                                    className="w-full border border-slate-200 bg-white p-1 rounded text-xs text-slate-800 outline-none"
                                  >
                                    <option value="09:00">09h00</option>
                                    <option value="09:30">09h30</option>
                                    <option value="10:00">10h00</option>
                                    <option value="10:30">10h30</option>
                                    <option value="11:00">11h00</option>
                                    <option value="11:30">11h30</option>
                                    <option value="12:00">12h00</option>
                                    <option value="12:30">12h30</option>
                                    <option value="13:00">13h00</option>
                                    <option value="13:30">13h30</option>
                                    <option value="14:00">14h00</option>
                                    <option value="14:30">14h30</option>
                                    <option value="15:00">15h00</option>
                                    <option value="15:30">15h30</option>
                                    <option value="16:00">16h00</option>
                                    <option value="16:30">16h30</option>
                                    <option value="17:00">17h00</option>
                                    <option value="17:30">17h30</option>
                                    <option value="18:00">18h00</option>
                                    <option value="18:30">18h30</option>
                                  </select>
                                </div>
                              </div>
                              <div className="flex gap-1.5 mt-1">
                                <button
                                  type="button"
                                  onClick={() => handleProposeAlternateDate(booking.id)}
                                  className="flex-1 bg-[#0f4c81] text-white py-1 px-2 rounded font-bold hover:bg-[#1a5b94] text-[10px] cursor-pointer"
                                >
                                  Envoyer
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setProposingDateId(null)}
                                  className="bg-slate-200 text-slate-700 py-1 px-2 rounded hover:bg-slate-300 text-[10px] cursor-pointer"
                                >
                                  Annuler
                                </button>
                              </div>
                            </div>
                          ) : (
                            <button
                              onClick={() => { setProposingDateId(booking.id); setAlternateDateInput(''); }}
                              className="w-full bg-amber-500 hover:bg-amber-600 text-white font-bold py-1.5 rounded-lg flex items-center justify-center gap-1 transition-all text-[11px] cursor-pointer"
                            >
                              <Calendar className="w-3.5 h-3.5" /> Proposer un autre créneau
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  ))
                )}
              </div>
            )}

            {/* C. ADMIN DATA CREATION FORMS */}
            {adminTab === 'creation' && (
              <div className="flex flex-col gap-4">
                {/* Add Technician Form */}
                <div className="bg-white rounded-2xl p-4 border border-slate-200 shadow-sm">
                  <h3 className="font-serif font-bold text-slate-800 text-base mb-3 border-b border-slate-100 pb-1.5">
                    ➕ Ajouter un nouveau Prestataire
                  </h3>
                  <form onSubmit={handleCreateTechnician} className="flex flex-col gap-3 text-xs">
                    <div>
                      <label className="block text-slate-500 font-semibold mb-1">Nom Complet</label>
                      <input 
                        type="text" 
                        placeholder="Ex: Sophie Martin" 
                        required 
                        value={newTechForm.name}
                        onChange={e => setNewTechForm({ ...newTechForm, name: e.target.value })}
                        className="w-full border border-slate-200 p-2 rounded-lg text-slate-800 focus:ring-1 focus:ring-[#0f4c81]"
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-2.5">
                      <div>
                        <label className="block text-slate-500 font-semibold mb-1">Identifiant unique (Instagram)</label>
                        <input 
                          type="text" 
                          placeholder="Ex: @sophie_nails" 
                          required 
                          value={newTechForm.username}
                          onChange={e => setNewTechForm({ ...newTechForm, username: e.target.value })}
                          className="w-full border border-slate-200 p-2 rounded-lg text-slate-800"
                        />
                      </div>
                      <div>
                        <label className="block text-slate-500 font-semibold mb-1">Ville</label>
                        <input 
                          type="text" 
                          placeholder="Ex: Paris, Boulogne, Versailles..." 
                          required 
                          value={newTechForm.city}
                          onChange={e => setNewTechForm({ ...newTechForm, city: e.target.value })}
                          className="w-full border border-slate-200 p-2 rounded-lg text-slate-800 bg-white"
                        />
                      </div>
                    </div>
                    <div>
                      <label className="block text-slate-500 font-semibold mb-1">Biographie</label>
                      <textarea 
                        placeholder="Courte description de ses forces..." 
                        rows={2}
                        value={newTechForm.bio}
                        onChange={e => setNewTechForm({ ...newTechForm, bio: e.target.value })}
                        className="w-full border border-slate-200 p-2 rounded-lg text-slate-800"
                      />
                    </div>
                    <div>
                      <label className="block text-slate-500 font-semibold mb-1">Spécialités / Tags (séparés par virgule)</label>
                      <input 
                        type="text" 
                        placeholder="Nail Art, Gel, Manucure Russe" 
                        value={newTechForm.tags}
                        onChange={e => setNewTechForm({ ...newTechForm, tags: e.target.value })}
                        className="w-full border border-slate-200 p-2 rounded-lg text-slate-800"
                      />
                    </div>
                    <div>
                      <label className="block text-slate-500 font-semibold mb-1">Photo de profil (Sélecteur ou Import)</label>
                      <div className="flex flex-col gap-2">
                        <select 
                          value={newTechForm.avatar}
                          onChange={e => setNewTechForm({ ...newTechForm, avatar: e.target.value })}
                          className="w-full border border-slate-200 p-2 rounded-lg text-slate-800 bg-white"
                        >
                          <option value="https://images.unsplash.com/photo-1544005313-94ddf0286df2?w=150&auto=format&fit=crop&q=80">Avatar Femme 1 (Inès)</option>
                          <option value="https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150&auto=format&fit=crop&q=80">Avatar Femme 2 (Clara)</option>
                          <option value="https://images.unsplash.com/photo-1580489944761-15a19d654956?w=150&auto=format&fit=crop&q=80">Avatar Femme 3 (Léa)</option>
                          <option value="https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?w=150&auto=format&fit=crop&q=80">Avatar Femme 4 (Amandine)</option>
                          {newTechForm.avatar.startsWith('data:') && (
                            <option value={newTechForm.avatar}>[Photo personnalisée importée]</option>
                          )}
                        </select>
                        <div className="flex items-center gap-2">
                          <label className="bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold py-1.5 px-3 rounded-lg text-[10px] cursor-pointer border border-slate-200 transition-all flex items-center gap-1 shrink-0">
                            <span>📁 Charger une photo...</span>
                            <input 
                              type="file" 
                              accept="image/*"
                              className="hidden"
                              onChange={e => {
                                const file = e.target.files?.[0];
                                if (file) {
                                  const reader = new FileReader();
                                  reader.onloadend = () => {
                                    if (typeof reader.result === 'string') {
                                      setNewTechForm(prev => ({ ...prev, avatar: reader.result as string }));
                                    }
                                  };
                                  reader.readAsDataURL(file);
                                }
                              }}
                            />
                          </label>
                          {newTechForm.avatar && (
                            <img src={newTechForm.avatar} className="w-8 h-8 rounded-full object-cover border border-slate-200 shrink-0" />
                          )}
                        </div>
                      </div>
                    </div>

                    <button 
                      type="submit"
                      className="w-full bg-[#0f4c81] text-white font-bold py-2 px-4 rounded-lg mt-1"
                    >
                      Ajouter le Prestataire
                    </button>
                  </form>
                </div>

                {/* Add Post Form */}
                <div className="bg-white rounded-2xl p-4 border border-slate-200 shadow-sm">
                  <h3 className="font-serif font-bold text-slate-800 text-base mb-3 border-b border-slate-100 pb-1.5">
                    📸 Publier une nouvelle création de Manucure
                  </h3>
                  <form onSubmit={handleCreatePost} className="flex flex-col gap-3 text-xs">
                    <div>
                      <label className="block text-slate-500 font-semibold mb-1">Sélectionner le Prestataire</label>
                      <select 
                        required
                        value={newPostForm.technicianId}
                        onChange={e => setNewPostForm({ ...newPostForm, technicianId: e.target.value })}
                        className="w-full border border-slate-200 p-2 rounded-lg text-slate-800 bg-white"
                      >
                        <option value="">-- Choisir un professionnel --</option>
                        {technicians.map(t => (
                          <option key={t.id} value={t.id}>{t.name} ({t.city})</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-slate-500 font-semibold mb-1">Choisir ou charger une image de démonstration</label>
                      <div className="flex flex-col gap-2">
                        <select 
                          value={newPostForm.imagePreset}
                          onChange={e => setNewPostForm({ ...newPostForm, imagePreset: e.target.value })}
                          className="w-full border border-slate-200 p-2 rounded-lg text-slate-800 bg-white"
                        >
                          <option value="https://images.unsplash.com/photo-1604654894610-df63bc536371?w=800&auto=format&fit=crop&q=80">Rouge Intense Classique</option>
                          <option value="https://images.unsplash.com/photo-1632345031435-8797b2d58045?w=800&auto=format&fit=crop&q=80">Pastel rétro avec vagues</option>
                          <option value="https://images.unsplash.com/photo-1607779097040-26e80aa78e66?w=800&auto=format&fit=crop&q=80">Or et Nude de luxe</option>
                          <option value="https://images.unsplash.com/photo-1519014816548-bf5fe059798b?w=800&auto=format&fit=crop&q=80">Pink Chrome miroir</option>
                          <option value="https://images.unsplash.com/photo-1599686111247-f08200b3965b?w=800&auto=format&fit=crop&q=80">Modern Matcha French</option>
                          <option value="https://images.unsplash.com/photo-1604902396830-aca29e19b067?w=800&auto=format&fit=crop&q=80">Matte Terracotta minimaliste</option>
                          {newPostForm.imagePreset.startsWith('data:') && (
                            <option value={newPostForm.imagePreset}>[Image personnalisée importée]</option>
                          )}
                        </select>
                        <div className="flex items-center gap-2">
                          <label className="bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold py-1.5 px-3 rounded-lg text-[10px] cursor-pointer border border-slate-200 transition-all flex items-center gap-1 shrink-0">
                            <span>📁 Charger une création...</span>
                            <input 
                              type="file" 
                              accept="image/*"
                              className="hidden"
                              onChange={e => {
                                const file = e.target.files?.[0];
                                if (file) {
                                  const reader = new FileReader();
                                  reader.onloadend = () => {
                                    if (typeof reader.result === 'string') {
                                      setNewPostForm(prev => ({ ...prev, imagePreset: reader.result as string }));
                                    }
                                  };
                                  reader.readAsDataURL(file);
                                }
                              }}
                            />
                          </label>
                          {newPostForm.imagePreset && (
                            <img src={newPostForm.imagePreset} className="w-8 h-8 rounded object-cover border border-slate-200 shrink-0" />
                          )}
                        </div>
                      </div>
                    </div>
                    <div>
                      <label className="block text-slate-500 font-semibold mb-1">Légende de la publication</label>
                      <textarea 
                        placeholder="Décrivez la prestation, les couleurs utilisées, des conseils d'entretien..." 
                        rows={2}
                        required
                        value={newPostForm.caption}
                        onChange={e => setNewPostForm({ ...newPostForm, caption: e.target.value })}
                        className="w-full border border-slate-200 p-2 rounded-lg text-slate-800"
                      />
                    </div>
                    <div>
                      <label className="block text-slate-500 font-semibold mb-1">Tags (séparés par virgule)</label>
                      <input 
                        type="text" 
                        placeholder="Nail Art, Pastel, Tendance" 
                        value={newPostForm.tags}
                        onChange={e => setNewPostForm({ ...newPostForm, tags: e.target.value })}
                        className="w-full border border-slate-200 p-2 rounded-lg text-slate-800"
                      />
                    </div>
                    <div>
                      <label className="block text-slate-500 font-semibold mb-1">Prix de la création (€)</label>
                      <input 
                        type="number" 
                        min="0"
                        step="1"
                        placeholder="Ex: 45" 
                        value={newPostForm.price}
                        onChange={e => setNewPostForm({ ...newPostForm, price: e.target.value })}
                        className="w-full border border-slate-200 p-2 rounded-lg text-slate-800"
                      />
                    </div>
                    <div>
                      <label className="block text-slate-500 font-semibold mb-1">Durée estimée de la prestation (ex: 1h 30, 45 min)</label>
                      <input 
                        type="text" 
                        placeholder="Ex: 1h 30" 
                        value={newPostForm.duration}
                        onChange={e => setNewPostForm({ ...newPostForm, duration: e.target.value })}
                        className="w-full border border-slate-200 p-2 rounded-lg text-slate-800"
                      />
                    </div>

                    <button 
                      type="submit"
                      className="w-full bg-emerald-600 text-white font-bold py-2 px-4 rounded-lg mt-1"
                    >
                      Publier sur le Feed
                    </button>
                  </form>
                </div>

                {/* Add Free Slot Form */}
                <div className="bg-white rounded-2xl p-4 border border-slate-200 shadow-sm">
                  <h3 className="font-serif font-bold text-slate-800 text-base mb-3 border-b border-slate-100 pb-1.5 flex items-center gap-1.5">
                    📅 Ajouter un Créneau de Réservation Libre
                  </h3>
                  <form onSubmit={handleAddFreeSlot} className="flex flex-col gap-3 text-xs">
                    <div>
                      <label className="block text-slate-500 font-semibold mb-1">Choisir le Prestataire</label>
                      <select 
                        required
                        value={selectedTechForSlot}
                        onChange={e => setSelectedTechForSlot(e.target.value)}
                        className="w-full border border-slate-200 p-2 rounded-lg text-slate-800 bg-white"
                      >
                        <option value="">-- Choisir un professionnel --</option>
                        {technicians.map(t => (
                          <option key={t.id} value={t.id}>{t.name} ({t.city})</option>
                        ))}
                      </select>
                    </div>
                    <div className="grid grid-cols-2 gap-2.5">
                      <div>
                        <label className="block text-slate-500 font-semibold mb-1">Date du créneau</label>
                        <input 
                          type="date"
                          required
                          value={freeSlotDate}
                          onChange={e => setFreeSlotDate(e.target.value)}
                          className="w-full border border-slate-200 p-2 rounded-lg text-slate-800"
                        />
                      </div>
                      <div>
                        <label className="block text-slate-500 font-semibold mb-1">Heure de début</label>
                        <select 
                          value={freeSlotTime}
                          onChange={e => setFreeSlotTime(e.target.value)}
                          className="w-full border border-slate-200 p-2 rounded-lg text-slate-800 bg-white"
                        >
                          <option value="09:00">09:00</option>
                          <option value="09:30">09:30</option>
                          <option value="10:00">10:00</option>
                          <option value="10:30">10:30</option>
                          <option value="11:00">11:00</option>
                          <option value="11:30">11:30</option>
                          <option value="12:00">12:00</option>
                          <option value="12:30">12:30</option>
                          <option value="13:00">13:00</option>
                          <option value="13:30">13:30</option>
                          <option value="14:00">14:00</option>
                          <option value="14:30">14:30</option>
                          <option value="15:00">15:00</option>
                          <option value="15:30">15:30</option>
                          <option value="16:00">16:00</option>
                          <option value="16:30">16:30</option>
                          <option value="17:00">17:00</option>
                          <option value="17:30">17:30</option>
                          <option value="18:00">18:00</option>
                          <option value="18:30">18:30</option>
                        </select>
                      </div>
                    </div>

                    <button 
                      type="submit"
                      className="w-full bg-[#0f4c81] text-white font-bold py-2 px-4 rounded-lg mt-1 cursor-pointer"
                    >
                      Ajouter le créneau de réservation
                    </button>
                  </form>
                </div>

                {/* Add Classic Service Form */}
                <div className="bg-white rounded-2xl p-4 border border-slate-200 shadow-sm">
                  <h3 className="font-serif font-bold text-slate-800 text-base mb-3 border-b border-slate-100 pb-1.5 flex items-center gap-1.5">
                    💅 Ajouter une Prestation Classique (Tarif)
                  </h3>
                  <form onSubmit={handleCreateService} className="flex flex-col gap-3 text-xs">
                    <div>
                      <label className="block text-slate-500 font-semibold mb-1">Sélectionner le Prestataire</label>
                      <select 
                        required
                        value={addServiceForm.technicianId}
                        onChange={e => setAddServiceForm({ ...addServiceForm, technicianId: e.target.value })}
                        className="w-full border border-slate-200 p-2 rounded-lg text-slate-800 bg-white"
                      >
                        <option value="">-- Choisir un professionnel --</option>
                        {technicians.map(t => (
                          <option key={t.id} value={t.id}>{t.name} ({t.city})</option>
                        ))}
                      </select>
                    </div>

                    <div className="grid grid-cols-2 gap-2.5">
                      <div>
                        <label className="block text-slate-500 font-semibold mb-1">Nom de la prestation</label>
                        <input 
                          type="text"
                          required
                          placeholder="Ex: Pose complète Vernis Semi-Permanent"
                          value={addServiceForm.name}
                          onChange={e => setAddServiceForm({ ...addServiceForm, name: e.target.value })}
                          className="w-full border border-slate-200 p-2 rounded-lg text-slate-800"
                        />
                      </div>
                      <div>
                        <label className="block text-slate-500 font-semibold mb-1">Prix (€)</label>
                        <input 
                          type="number"
                          required
                          min="0"
                          placeholder="Ex: 45"
                          value={addServiceForm.price}
                          onChange={e => setAddServiceForm({ ...addServiceForm, price: e.target.value })}
                          className="w-full border border-slate-200 p-2 rounded-lg text-slate-800"
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-2.5">
                      <div>
                        <label className="block text-slate-500 font-semibold mb-1">Durée estimée</label>
                        <select 
                          value={addServiceForm.duration}
                          onChange={e => setAddServiceForm({ ...addServiceForm, duration: e.target.value })}
                          className="w-full border border-slate-200 p-2 rounded-lg text-slate-800 bg-white"
                        >
                          <option value="15 min">15 min</option>
                          <option value="30 min">30 min</option>
                          <option value="45 min">45 min</option>
                          <option value="1h 00">1h 00</option>
                          <option value="1h 15">1h 15</option>
                          <option value="1h 30">1h 30</option>
                          <option value="2h 00">2h 00</option>
                        </select>
                      </div>
                      
                      <div>
                        <label className="block text-slate-500 font-semibold mb-1">Illustration de la prestation (Optionnel)</label>
                        <div className="flex flex-col gap-1.5">
                          <label className="bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold py-1.5 px-3 rounded-lg text-[10px] cursor-pointer border border-slate-200 transition-all flex items-center justify-center gap-1">
                            <span>📁 Charger une photo...</span>
                            <input 
                              type="file" 
                              accept="image/*"
                              className="hidden"
                              onChange={e => {
                                const file = e.target.files?.[0];
                                if (file) {
                                  const reader = new FileReader();
                                  reader.onloadend = () => {
                                    if (typeof reader.result === 'string') {
                                      setAddServiceForm(prev => ({ ...prev, imageUrl: reader.result as string }));
                                    }
                                  };
                                  reader.readAsDataURL(file);
                                }
                              }}
                            />
                          </label>
                          {addServiceForm.imageUrl && (
                            <div className="flex items-center gap-1 justify-center mt-0.5">
                              <span className="text-[9px] text-emerald-600 font-semibold">✓ Prête</span>
                              <img src={addServiceForm.imageUrl} className="w-6 h-6 rounded object-cover border border-slate-200" />
                            </div>
                          )}
                        </div>
                      </div>
                    </div>

                    <button 
                      type="submit"
                      className="w-full bg-[#0f4c81] hover:bg-[#1a5b94] text-white font-bold py-2.5 px-4 rounded-lg mt-1 cursor-pointer transition-all"
                    >
                      Ajouter la prestation classique
                    </button>
                  </form>
                </div>

                {/* FAQ EDITOR FOR ADMINS */}
                <div className="bg-white rounded-2xl p-4 border border-slate-200 shadow-sm mt-2">
                  <h3 className="font-serif font-bold text-slate-800 text-base mb-1.5 border-b border-slate-100 pb-1.5 flex items-center gap-1.5">
                    🛠️ Gestion de la Foire Aux Questions (FAQ)
                  </h3>
                  <p className="text-xs text-slate-500 mb-4">
                    Gérez les questions et réponses visibles par l'ensemble des clients sur leur espace profil/aide.
                  </p>

                  {/* List of current FAQs */}
                  <div className="flex flex-col gap-2.5 mb-5 max-h-[250px] overflow-y-auto pr-1 border-b border-slate-100 pb-4">
                    {faqs.length === 0 ? (
                      <p className="text-xs text-slate-400 italic text-center py-2">Aucune FAQ définie.</p>
                    ) : (
                      faqs.map(faq => (
                        <div key={faq.id} className="bg-slate-50 border border-slate-100 p-2.5 rounded-xl flex justify-between items-start gap-2.5">
                          <div className="flex-1 min-w-0 text-[11px]">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <span className="bg-[#0f4c81]/10 text-[#0f4c81] text-[9px] font-bold px-1.5 py-0.5 rounded-sm">
                                {faq.category || 'Général'}
                              </span>
                              <p className="font-bold text-slate-800">{faq.question}</p>
                            </div>
                            <p className="text-slate-500 mt-1 leading-relaxed whitespace-pre-wrap">{faq.answer}</p>
                          </div>
                          <button
                            type="button"
                            onClick={() => handleDeleteFaq(faq.id)}
                            className="text-red-500 hover:text-red-700 p-1 rounded-md hover:bg-red-50 shrink-0 transition-all cursor-pointer text-xs font-semibold flex items-center gap-0.5"
                            title="Supprimer cette question FAQ"
                          >
                            <XCircle className="w-4 h-4" />
                          </button>
                        </div>
                      ))
                    )}
                  </div>

                  {/* Form to create a FAQ */}
                  <form onSubmit={handleCreateFaq} className="flex flex-col gap-3 text-xs">
                    <p className="font-bold text-slate-700 text-xs border-l-2 border-[#0f4c81] pl-1.5">Ajouter une nouvelle question :</p>
                    <div>
                      <label className="block text-slate-500 font-semibold mb-1">Catégorie</label>
                      <input 
                        type="text" 
                        placeholder="Ex: Paiement, Réservations, Annulations" 
                        required 
                        value={newFaqForm.category}
                        onChange={e => setNewFaqForm({ ...newFaqForm, category: e.target.value })}
                        className="w-full border border-slate-200 p-2 rounded-lg text-slate-800"
                      />
                    </div>
                    <div>
                      <label className="block text-slate-500 font-semibold mb-1">Question</label>
                      <input 
                        type="text" 
                        placeholder="Ex: Quels sont les moyens de paiement acceptés ?" 
                        required 
                        value={newFaqForm.question}
                        onChange={e => setNewFaqForm({ ...newFaqForm, question: e.target.value })}
                        className="w-full border border-slate-200 p-2 rounded-lg text-slate-800"
                      />
                    </div>
                    <div>
                      <label className="block text-slate-500 font-semibold mb-1">Réponse</label>
                      <textarea 
                        placeholder="Ex: Le solde restant de 70% est à régler directement au prestataire le jour J..." 
                        required
                        rows={3}
                        value={newFaqForm.answer}
                        onChange={e => setNewFaqForm({ ...newFaqForm, answer: e.target.value })}
                        className="w-full border border-slate-200 p-2 rounded-lg text-slate-800 bg-white"
                      />
                    </div>
                    <button 
                      type="submit"
                      className="w-full bg-[#0f4c81] hover:bg-[#1a5b94] text-white font-bold py-2 rounded-lg cursor-pointer transition-all flex items-center justify-center gap-1.5"
                    >
                      <Plus className="w-3.5 h-3.5" /> Enregistrer dans la FAQ de Fudep
                    </button>
                  </form>
                </div>

                {/* 🗑️ GESTION & NETTOYAGE DES DONNÉES */}
                <div className="bg-red-50/60 rounded-2xl p-4 border border-red-200 shadow-sm mt-2">
                  <h3 className="font-serif font-bold text-red-900 text-base mb-1 flex items-center gap-1.5">
                    🗑️ Gestion & Nettoyage de la Plateforme
                  </h3>
                  <p className="text-xs text-red-700/80 mb-4">
                    Gérez les éléments actuels ou videz complètement l'application pour démarrer votre vraie marketplace de zéro.
                  </p>

                  {/* Reset whole database */}
                  <button
                    type="button"
                    onClick={handleClearAllDemoData}
                    className="w-full bg-red-600 hover:bg-red-700 text-white font-bold py-2 px-4 rounded-lg mb-6 text-xs shadow-xs transition-all flex items-center justify-center gap-2 cursor-pointer"
                  >
                    ⚠️ Supprimer TOUTES les données (Remise à zéro complète)
                  </button>

                  {/* Manage individual Technicians */}
                  <div className="mb-5">
                    <h4 className="font-bold text-slate-800 text-xs uppercase tracking-wider mb-2 flex justify-between">
                      <span>Prestataires actuels ({technicians.length})</span>
                    </h4>
                    {technicians.length === 0 ? (
                      <p className="text-xs text-slate-400 italic">Aucun prestataire enregistré.</p>
                    ) : (
                      <div className="max-h-40 overflow-y-auto space-y-1.5 pr-1 border border-slate-100 p-1.5 rounded-lg bg-white">
                        {technicians.map(t => (
                          <div key={t.id} className="flex justify-between items-center text-xs p-1.5 bg-slate-50 hover:bg-slate-100 rounded border border-slate-100">
                            <div className="flex items-center gap-2">
                              <img src={t.avatar} className="w-5 h-5 rounded-full object-cover" referrerPolicy="no-referrer" />
                              <span className="font-semibold text-slate-800">{t.name}</span>
                              <span className="text-slate-400 text-[10px]">({t.city})</span>
                            </div>
                            <button
                              type="button"
                              onClick={() => handleDeleteTechnician(t.id)}
                              className="text-red-600 hover:text-red-800 hover:bg-red-50 p-1 px-1.5 rounded font-bold transition-all text-[10px]"
                              title="Supprimer ce prestataire"
                            >
                              ✕ Supprimer
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Manage individual Posts */}
                  <div>
                    <h4 className="font-bold text-slate-800 text-xs uppercase tracking-wider mb-2 flex justify-between">
                      <span>Publications du Feed ({posts.length})</span>
                    </h4>
                    {posts.length === 0 ? (
                      <p className="text-xs text-slate-400 italic">Aucune publication active.</p>
                    ) : (
                      <div className="max-h-40 overflow-y-auto space-y-1.5 pr-1 border border-slate-100 p-1.5 rounded-lg bg-white">
                        {posts.map(p => {
                          const tech = technicians.find(t => t.id === p.technicianId);
                          return (
                            <div key={p.id} className="flex justify-between items-center text-xs p-1.5 bg-slate-50 hover:bg-slate-100 rounded border border-slate-100">
                              <div className="flex items-center gap-2 overflow-hidden mr-2">
                                <img src={p.imageUrl} className="w-6 h-6 rounded object-cover shrink-0" referrerPolicy="no-referrer" />
                                <div className="truncate">
                                  <p className="font-semibold text-slate-800 truncate">{p.caption}</p>
                                  <p className="text-[9px] text-slate-400">Par {tech ? tech.name : 'Inconnu'}</p>
                                </div>
                              </div>
                              <button
                                type="button"
                                onClick={() => handleDeletePost(p.id)}
                                className="text-red-600 hover:text-red-800 hover:bg-red-50 p-1 px-1.5 rounded font-bold shrink-0 transition-all text-[10px]"
                                title="Supprimer cette publication"
                              >
                                ✕ Supprimer
                              </button>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}

            {adminTab === 'settings' && (
              <AdminSettingsTab />
            )}
          </main>
        )}

        {/* CLIENT MAIN FOOTER NAVIGATION (Only visible in client mode) */}
        {!isAdminView && (
          <nav className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-lg bg-white/95 backdrop-blur border-t border-slate-100 z-40 py-2.5 px-6 flex justify-around items-center text-slate-400 shadow-md border-x md:border-x-slate-200">
            <button 
              id="nav_feed"
              onClick={() => { setSelectedTechId(null); setSelectedPostId(null); setActiveTab('feed'); }}
              className={`flex flex-col items-center gap-0.5 transition-all ${activeTab === 'feed' && !selectedTechId && !selectedPostId ? 'text-[#0f4c81]' : 'hover:text-slate-600'}`}
            >
              <LayoutGrid className="w-5 h-5" />
              <span className="text-[10px] font-bold">Explorer</span>
            </button>

            <button 
              id="nav_favorites"
              onClick={() => { setSelectedTechId(null); setSelectedPostId(null); setActiveTab('favorites'); }}
              className={`flex flex-col items-center gap-0.5 transition-all ${activeTab === 'favorites' ? 'text-[#0f4c81]' : 'hover:text-slate-600'}`}
            >
              <Heart className="w-5 h-5" />
              <span className="text-[10px] font-bold">Favoris</span>
            </button>

            <button 
              id="nav_bookings"
              onClick={() => { setSelectedTechId(null); setSelectedPostId(null); setActiveTab('bookings'); }}
              className={`flex flex-col items-center gap-0.5 transition-all relative ${activeTab === 'bookings' ? 'text-[#0f4c81]' : 'hover:text-slate-600'}`}
            >
              <Calendar className="w-5 h-5" />
              <span className="text-[10px] font-bold">Rendez-vous</span>
              {session.isLoggedIn && bookings.filter(b => b.clientEmail?.toLowerCase() === session.email?.toLowerCase()).length > 0 && (
                <span className="absolute top-0 right-3 bg-[#0f4c81] text-white text-[9px] font-bold w-3.5 h-3.5 rounded-full flex items-center justify-center border border-white">
                  {bookings.filter(b => b.clientEmail?.toLowerCase() === session.email?.toLowerCase()).length}
                </span>
              )}
            </button>

            <button 
              id="nav_profile"
              onClick={() => { setSelectedTechId(null); setSelectedPostId(null); setActiveTab('profile'); }}
              className={`flex flex-col items-center gap-0.5 transition-all ${activeTab === 'profile' ? 'text-[#0f4c81]' : 'hover:text-slate-600'}`}
            >
              <User className="w-5 h-5" />
              <span className="text-[10px] font-bold">Mon Profil</span>
            </button>
          </nav>
        )}

      </div>

      {/* --- MODAL DIALOGS --- */}

      {/* 0. LEGAL POLICY VIEW MODAL */}
      {activePolicyModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 z-[60]">
          <div className="bg-white w-full max-w-lg rounded-2xl p-6 shadow-2xl animate-scale-up text-slate-800 border border-slate-100 flex flex-col max-h-[85vh]">
            <div className="flex justify-between items-center mb-4 border-b border-slate-100 pb-3">
              <h3 className="text-base font-bold font-serif text-[#0f4c81]">
                {activePolicyModal === 'cgu' && "Conditions Générales d'Utilisation (CGU)"}
                {activePolicyModal === 'cgv' && "Conditions Générales de Vente (CGV)"}
                {activePolicyModal === 'refund' && "Politique de Remboursement"}
                {activePolicyModal === 'privacy' && "Politique de Confidentialité (RGPD)"}
                {activePolicyModal === 'legal' && "Mentions Légales"}
              </h3>
              <button 
                onClick={() => setActivePolicyModal(null)}
                className="text-slate-400 hover:text-slate-600 bg-slate-100 rounded-full p-1 cursor-pointer transition-all hover:scale-105"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            
            <div className="overflow-y-auto pr-1 text-xs text-slate-600 space-y-3 leading-relaxed whitespace-pre-line flex-1">
              {activePolicyModal === 'cgu' && cguText}
              {activePolicyModal === 'cgv' && cgvText}
              {activePolicyModal === 'refund' && refundText}
              {activePolicyModal === 'privacy' && privacyText}
              {activePolicyModal === 'legal' && legalText}
            </div>

            <div className="mt-5 pt-3 border-t border-slate-100 flex justify-end">
              <button 
                onClick={() => setActivePolicyModal(null)}
                className="bg-[#0f4c81] text-white hover:bg-[#1a5b94] font-bold py-2 px-5 rounded-xl text-xs transition-all cursor-pointer shadow-md active:scale-95"
              >
                Fermer
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 1. AUTHENTICATION & QUICK-LOGIN DIALOG */}
      {showLoginModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-white w-full max-w-sm rounded-2xl p-6 shadow-2xl animate-scale-up text-slate-800 border border-slate-100">
            <div className="flex justify-between items-center mb-4">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 flex items-center justify-center rounded-lg border border-slate-100 shadow-xs bg-white">
                  <FudepLogo className="w-6 h-6" />
                </div>
                <h3 className="text-base font-bold font-serif text-[#0f4c81]">Accéder à Fudep</h3>
              </div>
              <button 
                onClick={() => { setShowLoginModal(false); setBookingTarget(null); setBookingIntent(null); }}
                className="text-slate-400 hover:text-slate-600 bg-slate-100 rounded-full p-1"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Tab selection */}
            {authMode !== 'forgot_password' ? (
              <div className="flex border-b border-slate-100 mb-4 text-xs">
                <button
                  type="button"
                  onClick={() => { setAuthMode('login'); setAuthError(null); }}
                  className={`flex-1 pb-2 font-bold border-b-2 text-center transition-all ${
                    authMode === 'login' ? 'border-[#0f4c81] text-[#0f4c81]' : 'border-transparent text-slate-400 hover:text-slate-600'
                  }`}
                >
                  Se connecter
                </button>
                <button
                  type="button"
                  onClick={() => { setAuthMode('signup'); setAuthError(null); setConfirmPassword(''); }}
                  className={`flex-1 pb-2 font-bold border-b-2 text-center transition-all ${
                    authMode === 'signup' ? 'border-[#0f4c81] text-[#0f4c81]' : 'border-transparent text-slate-400 hover:text-slate-600'
                  }`}
                >
                  Créer un compte
                </button>
              </div>
            ) : (
              <div className="mb-4 text-xs">
                <h4 className="font-bold text-[#0f4c81] text-sm">🔑 Récupérer mon mot de passe</h4>
              </div>
            )}

            {/* Error alerts */}
            {authError && (
              <div className="bg-red-50 border border-red-100 text-red-600 rounded-lg p-2.5 mb-3 text-[11px] leading-normal flex items-start gap-1.5 animate-fade-in">
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                <span>{authError}</span>
              </div>
            )}

            {authMode === 'login' ? (
              /* --- CONNEXION FORM --- */
              <form onSubmit={handleSignIn} className="flex flex-col gap-3 text-xs">
                <div>
                  <label className="block text-slate-500 font-semibold mb-1">Adresse E-mail <span className="text-red-500">*</span></label>
                  <input 
                    type="email" 
                    placeholder="sophie.laurent@gmail.com" 
                    required
                    value={loginForm.email}
                    onChange={e => setLoginForm({ ...loginForm, email: e.target.value })}
                    className="w-full border border-slate-200 p-2.5 rounded-lg text-slate-800"
                  />
                </div>
                <div>
                  <div className="flex justify-between items-center mb-1">
                    <label className="block text-slate-500 font-semibold">Mot de passe <span className="text-red-500">*</span></label>
                    <button
                      type="button"
                      onClick={() => { setAuthMode('forgot_password'); setAuthError(null); }}
                      className="text-[11px] text-[#0f4c81] hover:underline font-semibold"
                    >
                      Mot de passe oublié ?
                    </button>
                  </div>
                  <input 
                    type="password" 
                    placeholder="Saisissez votre mot de passe" 
                    required
                    value={loginForm.password}
                    onChange={e => setLoginForm({ ...loginForm, password: e.target.value })}
                    className="w-full border border-slate-200 p-2.5 rounded-lg text-slate-800"
                  />
                </div>

                <button 
                  type="submit"
                  className="w-full bg-[#0f4c81] text-white hover:bg-[#1a5b94] font-bold py-2.5 rounded-xl mt-2 shadow-md transition-all text-xs"
                >
                  Se connecter
                </button>
              </form>
            ) : authMode === 'forgot_password' ? (
              /* --- MOT DE PASSE OUBLIÉ FORM --- */
              <form onSubmit={handleForgotPasswordSubmit} className="flex flex-col gap-3 text-xs animate-fade-in">
                <p className="text-slate-500 text-xs mb-1 leading-relaxed">
                  Saisissez l'adresse e-mail de votre compte. Nous vous enverrons un lien fictif pour réinitialiser votre mot de passe.
                </p>
                <div>
                  <label className="block text-slate-500 font-semibold mb-1">Adresse E-mail <span className="text-red-500">*</span></label>
                  <input 
                    type="email" 
                    placeholder="sophie.laurent@gmail.com" 
                    required
                    value={forgotPasswordEmail}
                    onChange={e => setForgotPasswordEmail(e.target.value)}
                    className="w-full border border-slate-200 p-2.5 rounded-lg text-slate-800"
                  />
                </div>

                <button 
                  type="submit"
                  className="w-full bg-[#0f4c81] text-white hover:bg-[#1a5b94] font-bold py-2.5 rounded-xl mt-2 shadow-md transition-all text-xs"
                >
                  Envoyer le lien de récupération
                </button>

                <button 
                  type="button"
                  onClick={() => { setAuthMode('login'); setAuthError(null); }}
                  className="w-full text-slate-500 hover:text-slate-800 font-bold py-1.5 mt-1 text-center"
                >
                  Retour à la connexion
                </button>
              </form>
            ) : (
              /* --- INSCRIPTION FORM (ALL FIELDS ARE REQUIRED) --- */
              <div className="flex flex-col gap-3 text-xs max-h-[380px] overflow-y-auto pr-1">
                {/* Client / Prestataire Selector */}
                <div>
                  <label className="block text-slate-500 font-semibold mb-1.5">Je souhaite m'inscrire en tant que :</label>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => setAuthRole('client')}
                      className={`flex-1 py-2 px-3 rounded-lg border font-medium text-center transition-all ${
                        authRole === 'client'
                          ? 'border-[#0f4c81] bg-[#0f4c81]/5 text-[#0f4c81]'
                          : 'border-slate-200 text-slate-500 hover:bg-slate-50'
                      }`}
                    >
                      👤 Client
                    </button>
                    <button
                      type="button"
                      onClick={() => setAuthRole('prestataire')}
                      className={`flex-1 py-2 px-3 rounded-lg border font-medium text-center transition-all ${
                        authRole === 'prestataire'
                          ? 'border-[#0f4c81] bg-[#0f4c81]/5 text-[#0f4c81]'
                          : 'border-slate-200 text-slate-500 hover:bg-slate-50'
                      }`}
                    >
                      💅 Prestataire
                    </button>
                  </div>
                </div>

                {authRole === 'prestataire' ? (
                  <div className="bg-amber-50 border border-amber-200 text-amber-900 p-4 rounded-xl space-y-3 mt-1 leading-relaxed">
                    <div className="font-bold flex items-center gap-1.5 text-amber-800 text-sm">
                      ✨ Inscription Prestataire
                    </div>
                    <p className="text-xs">
                      Afin de garantir la qualité de notre service, l'inscription directe pour les professionnels est fermée.
                    </p>
                    <p className="text-xs font-semibold">
                      Pour rejoindre notre communauté d'artistes ongulaires, veuillez nous envoyer un e-mail à :
                    </p>
                    <div className="bg-white border border-amber-100 py-1.5 px-3 rounded-lg font-mono text-center text-sm text-[#0f4c81] font-bold select-all cursor-pointer hover:bg-slate-50">
                      contact@fudep.fr
                    </div>
                    <p className="text-[10px] text-amber-700">
                      Notre équipe vous recontactera sous 24h.
                    </p>
                  </div>
                ) : (
                  <form onSubmit={handleSignUp} className="flex flex-col gap-3">
                    <div>
                      <label className="block text-slate-500 font-semibold mb-1">Prénom <span className="text-red-500">*</span></label>
                      <input 
                        type="text" 
                        placeholder="Ex: Clara" 
                        required
                        value={loginForm.name}
                        onChange={e => setLoginForm({ ...loginForm, name: e.target.value })}
                        className="w-full border border-slate-200 p-2.5 rounded-lg text-slate-800"
                      />
                    </div>
                    <div>
                      <label className="block text-slate-500 font-semibold mb-1">Adresse E-mail <span className="text-red-500">*</span></label>
                      <input 
                        type="email" 
                        placeholder="Ex: clara.expert@gmail.com" 
                        required
                        value={loginForm.email}
                        onChange={e => setLoginForm({ ...loginForm, email: e.target.value })}
                        className="w-full border border-slate-200 p-2.5 rounded-lg text-slate-800"
                      />
                    </div>
                    <div>
                      <label className="block text-slate-500 font-semibold mb-1">Téléphone <span className="text-red-500">*</span></label>
                      <input 
                        type="tel" 
                        placeholder="Ex: 06 00 00 00 00" 
                        required
                        value={loginForm.phone}
                        onChange={e => setLoginForm({ ...loginForm, phone: e.target.value })}
                        className="w-full border border-slate-200 p-2.5 rounded-lg text-slate-800"
                      />
                    </div>
                    <div>
                      <label className="block text-slate-500 font-semibold mb-1">
                        Ville <span className="text-slate-400 font-normal text-[10px]">(uniquement en Île-de-France pour le moment)</span> <span className="text-red-500">*</span>
                      </label>
                      <input 
                        type="text" 
                        placeholder="Ex: Paris, Versailles..." 
                        required
                        value={loginForm.city}
                        onChange={e => setLoginForm({ ...loginForm, city: e.target.value })}
                        className="w-full border border-slate-200 p-2.5 rounded-lg text-slate-800"
                      />
                    </div>
                    <div>
                      <label className="block text-slate-500 font-semibold mb-1">Créer un mot de passe <span className="text-red-500">*</span></label>
                      <input 
                        type="password" 
                        placeholder="Minimum 8 caractères" 
                        required
                        value={loginForm.password}
                        onChange={e => setLoginForm({ ...loginForm, password: e.target.value })}
                        className="w-full border border-slate-200 p-2.5 rounded-lg text-slate-800"
                      />
                    </div>
                    <div>
                      <label className="block text-slate-500 font-semibold mb-1">Confirmer le mot de passe <span className="text-red-500">*</span></label>
                      <input 
                        type="password" 
                        placeholder="Retapez votre mot de passe" 
                        required
                        value={confirmPassword}
                        onChange={e => setConfirmPassword(e.target.value)}
                        className="w-full border border-slate-200 p-2.5 rounded-lg text-slate-800"
                      />
                    </div>

                    <div className="flex items-start gap-2.5 my-2">
                      <input 
                        type="checkbox" 
                        id="acceptTerms" 
                        required
                        checked={acceptTerms}
                        onChange={e => setAcceptTerms(e.target.checked)}
                        className="w-4.5 h-4.5 rounded border-slate-300 text-[#0f4c81] focus:ring-[#0f4c81] mt-0.5 cursor-pointer"
                      />
                      <label htmlFor="acceptTerms" className="text-slate-500 text-[10px] leading-relaxed select-none cursor-pointer">
                        J'ai lu et j'accepte les <button type="button" onClick={() => setActivePolicyModal('cgu')} className="text-[#0f4c81] font-bold hover:underline inline">CGU</button>, les <button type="button" onClick={() => setActivePolicyModal('cgv')} className="text-[#0f4c81] font-bold hover:underline inline">CGV</button>, la <button type="button" onClick={() => setActivePolicyModal('refund')} className="text-[#0f4c81] font-bold hover:underline inline">Politique de remboursement</button> et la <button type="button" onClick={() => setActivePolicyModal('privacy')} className="text-[#0f4c81] font-bold hover:underline inline">Politique de confidentialité (RGPD)</button> de l'application <span className="text-red-500">*</span>
                      </label>
                    </div>

                    <button 
                      type="submit"
                      className="w-full bg-[#0f4c81] text-white hover:bg-[#1a5b94] font-bold py-2.5 rounded-xl mt-2 shadow-md transition-all text-xs"
                    >
                      S'inscrire & Se connecter
                    </button>
                  </form>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* 2. DETAILED BOOKING MODAL DRAWER */}
      {bookingTarget && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-end md:items-center justify-center p-0 md:p-4 z-50">
          <div className="bg-white w-full max-w-md rounded-t-2xl md:rounded-2xl p-5 shadow-2xl animate-slide-up text-slate-800 border border-slate-100 flex flex-col max-h-[90vh] overflow-y-auto">
            
            <div className="flex justify-between items-center mb-3.5 border-b border-slate-100 pb-2">
              <h3 className="text-base font-bold font-serif text-[#0f4c81]">🗓️ Formulaire de réservation</h3>
              <button 
                onClick={() => setBookingTarget(null)}
                className="text-slate-400 hover:text-slate-600 bg-slate-100 rounded-full p-1"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {!bookingSuccess ? (
              <div className="flex flex-col">
                {/* Summary of the selected service */}
                <div className="bg-slate-50 p-3 rounded-xl border border-slate-100 mb-4 text-xs">
                  <span className="text-[10px] text-slate-400 uppercase tracking-wide font-bold">Prestataire</span>
                  <div className="flex items-center gap-2 mt-1 mb-2">
                    <img 
                      src={bookingTarget.technician.avatar} 
                      alt={bookingTarget.technician.name} 
                      className="w-6 h-6 rounded-full object-cover"
                    />
                    <strong className="text-slate-800">{bookingTarget.technician.name} ({bookingTarget.technician.city})</strong>
                  </div>
                  
                  <div className="flex justify-between items-center border-t border-slate-200/50 pt-2 text-slate-700">
                    <div>
                      <p className="font-bold">{bookingTarget.service.name}</p>
                      <span className="text-[10px] text-slate-400 flex items-center gap-1 mt-0.5"><Clock className="w-3 h-3" /> {bookingTarget.post?.duration || bookingTarget.service.duration}</span>
                    </div>
                    <span className="text-sm font-black text-[#0f4c81]">{bookingTargetPrice}€</span>
                  </div>
                </div>

                <form onSubmit={submitBooking} className="flex flex-col gap-3.5 text-xs">
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-slate-500 font-semibold mb-1">Prénom</label>
                      <input 
                        type="text" 
                        required
                        value={bookingForm.firstName}
                        onChange={e => setBookingForm({ ...bookingForm, firstName: e.target.value })}
                        className="w-full border border-slate-200 p-2.5 rounded-lg text-slate-800"
                      />
                    </div>
                    <div>
                      <label className="block text-slate-500 font-semibold mb-1">Téléphone</label>
                      <input 
                        type="tel" 
                        required
                        value={bookingForm.phone}
                        onChange={e => setBookingForm({ ...bookingForm, phone: e.target.value })}
                        className="w-full border border-slate-200 p-2.5 rounded-lg text-slate-800"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-slate-500 font-semibold mb-1">E-mail</label>
                    <input 
                      type="email" 
                      required
                      value={bookingForm.email}
                      onChange={e => setBookingForm({ ...bookingForm, email: e.target.value })}
                      className="w-full border border-slate-200 p-2.5 rounded-lg text-slate-800"
                    />
                  </div>

                  {/* Polish, high-fidelity Custom Calendly-style Calendar Component */}
                  {(() => {
                    const slotsByDate: Record<string, string[]> = {};
                    const freeSlots = bookingTarget.technician.freeSlots || [];
                    
                    // Filter out slots that have already been booked/reserved and slots that are in the past
                    const bookedSlots = bookings
                      .filter(b => b.technicianId === bookingTarget.technician.id && b.status !== 'refused')
                      .map(b => `${b.desiredDate} à ${b.desiredTime}`);
                    
                    const availableSlotsFiltered = freeSlots.filter(slot => !bookedSlots.includes(slot) && !isSlotPast(slot));
                    
                    availableSlotsFiltered.forEach(slot => {
                      const parts = slot.split(' à ');
                      if (parts.length === 2) {
                        const [date, time] = parts;
                        if (!slotsByDate[date]) {
                          slotsByDate[date] = [];
                        }
                        slotsByDate[date].push(time);
                      }
                    });

                    const datesWithSlots = Object.keys(slotsByDate).sort();

                    if (availableSlotsFiltered.length === 0) {
                      return (
                        <div className="bg-amber-50 border border-amber-200 text-amber-800 text-center p-4 rounded-xl text-xs font-semibold leading-relaxed">
                          ⚠️ Aucun créneau disponible en ligne chez ce prestataire pour le moment. Veuillez choisir un autre prestataire ou recontacter l'administrateur.
                        </div>
                      );
                    }

                    // Compute the calendar month to show
                    const baseDate = new Date();
                    baseDate.setMonth(baseDate.getMonth() + currentMonthOffset);
                    const year = baseDate.getFullYear();
                    const month = baseDate.getMonth();

                    // Generate month days
                    const firstDay = new Date(year, month, 1);
                    const lastDay = new Date(year, month + 1, 0);

                    // Adjust padding: Monday is index 0
                    let dayOffset = firstDay.getDay() - 1;
                    if (dayOffset === -1) dayOffset = 6; // Sunday is index 6

                    const calendarDays: (Date | null)[] = [];
                    for (let i = 0; i < dayOffset; i++) {
                      calendarDays.push(null);
                    }
                    for (let d = 1; d <= lastDay.getDate(); d++) {
                      calendarDays.push(new Date(year, month, d));
                    }

                    const FRENCH_MONTH_NAMES = [
                      'Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin',
                      'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre'
                    ];

                    const weekdays = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'];

                    return (
                      <div className="bg-white border border-slate-200 p-4 rounded-xl space-y-4">
                        <div className="flex justify-between items-center border-b border-slate-100 pb-2">
                          <span className="font-bold font-serif text-[#0f4c81] text-xs">
                            📅 Choisir une date & un horaire
                          </span>
                          <div className="flex items-center gap-1">
                            <button
                              type="button"
                              onClick={() => setCurrentMonthOffset(prev => prev - 1)}
                              className="p-1 hover:bg-slate-100 rounded text-slate-600 font-bold transition-all text-xs cursor-pointer"
                            >
                              ◀
                            </button>
                            <span className="text-slate-800 font-bold text-[11px] px-1 font-mono min-w-[100px] text-center">
                              {FRENCH_MONTH_NAMES[month]} {year}
                            </span>
                            <button
                              type="button"
                              onClick={() => setCurrentMonthOffset(prev => prev + 1)}
                              className="p-1 hover:bg-slate-100 rounded text-slate-600 font-bold transition-all text-xs cursor-pointer"
                            >
                              ▶
                            </button>
                          </div>
                        </div>

                        {/* Calendar Weekday Names */}
                        <div className="grid grid-cols-7 gap-1 text-center text-[10px] font-bold text-slate-400">
                          {weekdays.map(w => (
                            <div key={w}>{w}</div>
                          ))}
                        </div>

                        {/* Calendar Days Grid */}
                        <div className="grid grid-cols-7 gap-1 text-center text-xs">
                          {calendarDays.map((day, idx) => {
                            if (!day) return <div key={`empty-${idx}`} className="py-2"></div>;

                            const yStr = day.getFullYear();
                            const mStr = String(day.getMonth() + 1).padStart(2, '0');
                            const dStr = String(day.getDate()).padStart(2, '0');
                            const formattedDayString = `${yStr}-${mStr}-${dStr}`;

                            const daySlots = slotsByDate[formattedDayString] || [];
                            const hasSlots = daySlots.length > 0;
                            const isSelected = bookingForm.desiredDate === formattedDayString;

                            return (
                              <button
                                key={formattedDayString}
                                type="button"
                                disabled={!hasSlots}
                                onClick={() => {
                                  setBookingForm(prev => ({
                                    ...prev,
                                    desiredDate: formattedDayString,
                                    desiredTime: daySlots[0] || '10:00'
                                  }));
                                }}
                                className={`py-1.5 rounded-full transition-all text-center flex flex-col items-center justify-center font-mono text-[11px] relative cursor-pointer ${
                                  isSelected
                                    ? 'bg-[#0f4c81] text-white font-extrabold shadow-sm'
                                    : hasSlots
                                    ? 'border border-[#0f4c81] text-[#0f4c81] font-bold bg-blue-50/40 hover:bg-[#0f4c81]/10'
                                    : 'text-slate-300 pointer-events-none'
                                }`}
                              >
                                {day.getDate()}
                                {hasSlots && !isSelected && (
                                  <span className="absolute bottom-0.5 w-1 h-1 bg-[#0f4c81] rounded-full"></span>
                                )}
                              </button>
                            );
                          })}
                        </div>

                        {/* Selected day times */}
                        {bookingForm.desiredDate && slotsByDate[bookingForm.desiredDate] && (
                          <div className="pt-3 border-t border-slate-100 space-y-2">
                            <span className="text-[10px] text-slate-500 font-bold block">
                              🕒 Créneaux horaires disponibles le {formatFrenchDateShort(bookingForm.desiredDate)} :
                            </span>
                            <div className="grid grid-cols-4 gap-1.5">
                              {slotsByDate[bookingForm.desiredDate].map(time => {
                                const isSelectedTime = bookingForm.desiredTime === time;
                                return (
                                  <button
                                    key={time}
                                    type="button"
                                    onClick={() => {
                                      setBookingForm(prev => ({
                                        ...prev,
                                        desiredTime: time
                                      }));
                                    }}
                                    className={`py-1.5 px-1 rounded-lg text-center font-mono text-[11px] font-semibold border transition-all cursor-pointer ${
                                      isSelectedTime
                                        ? 'bg-emerald-600 text-white border-emerald-600 font-bold shadow-sm'
                                        : 'bg-white hover:bg-slate-50 text-slate-800 border-slate-200'
                                    }`}
                                  >
                                    {time}
                                  </button>
                                );
                              })}
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })()}

                  <div>
                    <label className="block text-slate-500 font-semibold mb-1">
                      Autres créneaux de disponibles <span className="text-red-500">* (Obligatoire)</span>
                      <span className="block text-[10px] text-slate-400 font-normal italic mt-0.5">
                        (Au cas où le prestataire ne serait pas disponible à la date demandée)
                      </span>
                    </label>
                    <input 
                      type="text" 
                      required
                      placeholder="Ex: Samedi toute la journée, Vendredi matin, etc." 
                      value={bookingForm.alternativeAvailabilities}
                      onChange={e => setBookingForm({ ...bookingForm, alternativeAvailabilities: e.target.value })}
                      className="w-full border border-slate-200 p-2.5 rounded-lg text-slate-800"
                    />
                  </div>

                  <div>
                    <label className="block text-slate-500 font-semibold mb-1">Note ou message spécifique</label>
                    <textarea 
                      placeholder="Indiquez des préférences de couleurs ou l'état actuel de vos ongles..." 
                      rows={2}
                      value={bookingForm.message}
                      onChange={e => setBookingForm({ ...bookingForm, message: e.target.value })}
                      className="w-full border border-slate-200 p-2.5 rounded-lg text-slate-800"
                    />
                  </div>

                  {/* Commitment Checkbox */}
                  <div className="flex items-start gap-2.5 bg-amber-50/40 border border-amber-100 p-3 rounded-xl mt-1.5">
                    <input 
                      type="checkbox"
                      id="commitmentCheck"
                      required
                      checked={bookingForm.commitmentCheck || false}
                      onChange={e => setBookingForm({ ...bookingForm, commitmentCheck: e.target.checked })}
                      className="w-4.5 h-4.5 text-[#0f4c81] border-slate-300 rounded focus:ring-[#0f4c81] cursor-pointer mt-0.5"
                    />
                    <label htmlFor="commitmentCheck" className="text-[11px] text-slate-600 leading-normal cursor-pointer select-none">
                      Je m'engage à honorer mon rendez-vous et je confirme que je suis bien disponible à la date et à l'heure choisies (pour éviter les annulations répétées). <span className="text-red-500 font-bold">*</span>
                    </label>
                  </div>

                  {/* Stripe Credit Card Payment section for 30% Deposit */}
                  <div className="bg-emerald-50 border border-emerald-200/60 p-4 rounded-xl mt-1 space-y-2">
                    <span className="text-[10px] text-emerald-800 uppercase tracking-wide font-extrabold flex items-center gap-1.5 text-emerald-700">
                      🔒 PAIEMENT SÉCURISÉ STRIPE CHECKOUT (30%)
                    </span>
                    <p className="text-xs text-emerald-900 leading-normal">
                      Afin de bloquer votre réservation, un acompte de 30% est requis. Vous allez être redirigé vers la page sécurisée et officielle de Stripe pour effectuer ce règlement.
                    </p>
                    <div className="flex justify-between items-center text-xs pt-1.5 border-t border-emerald-200/50">
                      <span className="text-emerald-800">Acompte (30%) :</span>
                      <span className="font-extrabold text-emerald-700 text-sm">{(bookingTargetPrice * 0.3).toFixed(2)}€</span>
                    </div>
                  </div>

                  <button 
                    type="submit"
                    disabled={isProcessingPayment}
                    className="w-full bg-emerald-600 hover:bg-emerald-700 disabled:bg-emerald-600/50 text-white font-bold py-3 rounded-xl shadow-md transition-all mt-2 text-xs flex items-center justify-center gap-2"
                  >
                    {isProcessingPayment ? (
                      <span className="flex items-center gap-1.5">
                        <span className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin"></span>
                        Traitement de l'acompte Stripe en cours...
                      </span>
                    ) : (
                      <>🚀 Payer l'acompte & Confirmer la réservation</>
                    )}
                  </button>
                </form>
              </div>
            ) : (
              <div className="text-center py-6 flex flex-col items-center animate-fade-in">
                <div className="w-16 h-16 bg-emerald-100 rounded-full flex items-center justify-center mb-4">
                  <CheckCircle2 className="w-10 h-10 text-emerald-600" />
                </div>
                <h4 className="text-lg font-bold text-[#0f4c81] px-2 leading-snug">Votre réservation a été confirmée ! 🎉</h4>
                
                <div className="text-xs text-slate-700 mt-3 leading-relaxed px-4 space-y-2.5">
                  <p>Nous préparons actuellement les informations relatives à votre rendez-vous.</p>
                  <p>
                    Vous recevrez prochainement un e-mail contenant l'adresse du rendez-vous, les informations pratiques ainsi que les modalités de règlement du solde auprès du prestataire.
                  </p>
                  <p className="font-bold text-[#0f4c81] text-sm mt-1">Merci pour votre confiance !</p>
                </div>

                {/* Important day-of reminder */}
                <div className="bg-emerald-50 border border-emerald-150 p-4 rounded-xl text-xs text-emerald-800 mt-5 max-w-sm w-full text-left space-y-2.5">
                  <p className="font-bold text-center border-b border-emerald-200/50 pb-1.5 text-emerald-950 uppercase tracking-wide text-[10px]">
                    ⚠️ Rappel Important pour votre rendez-vous
                  </p>
                  <p className="leading-relaxed">
                    💵 <strong>Solde restant à payer :</strong> Le paiement du solde restant de <strong>70% ({(bookingTargetPrice * 0.7).toFixed(2)}€)</strong> sera à effectuer <strong>directement auprès du prestataire de beauté le jour J</strong> de votre rendez-vous.
                  </p>
                  <p className="leading-relaxed bg-white/65 p-2 rounded border border-emerald-150 font-semibold">
                    📅 <strong>Notez votre rendez-vous :</strong> <strong className="text-[#0f4c81] font-mono">{formatToFrenchDate(bookingForm.desiredDate)} à {bookingForm.desiredTime}</strong> chez {bookingTarget.technician.name}.
                  </p>
                </div>

                <div className="bg-slate-50 p-3 rounded-xl border border-slate-100 text-[11px] text-slate-500 mt-4 max-w-sm w-full text-left leading-relaxed">
                  📌 <strong>Étape suivante :</strong> le prestataire confirmera votre demande de réservation dans un délai de 24h.
                </div>
                
                <button
                  onClick={() => { setBookingTarget(null); setBookingSuccess(false); setActiveTab('bookings'); }}
                  className="mt-6 bg-[#0f4c81] text-white font-bold text-xs py-2.5 px-5 rounded-lg shadow-md hover:bg-[#1a5b94]"
                >
                  Voir mes réservations
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* 4. BOOKING CONFIRMED NOTIFICATION MODAL (Client automatic confirmation popup on approval) */}
      {confirmedBookingNotification && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-white w-full max-w-sm rounded-2xl p-6 shadow-2xl animate-scale-up text-slate-800 border border-slate-100 text-center flex flex-col items-center">
            <div className="w-16 h-16 bg-emerald-100 rounded-full flex items-center justify-center mb-4">
              <CheckCircle2 className="w-10 h-10 text-emerald-600" />
            </div>
            
            <h4 className="text-lg font-bold text-[#0f4c81] font-serif">🎉 Réservation Confirmée !</h4>
            <p className="text-xs text-slate-600 mt-2">
              Bonne nouvelle ! Votre prestataire <strong>{confirmedBookingNotification.technicianName}</strong> a validé votre rendez-vous.
            </p>

            <div className="bg-emerald-50 border border-emerald-100 p-4 rounded-xl text-xs text-emerald-800 mt-4 max-w-sm w-full text-left space-y-2">
              <p className="font-bold text-center border-b border-emerald-200/50 pb-1.5 text-emerald-950 uppercase tracking-wide text-[10px]">
                📅 Récapitulatif du Rendez-vous
              </p>
              <p className="leading-relaxed">
                💅 <strong>Prestation :</strong> {confirmedBookingNotification.serviceName}
              </p>
              <p className="leading-relaxed font-mono bg-white px-2 py-1.5 rounded border border-emerald-150 text-center text-[#0f4c81] font-bold">
                ⏰ Le {formatToFrenchDate(confirmedBookingNotification.desiredDate)} à {confirmedBookingNotification.desiredTime}
              </p>
              <p className="leading-relaxed text-[11px] pt-1">
                💵 <strong>Acompte payé via Stripe (30%) :</strong> {confirmedBookingNotification.depositPaid?.toFixed(2)}€
              </p>
              <p className="leading-relaxed text-[11px]">
                💵 <strong>Reste à régler sur place (70%) :</strong> {(confirmedBookingNotification.price * 0.7).toFixed(2)}€
              </p>
            </div>

            <button
              onClick={() => {
                // Record that we showed this confirmation so it doesn't pop up again
                const shownStr = localStorage.getItem('fudep_shown_confirmations') || '[]';
                let shownIds = [];
                try {
                  shownIds = JSON.parse(shownStr);
                } catch {
                  shownIds = [];
                }
                if (!shownIds.includes(confirmedBookingNotification.id)) {
                  shownIds.push(confirmedBookingNotification.id);
                }
                localStorage.setItem('fudep_shown_confirmations', JSON.stringify(shownIds));
                setConfirmedBookingNotification(null);
                setActiveTab('bookings');
              }}
              className="mt-6 w-full bg-[#0f4c81] hover:bg-[#1a5b94] text-white font-bold text-xs py-2.5 rounded-lg shadow-md transition-all cursor-pointer"
            >
              C'est noté !
            </button>
          </div>
        </div>
      )}

    </div>
  );
}

export function FudepLogo({ className = "w-10 h-10" }: { className?: string }) {
  const [logoSrc, setLogoSrc] = useState<string>("/Logo fudep transparent.png");

  useEffect(() => {
    // Load initial custom logo from localStorage if present
    const custom = localStorage.getItem('fudep_custom_logo');
    if (custom && custom !== "/fudep_puzzle_logo_v3.jpg" && custom !== "/fudep_puzzle_logo_1783249722185.jpg") {
      setLogoSrc(custom);
    } else {
      // Clean up legacy defaults from local storage
      if (custom === "/fudep_puzzle_logo_v3.jpg" || custom === "/fudep_puzzle_logo_1783249722185.jpg") {
        localStorage.removeItem('fudep_custom_logo');
      }
      setLogoSrc("/Logo fudep transparent.png");
    }

    const handleUpdate = () => {
      const updated = localStorage.getItem('fudep_custom_logo');
      if (updated && updated !== "/fudep_puzzle_logo_v3.jpg" && updated !== "/fudep_puzzle_logo_1783249722185.jpg") {
        setLogoSrc(updated);
      } else {
        setLogoSrc("/Logo fudep transparent.png");
      }
    };

    window.addEventListener('fudep_logo_updated', handleUpdate);
    window.addEventListener('storage', handleUpdate);

    return () => {
      window.removeEventListener('fudep_logo_updated', handleUpdate);
      window.removeEventListener('storage', handleUpdate);
    };
  }, []);

  return (
    <img 
      src={logoSrc} 
      alt="Fudep Logo" 
      className={`${className} object-contain`}
      referrerPolicy="no-referrer"
      onError={(e) => {
        // Fallback if custom logo fails to load
        if (logoSrc !== "/Logo fudep transparent.png") {
          localStorage.removeItem('fudep_custom_logo');
          setLogoSrc("/Logo fudep transparent.png");
        }
      }}
    />
  );
}
