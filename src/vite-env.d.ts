/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** '1' enables hidden presentation-recovery shortcuts in a production build. */
  readonly VITE_PRESENTATION?: string;
  /** 'HIGH' | 'BALANCED' forces a quality preset. */
  readonly VITE_QUALITY?: string;
}
