FROM apify/actor-node-playwright-chrome:22

COPY package*.json ./

RUN npm --quiet set progress=false && npm ci --omit=dev --omit=optional

COPY . .

RUN npm run build

EXPOSE 3000

USER root

CMD ["node", "./dist/index.js"]