FROM node:20-bookworm AS build

WORKDIR /app

COPY package*.json ./

# Install dependencies (including dev deps needed for tsx)
RUN npm install

COPY . .

# Build the SvelteKit app (outputs to /app/build)
RUN npm run build

# Production image
FROM node:20-bookworm

WORKDIR /app
ENV NODE_ENV=production

# Copy everything, including node_modules (tsx is required at runtime)
COPY --from=build /app /app

# Ensure recordings directory exists for volume mount fallback
RUN mkdir -p /app/recordings

ENV PORT=3000
EXPOSE 3000

CMD ["npm", "run", "start"]
