FROM apify/actor-node-playwright-chrome:22

COPY package*.json ./
COPY patches ./patches

RUN npm --quiet set progress=false && npm ci --omit=dev

COPY . .

RUN npm run build

ENV NO_COLOR=true

EXPOSE 3000

CMD ["npm", "start"]