"use client";

import { useState, useEffect, useCallback } from "react";
import { useTranslations } from "next-intl";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { apiFetch, apiFetchJson } from "@/lib/api/client";
import type { PluginAdminProps } from "@/lib/plugins/types";
import type { OpenRouterModelInfo } from "@/lib/plugins/chat-widget/openrouter-models";
import type { GeminiModelInfo } from "@/lib/plugins/chat-widget/gemini-models";

type Provider = "openai" | "openrouter" | "claude" | "gemini";

const OPENROUTER_MODELS_ENDPOINT = "/api/v1/plugins/chat-widget/openrouter-models";
const GEMINI_MODELS_ENDPOINT = "/api/v1/plugins/chat-widget/gemini-models";

type OpenRouterModelsResponse = {
  models: OpenRouterModelInfo[];
  error: boolean;
  stale: boolean;
};

type GeminiModelsResponse = {
  models: GeminiModelInfo[];
  error: boolean;
  stale: boolean;
  keyConfigured: boolean;
};

// OpenRouter reports pricing as a per-token USD string (e.g. "0.0000003").
// Present it per 1M tokens for readability. Returns null when unparseable/absent.
function formatPricePerMillion(value: string | null): string | null {
  if (value == null) return null;
  const perToken = Number.parseFloat(value);
  if (!Number.isFinite(perToken)) return null;
  const perMillion = perToken * 1_000_000;
  if (perMillion === 0) return "$0";
  const decimals = perMillion < 1 ? 3 : 2;
  return `$${perMillion.toFixed(decimals)}`;
}

// ── Shared live model picker ──────────────────────────────────────────────────
// One picker UI reused by every provider whose model list is fetched live
// (OpenRouter, Gemini). It renders a free-text id input (the authoritative
// value), a recommended/known group, and a searchable full list — degrading
// gracefully while loading, when the live list is stale, or when no key is set.
// Provider-specific bits (how to label/search a row, its metadata line) are
// injected as callbacks so the component stays model-shape agnostic.
interface PickerModelBase {
  id: string;
  recommended: boolean;
}

interface ModelPickerLabels {
  modelLabel: string;
  modelPlaceholder: string;
  modelHint: string;
  recommended: string;
  allModels: string;
  searchLabel: string;
  searchPlaceholder: string;
  loading: string;
  stale: string;
  empty: string;
}

interface ModelPickerProps<T extends PickerModelBase> {
  /** Stable prefix for input ids (e.g. "openrouter", "gemini"). */
  idPrefix: string;
  models: T[];
  selectedId: string;
  onSelect: (id: string) => void;
  loading: boolean;
  degraded: boolean;
  /** Optional extra note shown when not loading (e.g. "enter a valid key"). */
  note?: string | null;
  search: string;
  onSearchChange: (value: string) => void;
  getPrimaryLabel: (m: T) => string;
  getSecondaryLabel: (m: T) => string | null;
  getMeta: (m: T) => string | null;
  matchesSearch: (m: T, query: string) => boolean;
  labels: ModelPickerLabels;
}

