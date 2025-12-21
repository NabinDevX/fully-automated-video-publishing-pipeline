FROM motiadev/motia:latest

# Enable pnpm and specify version
RUN npm install -g pnpm@9

# Create app directory
WORKDIR /app

# Copy package files
COPY pnpm-lock.yaml package.json ./

# Install production dependencies only
RUN npx pnpm install --prod --frozen-lockfile

# Copy application source
COPY . .

# Expose port (match your nginx upstream)
EXPOSE 3000

# Start application
CMD ["pnpm", "run", "start"]
