import { useState } from "react";
import { loadSigningKey } from "../kalshi/signing";
import { saveCredentials, clearCredentials, type StoredCredentials } from "../kalshi/keyStore";
import { setActiveCredentials, clearActiveCredentials } from "../kalshi/client";

interface Props {
  locked: StoredCredentials | null;
  onLocked: (creds: StoredCredentials) => void;
  onUnlocked: () => void;
}

export function CredentialsSetup({ locked, onLocked, onUnlocked }: Props) {
  const [keyId, setKeyId] = useState("");
  const [pem, setPem] = useState("");
  const [kalshiEnv, setKalshiEnv] = useState<"demo" | "prod">("demo");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleLock(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!keyId.trim() || !pem.trim()) {
      setError("Both the Key ID and private key are required.");
      return;
    }
    setLoading(true);
    try {
      const loaded = await loadSigningKey(pem);
      const creds: StoredCredentials = { keyId: keyId.trim(), algorithm: loaded.algorithm, cryptoKey: loaded.cryptoKey, kalshiEnv };
      await saveCredentials(creds);
      setActiveCredentials(creds);
      setPem(""); // the raw PEM text never needs to exist in this component's state again
      onLocked(creds);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't load that key.");
    } finally {
      setLoading(false);
    }
  }

  async function handleUnlock() {
    if (!window.confirm("Remove the stored key from this browser? You'll need to paste it again to trade.")) return;
    await clearCredentials();
    clearActiveCredentials();
    setKeyId("");
    onUnlocked();
  }

  if (locked) {
    return (
      <div className="flex items-center justify-between gap-3 rounded-xl border border-emerald-800 bg-emerald-950/30 px-4 py-3">
        <div>
          <div className="text-sm font-semibold text-emerald-400">🔒 Key locked ({locked.kalshiEnv})</div>
          <div className="text-xs text-slate-500">Key ID: {locked.keyId}</div>
        </div>
        <button onClick={handleUnlock} className="shrink-0 rounded-lg border border-slate-700 px-3 py-2 text-xs text-slate-400 hover:bg-slate-800">
          Unlock / change key
        </button>
      </div>
    );
  }

  return (
    <div className="mx-auto flex min-h-screen max-w-xl flex-col justify-center gap-6 px-4 py-10">
      <div>
        <h1 className="text-2xl font-bold text-white">Kalshi Touchdown Button</h1>
        <p className="mt-1 text-sm text-slate-400">Paste your Kalshi API credentials to get started.</p>
      </div>

      <div className="rounded-lg border border-red-800 bg-red-950/40 px-4 py-3 text-sm text-red-300">
        <strong>This key will be stored in this browser</strong> and used to sign real-money trades directly
        from the page. Anyone with access to this device or browser profile — or any malicious script that
        ever runs on this page — can use it to trade on your account. Don't do this on a shared or public
        computer, and only do it if you've accepted that trade-off.
      </div>

      <form onSubmit={handleLock} className="flex flex-col gap-3 rounded-xl border border-slate-800 bg-slate-900/60 p-4">
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-slate-400">Environment</span>
          <select
            value={kalshiEnv}
            onChange={(e) => setKalshiEnv(e.target.value as "demo" | "prod")}
            disabled={loading}
            className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-white"
          >
            <option value="demo">Demo (play money)</option>
            <option value="prod">Production (real money)</option>
          </select>
        </label>

        <label className="flex flex-col gap-1 text-sm">
          <span className="text-slate-400">API Key ID</span>
          <input
            value={keyId}
            onChange={(e) => setKeyId(e.target.value)}
            disabled={loading}
            placeholder="a952bcbe-ec3b-4b5b-b8f9-11dae589608c"
            className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-white placeholder-slate-600 focus:border-emerald-500 focus:outline-none"
          />
        </label>

        <label className="flex flex-col gap-1 text-sm">
          <span className="text-slate-400">Private key (PEM)</span>
          <textarea
            value={pem}
            onChange={(e) => setPem(e.target.value)}
            disabled={loading}
            rows={8}
            placeholder="-----BEGIN RSA PRIVATE KEY-----&#10;...&#10;-----END RSA PRIVATE KEY-----"
            spellCheck={false}
            className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 font-mono text-xs text-white placeholder-slate-600 focus:border-emerald-500 focus:outline-none"
          />
        </label>

        {error && <div className="rounded-lg border border-red-800 bg-red-950/50 px-3 py-2 text-sm text-red-300">{error}</div>}

        <button
          type="submit"
          disabled={loading}
          className="rounded-lg bg-emerald-600 px-4 py-3 font-semibold text-white transition hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {loading ? "Validating key..." : "Lock key"}
        </button>
      </form>
    </div>
  );
}
