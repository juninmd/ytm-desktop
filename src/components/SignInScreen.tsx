import { useState } from "react";
import {
  Check,
  Copy,
  ExternalLink,
  KeyRound,
  Loader2,
  LogIn,
  ShieldCheck,
  TriangleAlert,
} from "lucide-react";
import { Cover } from "./Cover";
import { Logo } from "./ui/Logo";
import { cn } from "../lib/cn";
import { formatTime } from "../lib/format";
import type { AuthApi } from "../hooks/useAuth";

const COVERS = ["midnight-autobahn", "sal-e-vento", "low-orbit"];

const FEATURES = [
  "Biblioteca, playlists e curtidas carregadas da sua conta",
  "Login pelo Google com código de dispositivo — sem senha no app",
  "Toca em segundo plano com controles nativos do sistema",
];

export function SignInScreen({ auth }: { auth: AuthApi }) {
  const [copied, setCopied] = useState(false);

  const copyCode = async () => {
    if (!auth.deviceCode) return;
    try {
      await navigator.clipboard.writeText(auth.deviceCode.userCode);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      setCopied(false);
    }
  };

  return (
    <div className="flex h-full">
      <section className="relative hidden min-w-0 flex-1 flex-col justify-between overflow-hidden p-12 lg:flex">
        <div
          className="pointer-events-none absolute -top-40 -left-32 size-[560px] rounded-full opacity-45 blur-3xl"
          style={{ background: "radial-gradient(circle, #ff3d5a 0%, transparent 68%)" }}
        />
        <div
          className="pointer-events-none absolute -bottom-52 left-40 size-[520px] rounded-full opacity-25 blur-3xl"
          style={{ background: "radial-gradient(circle, #ff8a3d 0%, transparent 70%)" }}
        />

        <div className="relative flex items-center gap-3">
          <Logo className="size-8" />
          <span className="text-lg font-semibold tracking-tight">YouTube Music</span>
          <span className="rounded-full border border-line px-2 py-0.5 text-[10px] font-medium text-subtle">
            protótipo desktop
          </span>
        </div>

        <div className="relative max-w-[36ch]">
          <div className="mb-10 flex items-end gap-4">
            {COVERS.map((seed, index) => (
              <Cover
                key={seed}
                seed={seed}
                title={seed}
                className={cn(
                  "h-[132px] w-[132px] rounded-lg shadow-[0_26px_60px_rgb(0_0_0/0.6)]",
                  index === 0 && "-rotate-6",
                  index === 1 && "z-10 h-[168px] w-[168px]",
                  index === 2 && "rotate-6",
                )}
              />
            ))}
          </div>

          <h1 className="text-4xl leading-[1.1] font-black tracking-tight">
            Sua música, em um app que é seu.
          </h1>
          <p className="mt-4 text-sm text-muted">
            Player nativo construído com Tauri 2, React 19 e Tailwind 4. A mesma biblioteca do
            YouTube Music, sem aba do navegador.
          </p>

          <ul className="mt-8 space-y-3">
            {FEATURES.map((feature) => (
              <li key={feature} className="flex items-start gap-3 text-sm text-fg/85">
                <Check className="mt-0.5 size-4 shrink-0 text-accent" />
                {feature}
              </li>
            ))}
          </ul>
        </div>

        <p className="relative text-xs text-subtle">
          Binário de ~6 MB · sem Electron · atualização assinada
        </p>
      </section>

      <section className="flex w-full items-center justify-center border-line bg-panel px-6 lg:w-[480px] lg:shrink-0 lg:border-l">
        <div className="w-full max-w-[360px]">{renderStep()}</div>
      </section>
    </div>
  );

  function renderStep() {
    if (auth.status === "granted") {
      return (
        <div className="rise flex flex-col items-center text-center">
          <span className="grid size-14 place-items-center rounded-full bg-accent text-white">
            <Check className="size-7" />
          </span>
          <h2 className="mt-5 text-xl font-semibold">Conta conectada</h2>
          <p className="mt-2 text-sm text-muted">Carregando sua biblioteca…</p>
          <Loader2 className="mt-6 size-5 animate-spin text-muted" />
        </div>
      );
    }

    if (auth.status === "awaiting" && auth.deviceCode) {
      return (
        <div className="rise">
          <div className="flex items-center gap-2 text-xs font-semibold tracking-wide text-accent uppercase">
            <Loader2 className="size-3.5 animate-spin" />
            Aguardando autorização
          </div>
          <h2 className="mt-3 text-xl font-semibold">Confirme no navegador</h2>
          <p className="mt-2 text-sm text-muted">
            Abrimos o Google em uma aba. Digite o código abaixo para autorizar este dispositivo.
          </p>

          <div className="mt-6 rounded-lg border border-line bg-canvas p-4">
            <p className="text-xs text-subtle">Código do dispositivo</p>
            <div className="mt-1 flex items-center gap-3">
              {/* Sized and tracked so the documented worst case — 15 'W'
                  characters — still fits. The value itself is never altered. */}
              <span className="text-xl font-semibold tracking-[0.08em] tabular-nums break-all">
                {auth.deviceCode.userCode}
              </span>
              <button
                type="button"
                onClick={copyCode}
                className="ml-auto flex items-center gap-1.5 rounded-md border border-line px-2.5 py-1.5 text-xs text-muted transition-colors hover:border-line-strong hover:text-fg"
              >
                {copied ? <Check className="size-3.5 text-accent" /> : <Copy className="size-3.5" />}
                {copied ? "Copiado" : "Copiar"}
              </button>
            </div>
            <p className="mt-3 text-xs text-subtle">
              Expira em {formatTime(auth.secondsLeft)} · intervalo de consulta{" "}
              {auth.deviceCode.interval}s
            </p>
          </div>

          <button
            type="button"
            onClick={() => void auth.openVerification()}
            className="mt-4 flex w-full items-center justify-center gap-2 rounded-full bg-accent px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-accent-strong"
          >
            <ExternalLink className="size-4" />
            Abrir {auth.deviceCode.verificationUrl.replace("https://", "")}
          </button>

          <button
            type="button"
            onClick={auth.cancel}
            className="mt-3 w-full rounded-full px-4 py-2 text-sm text-muted transition-colors hover:text-fg"
          >
            Cancelar
          </button>
        </div>
      );
    }

    return (
      <div className="rise">
        <Logo className="size-9" />
        <h2 className="mt-5 text-2xl font-semibold tracking-tight">Entrar no YTM Desktop</h2>
        <p className="mt-2 text-sm text-muted">
          Conecte a conta do Google para carregar playlists, curtidas e histórico. Nenhuma senha é
          digitada neste app.
        </p>

        {auth.error && (
          <div className="mt-5 flex items-start gap-2.5 rounded-lg border border-accent/40 bg-accent/10 p-3 text-xs text-fg/90">
            <TriangleAlert className="mt-px size-4 shrink-0 text-accent" />
            <div>
              <p className="font-medium">Não foi possível entrar</p>
              <p className="mt-0.5 text-muted">{auth.error}</p>
            </div>
          </div>
        )}

        <button
          type="button"
          onClick={() => void auth.start()}
          className="bg-accent hover:bg-accent-strong mt-6 flex w-full items-center justify-center gap-2 rounded-full px-4 py-3 text-sm font-semibold text-white transition-colors"
        >
          <LogIn className="size-4" />
          Continuar com o Google
        </button>

        <div className="my-5 flex items-center gap-3 text-xs text-subtle">
          <span className="h-px flex-1 bg-line" />
          ou
          <span className="h-px flex-1 bg-line" />
        </div>

        <button
          type="button"
          onClick={auth.enterDemo}
          className="w-full rounded-full border border-line px-4 py-3 text-sm font-medium text-muted transition-colors hover:border-line-strong hover:text-fg"
        >
          Explorar em modo demonstração
        </button>

        <dl className="mt-7 space-y-2.5 text-xs text-subtle">
          <div className="flex items-center gap-2.5">
            <KeyRound className="size-3.5 shrink-0" />
            <dt className="sr-only">Escopo</dt>
            <dd>
              Escopo solicitado: <code className="text-muted">youtube.readonly</code>
            </dd>
          </div>
          <div className="flex items-center gap-2.5">
            <ShieldCheck className="size-3.5 shrink-0" />
            <dt className="sr-only">Armazenamento</dt>
            <dd>
              O token fica no cofre do sistema operacional, nunca no
              <code className="text-muted"> localStorage</code>
            </dd>
          </div>
        </dl>

        {auth.simulated && (
          <p className="mt-6 rounded-md border border-line px-3 py-2 text-[11px] text-subtle">
            Pré-visualização no navegador: o fluxo de dispositivo está simulado. No app Tauri, as
            mesmas chamadas chegam ao backend Rust.
          </p>
        )}
      </div>
    );
  }
}
