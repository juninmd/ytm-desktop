import { useCallback, useEffect, useRef, useState } from "react";
import {
  beginDeviceFlow,
  demoSession,
  isDesktop,
  openVerificationUrl,
  pollDeviceFlow,
  restoreSession,
  signOut,
  type DeviceCode,
  type Session,
} from "../lib/auth";

export type AuthStatus = "restoring" | "signed-out" | "awaiting" | "granted" | "error";

export type AuthApi = {
  status: AuthStatus;
  session: Session | null;
  deviceCode: DeviceCode | null;
  error: string | null;
  /** True while the preview backend stands in for the Rust one. */
  simulated: boolean;
  secondsLeft: number;
  start: () => Promise<void>;
  cancel: () => void;
  leave: () => Promise<void>;
  openVerification: () => Promise<void>;
  /** Skips authentication entirely; the prototype runs on mock catalogue data. */
  enterDemo: () => void;
};

export function useAuth(): AuthApi {
  const [status, setStatus] = useState<AuthStatus>("restoring");
  const [session, setSession] = useState<Session | null>(null);
  const [deviceCode, setDeviceCode] = useState<DeviceCode | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [secondsLeft, setSecondsLeft] = useState(0);

  /** Increments on every `cancel()` so in-flight polls can tell they are stale. */
  const generation = useRef(0);

  useEffect(() => {
    let cancelled = false;
    restoreSession()
      .then((restored) => {
        if (cancelled) return;
        setSession(restored);
        setStatus("signed-out");
      })
      .catch(() => {
        if (!cancelled) setStatus("signed-out");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Polling loop. Runs only while a device code is outstanding.
  useEffect(() => {
    if (status !== "awaiting" || !deviceCode) return;
    const run = generation.current;
    let timer = 0;

    const schedule = (seconds: number) => {
      timer = window.setTimeout(async () => {
        if (generation.current !== run) return;
        try {
          const result = await pollDeviceFlow(deviceCode.deviceCode);
          if (generation.current !== run) return;
          if (result.status === "granted") {
            // Hold on the confirmation beat before handing over to the player.
            setStatus("granted");
            window.setTimeout(() => {
              if (generation.current === run) setSession(result.session);
            }, 900);
            return;
          }
          if (result.status === "denied") {
            setError("Autorização recusada nesta conta.");
            setStatus("error");
            return;
          }
          if (result.status === "expired") {
            setError("O código expirou. Gere um novo para continuar.");
            setStatus("error");
            return;
          }
          schedule(result.status === "slow-down" ? deviceCode.interval + 5 : deviceCode.interval);
        } catch (cause) {
          if (generation.current !== run) return;
          setError(cause instanceof Error ? cause.message : String(cause));
          setStatus("error");
        }
      }, Math.max(seconds, 1) * 1000);
    };

    schedule(deviceCode.interval);
    return () => window.clearTimeout(timer);
  }, [status, deviceCode]);

  // Countdown against the provider's expiry window.
  useEffect(() => {
    if (status !== "awaiting" || !deviceCode) return;
    setSecondsLeft(deviceCode.expiresIn);
    const timer = window.setInterval(() => {
      setSecondsLeft((left) => {
        if (left <= 1) {
          window.clearInterval(timer);
          setError("O código expirou. Gere um novo para continuar.");
          setStatus("error");
          return 0;
        }
        return left - 1;
      });
    }, 1000);
    return () => window.clearInterval(timer);
  }, [status, deviceCode]);

  const start = useCallback(async () => {
    generation.current += 1;
    setError(null);
    try {
      const code = await beginDeviceFlow();
      setDeviceCode(code);
      setStatus("awaiting");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
      setStatus("error");
    }
  }, []);

  const cancel = useCallback(() => {
    generation.current += 1;
    setDeviceCode(null);
    setError(null);
    setStatus("signed-out");
  }, []);

  const leave = useCallback(async () => {
    await signOut();
    setSession(null);
    setDeviceCode(null);
    setStatus("signed-out");
  }, []);

  const openVerification = useCallback(async () => {
    if (!deviceCode) return;
    await openVerificationUrl(deviceCode.verificationUrl);
  }, [deviceCode]);

  const enterDemo = useCallback(() => {
    generation.current += 1;
    setSession(demoSession());
    setStatus("signed-out");
  }, []);

  return {
    status,
    session,
    deviceCode,
    error,
    simulated: !isDesktop(),
    secondsLeft,
    start,
    cancel,
    leave,
    openVerification,
    enterDemo,
  };
}
