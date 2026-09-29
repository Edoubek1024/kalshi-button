/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Base URL of the secret-free CORS relay (see relay/worker.js), e.g. "https://kalshi-button-relay.yourname.workers.dev". */
  readonly VITE_RELAY_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