function ModelPicker<T extends PickerModelBase>({
  idPrefix,
  models,
  selectedId,
  onSelect,
  loading,
  degraded,
  note,
  search,
  onSearchChange,
  getPrimaryLabel,
  getSecondaryLabel,
  getMeta,
  matchesSearch,
  labels,
}: ModelPickerProps<T>) {
  const recommended = models.filter((m) => m.recommended);
  const query = search.trim().toLowerCase();
  const filtered = query ? models.filter((m) => matchesSearch(m, query)) : models;

  function renderOption(m: T) {
    const selected = m.id === selectedId;
    const secondary = getSecondaryLabel(m);
    const meta = getMeta(m);
    return (
      <button
        key={m.id}
        type="button"
        role="option"
        aria-selected={selected}
        onClick={() => onSelect(m.id)}
        className={`flex w-full flex-col items-start gap-0.5 rounded-md px-2 py-1.5 text-left text-sm transition-colors hover:bg-accent hover:text-accent-foreground ${selected ? "bg-accent text-accent-foreground" : ""}`}
      >
        <span className="font-medium">{getPrimaryLabel(m)}</span>
        {secondary != null && <span className="text-xs text-muted-foreground">{secondary}</span>}
        {meta != null && <span className="text-xs text-muted-foreground">{meta}</span>}
      </button>
    );
  }

  return (
    <div className="space-y-3">
      <div className="space-y-2">
        <Label htmlFor={`${idPrefix}-model-id`}>{labels.modelLabel}</Label>
        <Input
          id={`${idPrefix}-model-id`}
          value={selectedId}
          onChange={(e) => onSelect(e.target.value)}
          placeholder={labels.modelPlaceholder}
        />
        <p className="text-xs text-muted-foreground">{labels.modelHint}</p>
      </div>

      {loading && (
        <p className="text-xs text-muted-foreground" role="status" aria-live="polite">
          {labels.loading}
        </p>
      )}
      {!loading && degraded && (
        <p className="text-xs text-amber-600 dark:text-amber-400" role="status" aria-live="polite">
          {labels.stale}
        </p>
      )}
      {!loading && note != null && (
        <p className="text-xs text-amber-600 dark:text-amber-400" role="status" aria-live="polite">
          {note}
        </p>
      )}

      {recommended.length > 0 && (
        <div className="space-y-1.5">
          <p className="text-xs font-medium text-muted-foreground">{labels.recommended}</p>
          <div
            role="listbox"
            aria-label={labels.recommended}
            className="max-h-56 space-y-1 overflow-y-auto rounded-lg border border-input p-1"
          >
            {recommended.map(renderOption)}
          </div>
        </div>
      )}

      <div className="space-y-1.5">
        <Label htmlFor={`${idPrefix}-model-search`}>{labels.allModels}</Label>
        <Input
          id={`${idPrefix}-model-search`}
          type="search"
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder={labels.searchPlaceholder}
          aria-label={labels.searchLabel}
        />
        {filtered.length > 0 ? (
          <div
            role="listbox"
            aria-label={labels.allModels}
            className="max-h-56 space-y-1 overflow-y-auto rounded-lg border border-input p-1"
          >
            {filtered.map(renderOption)}
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">
            {loading ? labels.loading : labels.empty}
          </p>
        )}
      </div>
    </div>
  );
}

