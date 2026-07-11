# Étape de build
FROM node:22-slim AS builder

WORKDIR /app

COPY package*.json ./

# Installer toutes les dépendances (y compris de dev pour le build)
RUN npm install --no-audit --no-fund

# Copier le reste du code source
COPY . .

# Compiler l'application
RUN npm run build

# Étape de production
FROM node:22-slim

WORKDIR /app

# Copier uniquement les fichiers nécessaires depuis l'étape de build
COPY package*.json ./
RUN npm install --only=production --no-audit --no-fund

# Copier le serveur compilé et les fichiers statiques de Vite
COPY --from=builder /app/dist ./dist

EXPOSE 3000

ENV PORT=3000
ENV NODE_ENV=production

# Commande pour lancer le serveur
CMD ["node", "dist/server.cjs"]
