FROM node:20

# Install build essentials for better-sqlite3
RUN apt-get update && apt-get install -y build-essential python3 && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package*.json ./
RUN npm install

COPY . .

# Ensure data directory exists
RUN mkdir -p data

EXPOSE 3000

CMD ["npm", "start"]
