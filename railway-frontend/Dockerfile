FROM node:16-alpine

WORKDIR /app

# Copy package.json and package-lock.json
COPY package*.json ./

# Install dependencies with legacy-peer-deps flag
RUN npm install --legacy-peer-deps

# Copy all files
COPY . .

# Build the app
RUN npm run build --legacy-peer-deps

# Install serve to run the application
RUN npm install -g serve

# Start the app
CMD serve -s build -l $PORT 