export default function ChatWidgetAdminConfig({ config, onSave }: PluginAdminProps) {
  const t = useTranslations("plugins.chatWidget");
  const tCommon = useTranslations("common");

  const [provider, setProvider] = useState<Provider>((config.provider as Provider) ?? "openai");
  const [openaiApiKey, setOpenaiApiKey] = useState((config.openaiApiKey as string) ?? "");
  const [openaiModel, setOpenaiModel] = useState((config.openaiModel as string) ?? "gpt-5-mini");
  const [openrouterApiKey, setOpenrouterApiKey] = useState((config.openrouterApiKey as string) ?? "");
  const [openrouterModel, setOpenrouterModel] = useState((config.openrouterModel as string) ?? "deepseek/deepseek-v4-flash");
  const [claudeApiKey, setClaudeApiKey] = useState((config.claudeApiKey as string) ?? "");
  const [claudeModel, setClaudeModel] = useState((config.claudeModel as string) ?? "claude-sonnet-4-6");
  const [geminiApiKey, setGeminiApiKey] = useState((config.geminiApiKey as string) ?? "");
  const [geminiModel, setGeminiModel] = useState((config.geminiModel as string) ?? "gemini-3.6-flash");
  const [assistantName, setAssistantName] = useState((config.assistantName as string) ?? "");
  const [systemPrompt, setSystemPrompt] = useState((config.systemPrompt as string) ?? "");
  const [knowledgeBase, setKnowledgeBase] = useState((config.knowledgeBase as string) ?? "");
  const [maxTokens, setMaxTokens] = useState((config.maxTokens as number) ?? 2048);
  const [rateLimitPerMinute, setRateLimitPerMinute] = useState((config.rateLimitPerMinute as number) ?? 10);
  const [isLoading, setIsLoading] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; error?: string } | null>(null);
  // OpenRouter live model-list picker state.
  const [openrouterModels, setOpenrouterModels] = useState<OpenRouterModelInfo[]>([]);
  const [openrouterModelsLoading, setOpenrouterModelsLoading] = useState(false);
  const [openrouterModelsDegraded, setOpenrouterModelsDegraded] = useState(false);
  const [openrouterModelsFetched, setOpenrouterModelsFetched] = useState(false);
  const [openrouterModelSearch, setOpenrouterModelSearch] = useState("");
  // Gemini live model-list picker state (mirrors the OpenRouter picker above).
  const [geminiModels, setGeminiModels] = useState<GeminiModelInfo[]>([]);
  const [geminiModelsLoading, setGeminiModelsLoading] = useState(false);
  const [geminiModelsDegraded, setGeminiModelsDegraded] = useState(false);
  const [geminiModelsKeyConfigured, setGeminiModelsKeyConfigured] = useState(true);
  const [geminiModelsFetched, setGeminiModelsFetched] = useState(false);
  const [geminiModelSearch, setGeminiModelSearch] = useState("");
  const openaiApiKeyConfigured = config.openaiApiKeyConfigured === true;
  const openrouterApiKeyConfigured = config.openrouterApiKeyConfigured === true;
  const claudeApiKeyConfigured = config.claudeApiKeyConfigured === true;
  const geminiApiKeyConfigured = config.geminiApiKeyConfigured === true;

  const currentApiKey =
    provider === "openrouter"
      ? openrouterApiKey
      : provider === "claude"
        ? claudeApiKey
        : provider === "gemini"
          ? geminiApiKey
          : openaiApiKey;
  const currentModel =
    provider === "openrouter"
      ? openrouterModel
      : provider === "claude"
        ? claudeModel
        : provider === "gemini"
          ? geminiModel
          : openaiModel;
  const currentApiKeyConfigured =
    provider === "openrouter"
      ? openrouterApiKeyConfigured
      : provider === "claude"
        ? claudeApiKeyConfigured
        : provider === "gemini"
          ? geminiApiKeyConfigured
          : openaiApiKeyConfigured;

  const providerLabels: Record<string, string> = {
    openai: t("providerOptions.openai"),
    openrouter: t("providerOptions.openrouter"),
    claude: t("providerOptions.claude"),
    gemini: t("providerOptions.gemini"),
  };
  const modelLabels: Record<string, string> = {
    "gpt-5.4-mini": "GPT-5.4 Mini",
    "gpt-5.4-nano": "GPT-5.4 Nano",
    "gpt-5-mini": "GPT-5 Mini",
    "gpt-5.4": "GPT-5.4",
    "gpt-5.4-pro": "GPT-5.4 Pro",
    "gpt-4.1": "GPT-4.1",
    "gpt-4.1-mini": "GPT-4.1 Mini",
    "gpt-4.1-nano": "GPT-4.1 Nano",
    "o4-mini": "o4-mini (Reasoning)",
    "o3-mini": "o3-mini (Reasoning)",
    "gpt-4o": "GPT-4o",
    "gpt-4o-mini": "GPT-4o Mini",
    "claude-sonnet-4-6": "Claude Sonnet 4.6",
    "claude-opus-4-6": "Claude Opus 4.6",
    "claude-sonnet-4-20250514": "Claude Sonnet 4",
    "claude-opus-4-20250514": "Claude Opus 4",
    "claude-sonnet-4-5-20250929": "Claude Sonnet 4.5",
    "claude-opus-4-5-20251101": "Claude Opus 4.5",
    // Gemini uses the live model picker (see <ModelPicker> below), not this
    // Select map — its display names come from the /gemini-models endpoint.
  };

  const fetchOpenrouterModels = useCallback(async () => {
    setOpenrouterModelsLoading(true);
    const { ok, data } = await apiFetchJson<OpenRouterModelsResponse>(
      OPENROUTER_MODELS_ENDPOINT,
      undefined,
      { models: [], error: true, stale: false },
    );
    // The endpoint returns HTTP 200 even when degraded (error/stale flags set),
    // so a degraded live list still yields the recommended shortlist here.
    setOpenrouterModels(Array.isArray(data.models) ? data.models : []);
    setOpenrouterModelsDegraded(!ok || data.error === true || data.stale === true);
    setOpenrouterModelsFetched(true);
    setOpenrouterModelsLoading(false);
  }, []);

  // Fetch the live model list the first time the OpenRouter section is shown.
  useEffect(() => {
    if (provider === "openrouter" && !openrouterModelsFetched && !openrouterModelsLoading) {
      void fetchOpenrouterModels();
    }
  }, [provider, openrouterModelsFetched, openrouterModelsLoading, fetchOpenrouterModels]);

  const fetchGeminiModels = useCallback(async () => {
    setGeminiModelsLoading(true);
    const { ok, data } = await apiFetchJson<GeminiModelsResponse>(
      GEMINI_MODELS_ENDPOINT,
      undefined,
      { models: [], error: true, stale: false, keyConfigured: false },
    );
    // The endpoint returns HTTP 200 even when degraded (error/stale) or when no
    // key is configured, so the recommended shortlist still renders here.
    setGeminiModels(Array.isArray(data.models) ? data.models : []);
    setGeminiModelsDegraded(!ok || data.error === true || data.stale === true);
    setGeminiModelsKeyConfigured(data.keyConfigured === true);
    setGeminiModelsFetched(true);
    setGeminiModelsLoading(false);
  }, []);

  // Fetch the live model list the first time the Gemini section is shown.
  useEffect(() => {
    if (provider === "gemini" && !geminiModelsFetched && !geminiModelsLoading) {
      void fetchGeminiModels();
    }
  }, [provider, geminiModelsFetched, geminiModelsLoading, fetchGeminiModels]);

  function openrouterModelMeta(m: OpenRouterModelInfo): string {
    const parts: string[] = [];
    const promptPrice = formatPricePerMillion(m.pricing.prompt);
    const completionPrice = formatPricePerMillion(m.pricing.completion);
    if (promptPrice != null && completionPrice != null) {
      parts.push(`${t("openrouterPriceIn")} ${promptPrice} · ${t("openrouterPriceOut")} ${completionPrice} ${t("openrouterPricePerM")}`);
    } else {
      parts.push(t("openrouterPriceUnavailable"));
    }
    if (m.contextLength != null && m.contextLength > 0) {
      parts.push(`${m.contextLength.toLocaleString()} ${t("openrouterContextLabel")}`);
    }
    return parts.join(" · ");
  }

  // Gemini rows surface the max input-token limit as the context hint when known.
  function geminiModelMeta(m: GeminiModelInfo): string | null {
    if (m.inputTokenLimit != null && m.inputTokenLimit > 0) {
      return `${m.inputTokenLimit.toLocaleString()} ${t("geminiTokenLimitLabel")}`;
    }
    return null;
  }

  async function handleTestConnection() {
    setIsTesting(true);
    setTestResult(null);
    try {
      const response = await apiFetch("/api/v1/plugins/chat-widget/test-connection", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          provider,
          model: currentModel,
        }),
      });
      // Parse response body once — the Response body can only be consumed once
      const data = await response.json().catch(() => ({ success: false, error: "parseError" })) as { success: boolean; error?: string };
      if (!response.ok || !data.success) {
        // Display a localized error string — never embed raw API error codes in the UI
        setTestResult({ success: false, error: tCommon("error") });
        return;
      }
      setTestResult({ success: true });
    } catch {
      setTestResult({ success: false, error: tCommon("error") });
    } finally {
      setIsTesting(false);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setIsLoading(true);
    try {
      await onSave({
        provider,
        openaiApiKey,
        openaiModel,
        openrouterApiKey,
        openrouterModel,
        claudeApiKey,
        claudeModel,
        geminiApiKey,
        geminiModel,
        assistantName,
        systemPrompt,
        knowledgeBase,
        maxTokens,
        rateLimitPerMinute,
      });
    } finally {
      setIsLoading(false);
    }
  }

  function setCurrentApiKey(value: string) {
    if (provider === "openrouter") setOpenrouterApiKey(value);
    else if (provider === "claude") setClaudeApiKey(value);
    else if (provider === "gemini") setGeminiApiKey(value);
    else setOpenaiApiKey(value);
  }

  function setCurrentModel(value: string) {
    if (provider === "openrouter") setOpenrouterModel(value);
    else if (provider === "claude") setClaudeModel(value);
    else if (provider === "gemini") setGeminiModel(value);
    else setOpenaiModel(value);
  }

  return (
    <form onSubmit={(e) => void handleSubmit(e)} className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>{t("provider")}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>{t("provider")}</Label>
            <Select value={provider} onValueChange={(v) => setProvider(v as Provider)}>
              <SelectTrigger>
                <SelectValue>{providerLabels[provider] || provider}</SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="openai" label={t("providerOptions.openai")}>{t("providerOptions.openai")}</SelectItem>
                <SelectItem value="openrouter" label={t("providerOptions.openrouter")}>{t("providerOptions.openrouter")}</SelectItem>
                <SelectItem value="claude" label={t("providerOptions.claude")}>{t("providerOptions.claude")}</SelectItem>
                <SelectItem value="gemini" label={t("providerOptions.gemini")}>{t("providerOptions.gemini")}</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>{t("apiKey")}</Label>
            <Input
              type="password"
              value={currentApiKey}
              onChange={(e) => setCurrentApiKey(e.target.value)}
              placeholder={t("apiKeyPlaceholder")}
            />
            <p className="text-xs text-muted-foreground">{t("apiKeyHint")}</p>
            {currentApiKeyConfigured && !currentApiKey ? (
              <p className="text-xs text-green-600 dark:text-green-400 font-medium">
                {t("currentKey")}: {t("storedKeyConfigured")}
              </p>
            ) : null}
            {currentApiKeyConfigured && !currentApiKey && (
              <p className="text-xs text-muted-foreground">
                {t("configuredKeyPreserved")}
              </p>
            )}
          </div>

          {provider === "openrouter" ? (
            <ModelPicker
              idPrefix="openrouter"
              models={openrouterModels}
              selectedId={openrouterModel}
              onSelect={setOpenrouterModel}
              loading={openrouterModelsLoading}
              degraded={openrouterModelsDegraded}
              search={openrouterModelSearch}
              onSearchChange={setOpenrouterModelSearch}
              getPrimaryLabel={(m) => m.name ?? m.id}
              getSecondaryLabel={(m) => (m.name != null ? m.id : null)}
              getMeta={openrouterModelMeta}
              matchesSearch={(m, q) =>
                m.id.toLowerCase().includes(q) || (m.name ?? "").toLowerCase().includes(q)
              }
              labels={{
                modelLabel: t("model"),
                modelPlaceholder: t("openrouterModelPlaceholder"),
                modelHint: t("openrouterModelHint"),
                recommended: t("openrouterRecommended"),
                allModels: t("openrouterAllModels"),
                searchLabel: t("openrouterSearchLabel"),
                searchPlaceholder: t("openrouterSearchPlaceholder"),
                loading: t("openrouterModelsLoading"),
                stale: t("openrouterModelsStale"),
                empty: t("openrouterModelsEmpty"),
              }}
            />
          ) : provider === "gemini" ? (
            <ModelPicker
              idPrefix="gemini"
              models={geminiModels}
              selectedId={geminiModel}
              onSelect={setGeminiModel}
              loading={geminiModelsLoading}
              degraded={geminiModelsDegraded}
              note={
                geminiModelsFetched && !geminiModelsKeyConfigured
                  ? t("geminiModelsNoKey")
                  : null
              }
              search={geminiModelSearch}
              onSearchChange={setGeminiModelSearch}
              getPrimaryLabel={(m) => m.displayName ?? m.id}
              getSecondaryLabel={(m) => (m.displayName != null ? m.id : null)}
              getMeta={geminiModelMeta}
              matchesSearch={(m, q) =>
                m.id.toLowerCase().includes(q) || (m.displayName ?? "").toLowerCase().includes(q)
              }
              labels={{
                modelLabel: t("model"),
                modelPlaceholder: t("geminiModelPlaceholder"),
                modelHint: t("geminiModelHint"),
                recommended: t("openrouterRecommended"),
                allModels: t("openrouterAllModels"),
                searchLabel: t("geminiSearchLabel"),
                searchPlaceholder: t("openrouterSearchPlaceholder"),
                loading: t("openrouterModelsLoading"),
                stale: t("openrouterModelsStale"),
                empty: t("openrouterModelsEmpty"),
              }}
            />
          ) : (
          <div className="space-y-2">
            <Label>{t("model")}</Label>
            <Select value={currentModel} onValueChange={(v) => { if (v) setCurrentModel(v); }}>
              <SelectTrigger>
                <SelectValue>{modelLabels[currentModel] || currentModel}</SelectValue>
              </SelectTrigger>
              <SelectContent>
                {provider === "openai" && (
                  <>
                    <SelectItem value="gpt-5.4-mini" label="GPT-5.4 Mini">GPT-5.4 Mini</SelectItem>
                    <SelectItem value="gpt-5.4-nano" label="GPT-5.4 Nano">GPT-5.4 Nano</SelectItem>
                    <SelectItem value="gpt-5-mini" label="GPT-5 Mini">GPT-5 Mini</SelectItem>
                    <SelectItem value="gpt-5.4" label="GPT-5.4">GPT-5.4</SelectItem>
                    <SelectItem value="gpt-5.4-pro" label="GPT-5.4 Pro">GPT-5.4 Pro</SelectItem>
                    <SelectItem value="gpt-4.1" label="GPT-4.1">GPT-4.1</SelectItem>
                    <SelectItem value="gpt-4.1-mini" label="GPT-4.1 Mini">GPT-4.1 Mini</SelectItem>
                    <SelectItem value="gpt-4.1-nano" label="GPT-4.1 Nano">GPT-4.1 Nano</SelectItem>
                    <SelectItem value="o4-mini" label="o4-mini (Reasoning)">o4-mini (Reasoning)</SelectItem>
                    <SelectItem value="o3-mini" label="o3-mini (Reasoning)">o3-mini (Reasoning)</SelectItem>
                    <SelectItem value="gpt-4o" label="GPT-4o">GPT-4o</SelectItem>
                    <SelectItem value="gpt-4o-mini" label="GPT-4o Mini">GPT-4o Mini</SelectItem>
                  </>
                )}
                {provider === "claude" && (
                  <>
                    <SelectItem value="claude-sonnet-4-6" label="Claude Sonnet 4.6">Claude Sonnet 4.6</SelectItem>
                    <SelectItem value="claude-opus-4-6" label="Claude Opus 4.6">Claude Opus 4.6</SelectItem>
                    <SelectItem value="claude-sonnet-4-20250514" label="Claude Sonnet 4">Claude Sonnet 4</SelectItem>
                    <SelectItem value="claude-opus-4-20250514" label="Claude Opus 4">Claude Opus 4</SelectItem>
                    <SelectItem value="claude-sonnet-4-5-20250929" label="Claude Sonnet 4.5">Claude Sonnet 4.5</SelectItem>
                    <SelectItem value="claude-opus-4-5-20251101" label="Claude Opus 4.5">Claude Opus 4.5</SelectItem>
                  </>
                )}
              </SelectContent>
            </Select>
          </div>
          )}

          <div className="flex items-center gap-2">
            <Button type="button" variant="outline" size="sm" onClick={() => void handleTestConnection()} disabled={isTesting || (!currentApiKey && !currentApiKeyConfigured)}>
              {isTesting ? tCommon("loading") : t("testConnection")}
            </Button>
            {testResult && (
              <span role="status" aria-live="polite" className={`text-sm ${testResult.success ? "text-green-600 dark:text-green-400" : "text-destructive"}`}>
                {testResult.success ? t("testSuccess") : testResult.error}
              </span>
            )}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t("systemPrompt")}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>{t("assistantName")}</Label>
            <Input
              value={assistantName}
              onChange={(e) => setAssistantName(e.target.value)}
              placeholder={t("assistantNamePlaceholder")}
            />
            <p className="text-xs text-muted-foreground">{t("assistantNameHint")}</p>
          </div>
          <div className="space-y-2">
            <Textarea
              value={systemPrompt}
              onChange={(e) => setSystemPrompt(e.target.value)}
              rows={4}
            />
            <p className="text-xs text-muted-foreground">{t("systemPromptHint")}</p>
          </div>

          <div className="space-y-2">
            <Label>{t("knowledgeBase")}</Label>
            <Textarea
              value={knowledgeBase}
              onChange={(e) => setKnowledgeBase(e.target.value)}
              rows={6}
            />
            <p className="text-xs text-muted-foreground">{t("knowledgeBaseHint")}</p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t("maxTokens")}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>{t("maxTokens")}</Label>
            <Input
              type="number"
              value={maxTokens}
              onChange={(e) => { const v = parseInt(e.target.value, 10); setMaxTokens(Number.isFinite(v) ? v : 100); }}
              min={100}
              max={8192}
            />
          </div>

          <div className="space-y-2">
            <Label>{t("rateLimitPerMinute")}</Label>
            <Input
              type="number"
              value={rateLimitPerMinute}
              onChange={(e) => { const v = parseInt(e.target.value, 10); setRateLimitPerMinute(Number.isFinite(v) ? v : 10); }}
              min={1}
              max={100}
            />
          </div>
        </CardContent>
      </Card>

      <Button type="submit" disabled={isLoading}>
        {isLoading ? tCommon("loading") : tCommon("save")}
      </Button>
    </form>
  );
}
