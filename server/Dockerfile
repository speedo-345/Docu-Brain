FROM node:18-alpine

WORKDIR /app

# Install dependencies
COPY package*.json ./
RUN npm install

# Copy code
COPY . .

# Build TypeScript to JS
RUN npm run build

EXPOSE 5000

# Run compiled index.js from dist or build directory, but since this project
# uses ts-node for 'npm start', we'll just run npm start.
CMD ["npm", "start"]
