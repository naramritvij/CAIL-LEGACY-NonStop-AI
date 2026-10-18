FROM node:24-alpine
WORKDIR /app
COPY package.json package-lock.json ./
# npm install is used for parity with the current repository's Docker workflow;
# the original v0 pnpm lockfile remains included for local pnpm workflows.
RUN npm ci --no-audit --no-fund
COPY . .
EXPOSE 5173
CMD ["npm", "run", "dev", "--", "--host", "0.0.0.0"]
