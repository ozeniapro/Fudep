# Étape de build
FROM node:22-slim AS builder

WORKDIR /app

# Copier les fichiers de dépendances
COPY package*.json ./

# Installer toutes les dépendances (y compris de dev pour le build)
RUN npm install --no-audit --no-fund

# Copier le reste du code source
COPY . .

# Compiler l'application pour la production
RUN npm run build

# Étape de production
FROM node:22-slim

WORKDIR /app

# Définir l'environnement de production
ENV NODE_ENV=production

# Copier uniquement les fichiers nécessaires depuis l'étape de build
COPY package*.json ./
RUN npm install --only=production --no-audit --no-fund

# Copier le serveur compilé et les fichiers statiques de Vite
COPY --from=builder /app/dist ./dist

# Exposer le port de production
EXPOSE 3000

# Lancer le serveur de production
CMD ["node", "dist/server.cjs"]
