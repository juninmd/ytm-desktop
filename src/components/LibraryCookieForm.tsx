import { useState } from "react";
import { Check, Cookie, Loader2, TriangleAlert } from "lucide-react";
import { useCatalog } from "../hooks/useCatalog";

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
  const { saveCookies, clearCookies, libraryAvailable } = useCatalog();
  const [value, setValue] = useState("");
  const [state, setState] = useState<"idle" | "saving" | "error" | "done">("idle");
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

  return (
    <div className="mt-6 max-w-[62ch] rounded-lg border border-line bg-panel p-5">
      <div className="flex items-center gap-2.5">
        <Cookie className="size-4 text-accent" />
        <h2 className="text-sm font-semibold">Conectar a biblioteca do YouTube Music</h2>
      </div>

      <p className="mt-2 text-sm text-muted">
        A busca e o catálogo já funcionam. Para ver as suas playlists, curtidas e álbuns salvos, a
        API privada do YouTube Music exige o <code className="text-fg/90">Cookie</code> do navegador
        — ela não aceita o token do login. Cole o valor do cabeçalho <code>Cookie</code> de uma aba
        autenticada em <code>music.youtube.com</code>.
      </p>

      <textarea
        value={value}
        onChange={(event) => setValue(event.target.value)}
        spellCheck={false}
        rows={4}
        placeholder="VISITOR_INFO1_LIVE=…; SAPISID=…; __Secure-3PAPISID=…"
        className="mt-4 w-full resize-y rounded-md border border-line bg-canvas px-3 py-2 font-mono text-xs text-fg outline-none placeholder:text-subtle focus-visible:border-line-strong"
      />

      {(error || state === "error") && (
        <p className="mt-2 flex items-start gap-2 text-xs text-accent">
          <TriangleAlert className="mt-px size-3.5 shrink-0" />
          {error ?? "Não foi possível salvar o cookie."}
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
          {state === "done" ? "Conectado" : "Salvar cookie"}
        </button>

        {libraryAvailable && (
          <button
            type="button"
            onClick={() => void clearCookies()}
            className="rounded-full px-4 py-2 text-sm text-muted transition-colors hover:text-fg"
          >
            Desconectar
          </button>
        )}
      </div>

      <p className="mt-3 text-xs text-subtle">
        O valor fica no cofre do sistema operacional, nunca no <code>localStorage</code>, e é
        usado apenas para assinar requisições para a sua própria conta.
      </p>
    </div>
  );
}
