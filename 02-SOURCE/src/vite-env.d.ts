/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_BASE_URL?: string
  readonly VITE_PORTAL_SLUG?: string
  readonly VITE_HW_SIMULATOR?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
