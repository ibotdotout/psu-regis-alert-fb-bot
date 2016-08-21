FROM mhart/alpine-node

WORKDIR /app
ADD package.json /app

RUN npm install --prod

ADD . /app
CMD npm start
