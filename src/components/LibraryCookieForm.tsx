import { useState } from "react";
import { Check, Cookie, Loader2, TriangleAlert } from "lucide-react";
import { useCatalog } from "../hooks/useCatalog";
import { cn } from "../lib/cn";
import { useI18n } from "../lib/i18n";

/**
 * The seam between the two YouTube Music auth schemes.
 *
 * The OAuth device flow (see `SignInScreen`) buys the official YouTube Data
 * API, but the personal YouTube Music library lives behind the private
 * InnerTube endpoints, which authenticate with the browser cookie plus a
 * per-request `SAPISIDHASH` digest — never a bearer token. This form is where
 * that cookie is handed over; it is stored only in the OS vault, by Rust.
 */
export function LibraryCookieForm() {
  const { saveCookies, clearCookies, importCookies, browsers, libraryAvailable } = useCatalog();
  const { t } = useI18n();
  const [value, setValue] = useState("");
  const [browser, setBrowser] = useState("chrome");
  const [state, setState] = useState<"idle" | "saving" | "error" | "done">("idle");
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    if (!value.trim()) return;
    setState("saving");
    setError(null);
    try {
      await saveCookies(value.trim());
      setValue("");
      setState("done");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
      setState("error");
    }
  };

  const readFromBrowser = async () => {
    setImporting(true);
    setError(null);
    setState("idle");
    try {
      const outcome = await importCookies(browser);
      setState("done");
      setError(`Cookies lidos do ${outcome.browser} (${outcome.fields.length}).`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
      setState("error");
    } finally {
      setImporting(false);
    }
  };

  return (
    <div className="mt-6 max-w-[62ch] rounded-lg border border-line bg-panel p-5">
      <div className="flex items-center gap-2.5">
        <Cookie className="size-4 text-accent" />
        <h2 className="text-sm font-semibold">{t("cookie.title")}</h2>
      </div>

      <p className="mt-2 text-sm text-muted">
        {t("cookie.intro")}
        API privada do YouTube Music exige o <code className="text-fg/90">Cookie</code> do navegador
        — ela não aceita o token do login.
      </p>

      {browsers.length > 0 && (
        <div className="mt-4 rounded-md border border-line bg-canvas/60 p-3">
          <p className="text-xs font-medium text-fg/90">{t("cookie.browserHeading")}</p>
          <p className="mt-1 text-xs text-subtle">
            {t("cookie.browserHint")}
            Chrome/Edge, feche o navegador antes — ele trava o banco de cookies enquanto está
            aberto; o Firefox lê direto.
          </p>
          <div className="mt-2.5 flex items-center gap-2">
            <select
              value={browser}
              onChange={(event) => setBrowser(event.target.value)}
              className="rounded-md border border-line bg-canvas px-2.5 py-2 text-sm text-fg outline-none focus-visible:border-line-strong"
            >
              {browsers.map((name) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={() => void readFromBrowser()}
              disabled={importing}
              className="flex items-center gap-2 rounded-full border border-line px-4 py-2 text-sm font-medium text-fg transition-colors hover:border-line-strong disabled:opacity-40"
            >
              {importing && <Loader2 className="size-4 animate-spin" />}
              {t("cookie.readFromBrowser")}
            </button>
          </div>
        </div>
      )}

      <details className="mt-4" open={browsers.length === 0}>
        <summary className="cursor-pointer text-xs text-muted">{t("cookie.manual")}</summary>
        <textarea
          value={value}
          onChange={(event) => setValue(event.target.value)}
          spellCheck={false}
          rows={4}
          placeholder="VISITOR_INFO1_LIVE=…; SAPISID=…; __Secure-3PAPISID=…"
          className="mt-3 w-full resize-y rounded-md border border-line bg-canvas px-3 py-2 font-mono text-xs text-fg outline-none placeholder:text-subtle focus-visible:border-line-strong"
        />
        <p className="mt-2 text-xs text-subtle">{t("cookie.manualHint")}</p>
      </details>

      {error && (
        <p
          className={cn(
            "mt-3 flex items-start gap-2 text-xs",
            state === "error" ? "text-accent" : "text-muted",
          )}
        >
          {state === "error" ? (
            <TriangleAlert className="mt-px size-3.5 shrink-0" />
          ) : (
            <Check className="mt-px size-3.5 shrink-0 text-accent" />
          )}
          {error}
        </p>
      )}

      <div className="mt-4 flex items-center gap-3">
        <button
          type="button"
          onClick={() => void submit()}
          disabled={state === "saving" || !value.trim()}
          className="bg-accent hover:bg-accent-strong flex items-center gap-2 rounded-full px-4 py-2 text-sm font-semibold text-white transition-colors disabled:opacity-40"
        >
          {state === "saving" ? (
            <Loader2 className="size-4 animate-spin" />
          ) : state === "done" ? (
            <Check className="size-4" />
          ) : null}
          {state === "done" ? t("cookie.connected") : t("cookie.save")}
        </button>

        {libraryAvailable && (
          <button
            type="button"
            onClick={() => void clearCookies()}
            className="rounded-full px-4 py-2 text-sm text-muted transition-colors hover:text-fg"
          >
            {t("cookie.disconnect")}
          </button>
        )}
      </div>

      <p className="mt-3 text-xs text-subtle">{t("cookie.footnote")}</p>
    </div>
  );
}
