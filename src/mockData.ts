import { NailTechnician, Post } from './types';

export const INITIAL_TECHNICIANS: NailTechnician[] = [
  {
    id: 'tech_1',
    name: 'Clara Laurent',
    username: 'clara_nails_paris',
    avatar: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150&auto=format&fit=crop&q=80',
    city: 'Paris',
    bio: 'Prothésiste ongulaire certifiée. Spécialiste du Nail Art minimaliste et de la manucure russe pour des ongles parfaits et sains en Île-de-France.',
    rating: 4.9,
    reviewsCount: 124,
    tags: ['Nail Art', 'Manucure Russe', 'Gel'],
    services: [
      { id: 'srv_1_1', name: 'Manucure Russe + Semi-permanent', price: 45, duration: '1h 00' },
      { id: 'srv_1_2', name: 'Rallongement Chablons (Gel)', price: 75, duration: '2h 00' },
      { id: 'srv_1_3', name: 'Nail Art Minimaliste (par ongle)', price: 3, duration: '15 min' },
      { id: 'srv_1_4', name: 'Dépose + Soin fortifiant', price: 20, duration: '30 min' }
    ]
  },
  {
    id: 'tech_2',
    name: 'Inès Chevalier',
    username: 'ines_nailstudio',
    avatar: 'https://images.unsplash.com/photo-1544005313-94ddf0286df2?w=150&auto=format&fit=crop&q=80',
    city: 'Versailles',
    bio: 'Passionnée par les couleurs vibrantes et le Nail Art 3D. Bienvenue dans mon cocon versaillais dédié à la beauté de vos mains.',
    rating: 4.8,
    reviewsCount: 89,
    tags: ['Nail Art 3D', 'Couleurs Vibrantes', 'Capsules'],
    services: [
      { id: 'srv_2_1', name: 'Pose complète de capsules gel soft', price: 65, duration: '1h 30' },
      { id: 'srv_2_2', name: 'Semi-permanent avec renfort (gainage)', price: 40, duration: '1h 15' },
      { id: 'srv_2_3', name: 'Nail Art 3D / Strass (les 10 doigts)', price: 25, duration: '45 min' },
      { id: 'srv_2_4', name: 'Remplissage Gel (3-4 semaines)', price: 50, duration: '1h 15' }
    ]
  },
  {
    id: 'tech_3',
    name: 'Léa Roussel',
    username: 'lea_nails_boulogne',
    avatar: 'https://images.unsplash.com/photo-1580489944761-15a19d654956?w=150&auto=format&fit=crop&q=80',
    city: 'Boulogne-Billancourt',
    bio: 'Créatrice d\'ongles uniques et sur-mesure. Ambiance chaleureuse et thé bio offert lors de votre prestation à Boulogne.',
    rating: 4.9,
    reviewsCount: 156,
    tags: ['Nail Art Abstrait', 'Gainage', 'Soin Bio'],
    services: [
      { id: 'srv_3_1', name: 'Manucure Combinée + Vernis classique', price: 30, duration: '45 min' },
      { id: 'srv_3_2', name: 'Pose de vernis semi-permanent bio-sourcé', price: 38, duration: '1h 00' },
      { id: 'srv_3_3', name: 'Gainage Gel sur ongles naturels', price: 50, duration: '1h 15' },
      { id: 'srv_3_4', name: 'Nail Art Abstrait / Effet Marbre (par ongle)', price: 4, duration: '10 min' }
    ]
  },
  {
    id: 'tech_4',
    name: 'Amandine Martinez',
    username: 'amandine_m_nails',
    avatar: 'https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?w=150&auto=format&fit=crop&q=80',
    city: 'Saint-Denis',
    bio: 'Experte en French Manucure moderne, babyboomer et effets pailletés à Saint-Denis. Venez briller !',
    rating: 4.7,
    reviewsCount: 74,
    tags: ['French Moderne', 'Babyboomer', 'Paillettes'],
    services: [
      { id: 'srv_4_1', name: 'Semi-Permanent Mains (couleur unie)', price: 35, duration: '50 min' },
      { id: 'srv_4_2', name: 'Babyboomer / Babycolor dégradé élégant', price: 45, duration: '1h 15' },
      { id: 'srv_4_3', name: 'French Manucure moderne (couleurs/design)', price: 48, duration: '1h 15' },
      { id: 'srv_4_4', name: 'Soin des mains complet + gommage', price: 25, duration: '30 min' }
    ]
  }
];

