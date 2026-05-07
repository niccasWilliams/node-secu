# Step 1: Base image with Node.js
FROM node:22-alpine3.21 AS build

# Step 2: Set the working directory inside the container
WORKDIR /app

# Step 3: Copy package.json and package-lock.json
COPY package*.json ./

# Step 4: Install all dependencies
RUN npm install

# Step 5: Copy the rest of the application files
COPY . /app

# Step 6: Build the application
RUN npm run build

# Step 7: Expose the port the app will run on
EXPOSE 8088
    



# FINAL: Define the command to run your app
CMD ["npm", "run", "start:prod" ]

