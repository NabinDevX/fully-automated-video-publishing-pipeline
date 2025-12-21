# ===========================
# STAGE 1 — BUILD THE WEB APP
# ===========================
FROM node:lts-alpine AS builder

# Enable pnpm
RUN corepack enable && corepack prepare pnpm@9 --activate

# Set working directory
WORKDIR /app

# Copy dependency files
COPY package.json pnpm-lock.yaml ./

# Install dependencies
RUN pnpm install --frozen-lockfile

# Copy source files
COPY . .

# Build for production
RUN pnpm run build


# ===========================
# STAGE 2 — RUN FRONTEND
# ===========================
FROM node:lts-alpine AS runner

# Enable pnpm
RUN corepack enable && corepack prepare pnpm@9 --activate

# Set working directory
WORKDIR /app

# Copy package files
COPY package.json pnpm-lock.yaml ./

# Install only production dependencies
RUN pnpm install --prod --frozen-lockfile

# Copy built files from builder
COPY --from=builder /app/dist ./dist

# Expose port
EXPOSE 4173

# Run vite preview
CMD ["pnpm", "run", "preview", "--", "--host", "0.0.0.0", "--port", "4173"]
