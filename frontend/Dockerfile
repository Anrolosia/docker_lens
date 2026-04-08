# Use an official Node.js runtime as a parent image
# Using a slim version to keep the image size down
FROM node:20-slim

# Set the working directory in the container
WORKDIR /app

# Copy package.json and package-lock.json (if available)
# This step is cached by Docker, so 'npm install' only runs when dependencies change
COPY package*.json ./

# Install project dependencies
RUN npm install

# Copy the rest of the application's source code
COPY . .

# The Vite development server runs on port 5173 by default
EXPOSE 5173

# The command to run the development server
# The '--host' flag is necessary to expose the server to the host machine
CMD ["npm", "run", "dev", "--", "--host"]