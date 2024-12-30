FROM node:20
WORKDIR /app
COPY package.json .
COPY setup.sh .
RUN npm install
COPY . .
EXPOSE 3000
CMD npm start
