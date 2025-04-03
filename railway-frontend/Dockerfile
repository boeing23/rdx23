# Build stage
FROM node:16-alpine as build

# Set Node.js options for more memory and disable source maps to reduce build size
ENV NODE_OPTIONS="--max-old-space-size=4096"
ENV GENERATE_SOURCEMAP=false
ENV CI=false

WORKDIR /app

# Copy package files first to leverage Docker cache
COPY package.json package-lock.json ./

# Clean install with legacy-peer-deps
RUN npm ci --legacy-peer-deps || npm install --legacy-peer-deps

# Copy the rest of the application
COPY . .

# Show installed packages for debugging
RUN npm list --depth=0

# Build with detailed logging if it fails
RUN npm run build --legacy-peer-deps

# Production stage - use a smaller image
FROM node:16-alpine as production

# Set production environment
ENV NODE_ENV=production
# Default port fallback
ENV PORT=3000

WORKDIR /app

# Install serve globally
RUN npm install -g serve

# Copy only the build folder from the build stage
COPY --from=build /app/build ./build

# Start the app with the PORT environment variable or default to 3000
CMD ["sh", "-c", "serve -s build -l ${PORT:-3000}"] 