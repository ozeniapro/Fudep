export interface NailService {
  id: string;
  name: string;
  price: number;
  duration: string;
  description?: string;
  imageUrl?: string;
}

export interface NailTechnician {
  id: string;
  name: string;
  username: string;
  avatar: string;
  city: string;
  bio: string;
  rating: number;
  reviewsCount: number;
  services: NailService[];
  tags: string[];
  freeSlots?: string[]; // Admin-added open booking slots
}

export interface Post {
  id: string;
  technicianId: string;
  imageUrl: string;
  caption: string;
  likes: number;
  tags: string[];
  date: string;
  price?: number;
}

export interface BookingRequest {
  id: string;
  technicianId: string;
  technicianName: string;
  serviceId: string;
  serviceName: string;
  price: number;
  clientFirstName: string;
  clientPhone: string;
  clientEmail: string;
  desiredDate: string;
  desiredTime: string;
  alternativeAvailabilities: string;
  message: string;
  status: 'pending' | 'confirmed' | 'refused' | 'proposed' | 'completed';
  createdAt: string;
  depositPaid?: number;
  cardUsed?: string;
  proposedDate?: string; // Proposed alternative date/time
  modelPhoto?: string; // Client uploaded model photo (Data URL)
  postRefId?: string; // Reference of the post from which the reservation was made
}

export interface UserAccount {
  name: string;
  email: string;
  phone: string;
  city: string;
  password?: string;
  favorites?: string[];
  likedPosts?: string[];
}

export interface Analytics {
  profileClicks: Record<string, number>;
  feedViewsCount: number;
  bookingAttempts: number;
  bookingsCompleted: number;
  favoritesCount: number;
  viewDetailsCount: number;
}

export interface UserSession {
  isLoggedIn: boolean;
  name?: string;
  email?: string;
  phone?: string;
  favorites: string[]; // List of technicianIds
  likedPosts: string[]; // List of postIds
}

export interface FAQItem {
  id: string;
  category: string;
  question: string;
  answer: string;
}
