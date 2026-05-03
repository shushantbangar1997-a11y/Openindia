import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  Settings,
  KeyRound,
  CheckCircle,
  AlertCircle,
  Loader2,
  ExternalLink,
  Trash2,
} from "lucide-react";
import { apiGet, apiSend } from "@/lib/api";

type SettingsData = {
  elevenlabs_api_key: string | null;
  cartesia_api_key: string | null;
};

type ProviderConfig = {
  key: keyof SettingsData;
  label: string;
  description: string;
  docsUrl: string;
  placeholder: string;
  envVar: string;
};

const PROVIDERS: ProviderConfig[] = [
  {
    key: "elevenlabs_api_key",
    label: "ElevenLabs",
    description:
      "Enables premium ElevenLabs voices across all agents, including your cloned and custom voices. Dynamically loads your full voice library.",
    docsUrl: "https://elevenlabs.io/app/settings/api-keys",
    placeholder: "sk_...",
    envVar: "ELEVENLABS_API_KEY",
  },
  {
    key: "cartesia_api_key",
    label: "Cartesia",
    description:
      "Enables Cartesia Sonic voices for ultra-low-latency multilingual calls.",
    docsUrl: "https://play.cartesia.ai/keys",
    placeholder: "Paste your Cartesia API key",
    envVar: "CARTESIA_API_KEY",
  },
];

function ApiKeyCard({
  config,
  currentValue,
  onSaved,
}: {
  config: ProviderConfig;
  currentValue: string | null;
  onSaved: (key: keyof SettingsData, value: string | null) => void;
}) {
  const [input, setInput] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [removing, setRemoving] = useState(false);

  const isSet = Boolean(currentValue);

  const onSave = async () => {
    const trimmed = input.trim();
    if (trimmed.length < 10) {
      setError("That doesn't look like a valid API key.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      await apiSend<{ settings: SettingsData }>("/settings", "PATCH", {
        [config.key]: trimmed,
      });
      onSaved(config.key, "***");
      setInput("");
    } catch (e: any) {
      setError(e?.message || "Failed to save key.");
    } finally {
      setSaving(false);
    }
  };

  const onRemove = async () => {
    if (!confirm(`Remove the global ${config.label} API key?`)) return;
    setRemoving(true);
    try {
      await apiSend<{ settings: SettingsData }>("/settings", "PATCH", {
        [config.key]: null,
      });
      onSaved(config.key, null);
    } catch (e: any) {
      setError(e?.message || "Failed to remove key.");
    } finally {
      setRemoving(false);
    }
  };

  return (
    <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
      <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold text-gray-900">{config.label}</h3>
          <p className="text-xs text-gray-400 mt-0.5">{config.description}</p>
        </div>
        {isSet && (
          <span className="flex items-center gap-1.5 px-2.5 py-1 bg-emerald-50 border border-emerald-200 text-emerald-700 text-xs font-medium rounded-full shrink-0">
            <CheckCircle className="w-3 h-3" /> Connected
          </span>
        )}
      </div>
      <div className="px-5 py-4 space-y-3">
        {isSet ? (
          <div className="flex items-center justify-between gap-3 p-3 rounded-xl bg-gray-50 border border-gray-200">
            <div className="flex items-center gap-2 text-sm text-gray-600">
              <KeyRound className="w-4 h-4 text-gray-400 shrink-0" />
              <span className="font-mono text-xs tracking-widest text-gray-500">
                ••••••••••••••••
              </span>
            </div>
            <button
              onClick={onRemove}
              disabled={removing}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-red-600 hover:text-red-700 hover:bg-red-50 rounded-lg border border-transparent hover:border-red-200 transition-all disabled:opacity-50"
            >
              {removing ? (
                <Loader2 className="w-3 h-3 animate-spin" />
              ) : (
                <Trash2 className="w-3 h-3" />
              )}
              Remove
            </button>
          </div>
        ) : (
          <>
            <div className="flex gap-2">
              <input
                type="password"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && onSave()}
                placeholder={config.placeholder}
                className="flex-1 px-3.5 py-2.5 bg-white border border-gray-200 rounded-xl text-sm font-mono text-gray-800 placeholder:text-gray-300 focus:outline-none focus:ring-2 focus:ring-violet-500/20 focus:border-violet-400"
              />
              <button
                onClick={onSave}
                disabled={saving || !input.trim()}
                className="flex items-center gap-2 px-4 py-2.5 bg-violet-600 hover:bg-violet-700 disabled:opacity-40 text-white text-xs font-semibold rounded-xl transition-colors shadow-sm shadow-violet-200 shrink-0"
              >
                {saving ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <KeyRound className="w-3.5 h-3.5" />
                )}
                Save key
              </button>
            </div>
            {error && (
              <div className="flex items-center gap-1.5 text-xs text-red-600">
                <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                {error}
              </div>
            )}
            <p className="text-xs text-gray-400">
              Get your API key from{" "}
              <a
                href={config.docsUrl}
                target="_blank"
                rel="noreferrer"
                className="text-violet-600 hover:underline inline-flex items-center gap-0.5"
              >
                {config.label} dashboard
                <ExternalLink className="w-3 h-3" />
              </a>
              . Stored securely on your server and never exposed to the browser.
            </p>
          </>
        )}
      </div>
    </div>
  );
}

export default function SettingsPage() {
  const qc = useQueryClient();
  const [settings, setSettings] = useState<SettingsData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    apiGet<{ settings: SettingsData }>("/settings")
      .then((d) => setSettings(d.settings))
      .catch(() => setSettings({ elevenlabs_api_key: null, cartesia_api_key: null }))
      .finally(() => setLoading(false));
  }, []);

  const onSaved = (key: keyof SettingsData, value: string | null) => {
    setSettings((s) => (s ? { ...s, [key]: value } : s));
    qc.invalidateQueries({ queryKey: ["agents", "catalog"] });
    qc.invalidateQueries({ queryKey: ["settings"] });
  };

  return (
    <div className="min-h-screen bg-[#F4F5F7]">
      <div className="px-8 py-8 max-w-2xl">
        <div className="mb-8">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-violet-500 to-purple-700 flex items-center justify-center shadow-sm shadow-violet-300">
              <Settings className="w-4.5 h-4.5 text-white" />
            </div>
            <h1 className="text-xl font-bold text-gray-900">Settings</h1>
          </div>
          <p className="text-sm text-gray-500 ml-12">
            Global configuration for your Rapid X workspace.
          </p>
        </div>

        <div className="mb-6">
          <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-3">
            Voice Provider API Keys
          </h2>
          <p className="text-xs text-gray-500 mb-4">
            Keys saved here apply to all agents. A key on an individual agent overrides the global key for that agent.
          </p>

          {loading ? (
            <div className="flex items-center gap-2 text-sm text-gray-400 py-8">
              <Loader2 className="w-4 h-4 animate-spin" />
              Loading settings…
            </div>
          ) : (
            <div className="space-y-4">
              {PROVIDERS.map((p) => (
                <ApiKeyCard
                  key={p.key}
                  config={p}
                  currentValue={settings?.[p.key] ?? null}
                  onSaved={onSaved}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
