FROM node:20
WORKDIR /app
COPY package.json .
COPY setup.sh .
ENV TZ="Europe/Berlin"
RUN npm install
COPY . .
EXPOSE 3000
CMD npm start
