FROM node:18-alpine

WORKDIR /app

# Install dependencies first (caching)
COPY package*.json ./
RUN npm install

# Copy application code
COPY . .

# Build the Next.js app
RUN npm run build

EXPOSE 3000

# Start production server
CMD ["npm", "start"]
