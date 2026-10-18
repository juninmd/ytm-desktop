import { invoke } from "@tauri-apps/api/core";
import { openUrl } from "@tauri-apps/plugin-opener";

/**
 * Authentication boundary.
 *
 * Inside the Tauri shell every call is proxied to Rust (`src-tauri/src/auth.rs`),
 * where the device flow, token refresh and SAPISIDHASH header signing live —
 * nothing secret ever reaches the webview. In a plain browser (the design
 * preview) the same state machine runs against a simulated backend so the
 * sign-in UX can be reviewed without credentials.
 */

export function isDesktop(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

export type DeviceCode = {
  /** Short code the user types on the verification page, e.g. `WDJB-MJHT`. */
  userCode: string;
  /** Opaque handle the app polls with. Never shown to the user. */
  deviceCode: string;
  verificationUrl: string;
  /** Seconds until the code stops being accepted. */
  expiresIn: number;
  /** Minimum seconds between polls, as mandated by the provider. */
  interval: number;
};

export type Session = {
  displayName: string;
  email: string;
  /** Where the session came from — surfaced in the UI so it is never ambiguous. */
  via: "device-code" | "demo";
  signedInAt: number;
};

export type PollResult =
  | { status: "pending" | "slow-down" | "denied" | "expired" }
  | { status: "granted"; session: Session };

export const authBackend = "google-device-flow";

export async function beginDeviceFlow(): Promise<DeviceCode> {
  if (isDesktop()) {
    return invoke<DeviceCode>("auth_begin_device_flow");
  }
  return mockDeviceFlow.begin();
}

export async function pollDeviceFlow(deviceCode: string): Promise<PollResult> {
  if (isDesktop()) {
    return invoke<PollResult>("auth_poll_device_flow", { deviceCode });
  }
  return mockDeviceFlow.poll();
}

export async function restoreSession(): Promise<Session | null> {
  if (isDesktop()) {
    return invoke<Session | null>("auth_restore_session");
  }
  return mockDeviceFlow.restore();
}

export async function signOut(): Promise<void> {
  if (isDesktop()) {
    await invoke("auth_sign_out");
    return;
  }
  mockDeviceFlow.clear();
}

export async function openVerificationUrl(url: string): Promise<void> {
  // The url comes from Google's device-code response; only ever open the
  // documented host, so a tampered/odd response cannot send the user elsewhere.
  if (!isAllowedVerificationUrl(url)) {
    throw new Error("URL de verificação inesperada.");
  }
  if (isDesktop()) {
    await openUrl(url);
    return;
  }
  // Preview only: a real desktop build never reaches this branch.
  window.open(url, "_blank", "noopener,noreferrer");
}

function isAllowedVerificationUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return (
      parsed.protocol === "https:" &&
      (parsed.hostname === "google.com" || parsed.hostname.endsWith(".google.com"))
    );
  } catch {
    return false;
  }
}

/* -------------------------------------------------------------------------- */
/* Preview backend                                                            */
/* -------------------------------------------------------------------------- */

/** Identity used by the credential-free preview. No real account is implied. */
export function demoSession(): Session {
  return {
    displayName: "Modo demonstração",
    email: "sem conta conectada",
    via: "demo",
    signedInAt: Date.now(),
  };
}

const DEMO_SESSION: Session = { ...demoSession(), signedInAt: 0 };

const mockDeviceFlow = (() => {
  let polls = 0;
  let granted = false;

  return {
    async begin(): Promise<DeviceCode> {
      polls = 0;
      granted = false;
      await delay(700);
      return {
        userCode: "WDJB-MJHT",
        deviceCode: "4/4-demo-device-code",
        verificationUrl: "https://www.google.com/device",
        expiresIn: 1800,
        interval: 5,
      };
    },
    async poll(): Promise<PollResult> {
      polls += 1;
      if (granted) return { status: "granted", session: { ...DEMO_SESSION, signedInAt: Date.now() } };
      // Two "pending" beats before the grant, so the waiting state is visible
      // and reviewable rather than flashing past.
      if (polls < 3) return { status: "pending" };
      granted = true;
      return { status: "granted", session: { ...DEMO_SESSION, signedInAt: Date.now() } };
    },
    async restore(): Promise<Session | null> {
      return null;
    },
    clear() {
      granted = false;
      polls = 0;
    },
  };
})();

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
