FROM node:20-alpine

WORKDIR /app

# Copy backend dependencies
COPY backend/package*.json ./backend/

# Install production dependencies
RUN cd backend && npm install --omit=dev

# Copy backend, frontend, and database schema files
COPY backend ./backend
COPY frontend ./frontend
COPY database ./database

ENV NODE_ENV=production
ENV PORT=5001

EXPOSE 5001

CMD ["node", "backend/server.js"]