export const INITIAL_POSTS: Post[] = [
  {
    id: 'post_1',
    technicianId: 'tech_1',
    imageUrl: 'https://images.unsplash.com/photo-1604654894610-df63bc536371?w=800&auto=format&fit=crop&q=80',
    caption: 'Un rouge intemporel avec une manucure russe soignée à la perfection. La base de l\'élégance au quotidien ✨ ❤️ #rednails #classy #manucurerusse',
    likes: 342,
    tags: ['Classique', 'Rouge', 'Manucure Russe'],
    date: 'Il y a 2 heures',
    price: 45
  },
  {
    id: 'post_2',
    technicianId: 'tech_2',
    imageUrl: 'https://images.unsplash.com/photo-1632345031435-8797b2d58045?w=800&auto=format&fit=crop&q=80',
    caption: 'Inspiration pastel et vagues rétro pour célébrer l\'arrivée du soleil ! Des teintes douces pour un effet ultra branché 🌸 ☀️ #pastelnails #retroart #versailles',
    likes: 512,
    tags: ['Pastel', 'Nail Art', 'Vagues'],
    date: 'Il y a 5 heures',
    price: 55
  },
  {
    id: 'post_3',
    technicianId: 'tech_3',
    imageUrl: 'https://images.unsplash.com/photo-1607779097040-26e80aa78e66?w=800&auto=format&fit=crop&q=80',
    caption: 'Détails à la feuille d\'or sur base nude délicate. Pour celles qui aiment la discrétion avec une touche de luxe discret ✨ 💫 #goldnails #nude #luxury #iledefrance',
    likes: 289,
    tags: ['Nude', 'Feuille d\'or', 'Minimaliste'],
    date: 'Il y a 1 jour',
    price: 60
  },
  {
    id: 'post_4',
    technicianId: 'tech_4',
    imageUrl: 'https://images.unsplash.com/photo-1519014816548-bf5fe059798b?w=800&auto=format&fit=crop&q=80',
    caption: 'Gros plan sur ce rose poudré nacré effet miroir. Parfait pour un mariage ou simplement pour se faire plaisir 💅 💍 #pinkpearl #chromenails #saintdenis',
    likes: 198,
    tags: ['Rose', 'Chrome', 'Mariage'],
    date: 'Il y a 2 jours',
    price: 50
  },
  {
    id: 'post_5',
    technicianId: 'tech_1',
    imageUrl: 'https://images.unsplash.com/photo-1599686111247-f08200b3965b?w=800&auto=format&fit=crop&q=80',
    caption: 'French manucure réinventée avec un liseré vert matcha hyper tendance ! Qu\'en pensez-vous ? 🍵 💚 #frenchmodern #matchanails #nailartparis #iledefrance',
    likes: 415,
    tags: ['French', 'Matcha', 'Tendance'],
    date: 'Il y a 3 jours',
    price: 48
  },
  {
    id: 'post_6',
    technicianId: 'tech_3',
    imageUrl: 'https://images.unsplash.com/photo-1604902396830-aca29e19b067?w=800&auto=format&fit=crop&q=80',
    caption: 'Finition mate velours sur des motifs abstraits terra cotta. Un rendu organique et artistique unique 🎨 🍂 #mattenails #terracotta #boulogne',
    likes: 263,
    tags: ['Matte', 'Abstrait', 'Terra Cotta'],
    date: 'Il y a 4 jours',
    price: 50
  },
  {
    id: 'post_7',
    technicianId: 'tech_2',
    imageUrl: 'https://images.unsplash.com/photo-1629198688000-71f23e745b6e?w=800&auto=format&fit=crop&q=80',
    caption: 'Reflets holographiques hypnotisants sous la lumière naturelle ! Change de couleur selon l\'angle de vue 🦄 ✨ #holonails #magic #glitter #versailles',
    likes: 678,
    tags: ['Holographique', 'Paillettes', 'Effet magique'],
    date: 'Il y a 6 jours',
    price: 65
  },
  {
    id: 'post_8',
    technicianId: 'tech_4',
    imageUrl: 'https://images.unsplash.com/photo-1522337360788-8b13dee7a37e?w=800&auto=format&fit=crop&q=80',
    caption: 'Un babyboomer ultra fondu pour un rendu extrêmement naturel et propre. L\'élégance absolue à l\'état pur 🕊️ #babyboomer #naturalbeauty #saintdenis',
    likes: 312,
    tags: ['Babyboomer', 'Naturel', 'Classique'],
    date: 'Il y a 1 semaine',
    price: 45
  }
];
