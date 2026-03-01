# Use official Node.js LTS image
FROM node:20-alpine

# Set working directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci --only=production

# Copy application files
COPY . .

# Create config.json if it doesn't exist
RUN if [ ! -f config.json ]; then echo '{"leetcodeChannelId":""}' > config.json; fi

# Set environment to production
ENV NODE_ENV=production

# Run the bot
CMD ["node", "index.js"]
