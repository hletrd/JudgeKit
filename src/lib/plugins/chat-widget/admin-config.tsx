"use client";

import { useState } from "react";
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
import { apiFetch } from "@/lib/api/client";
import type { PluginAdminProps } from "@/lib/plugins/types";

type Provider = "openai" | "claude" | "gemini";

export default function ChatWidgetAdminConfig({ config, onSave }: PluginAdminProps) {
  const t = useTranslations("plugins.chatWidget");
  const tCommon = useTranslations("common");

  const [provider, setProvider] = useState<Provider>((config.provider as Provider) ?? "openai");
  const [openaiApiKey, setOpenaiApiKey] = useState((config.openaiApiKey as string) ?? "");
  const [openaiModel, setOpenaiModel] = useState((config.openaiModel as string) ?? "gpt-5-mini");
  const [claudeApiKey, setClaudeApiKey] = useState((config.claudeApiKey as string) ?? "");
  const [claudeModel, setClaudeModel] = useState((config.claudeModel as string) ?? "claude-sonnet-4-6");
  const [geminiApiKey, setGeminiApiKey] = useState((config.geminiApiKey as string) ?? "");
  const [geminiModel, setGeminiModel] = useState((config.geminiModel as string) ?? "gemini-3.1-flash-lite-preview");
  const [assistantName, setAssistantName] = useState((config.assistantName as string) ?? "");
  const [systemPrompt, setSystemPrompt] = useState((config.systemPrompt as string) ?? "");
  const [knowledgeBase, setKnowledgeBase] = useState((config.knowledgeBase as string) ?? "");
  const [maxTokens, setMaxTokens] = useState((config.maxTokens as number) ?? 2048);
  const [rateLimitPerMinute, setRateLimitPerMinute] = useState((config.rateLimitPerMinute as number) ?? 10);
  const [isLoading, setIsLoading] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; error?: string } | null>(null);
  const openaiApiKeyConfigured = config.openaiApiKeyConfigured === true;
  const claudeApiKeyConfigured = config.claudeApiKeyConfigured === true;
  const geminiApiKeyConfigured = config.geminiApiKeyConfigured === true;

  const currentApiKey = provider === "claude" ? claudeApiKey : provider === "gemini" ? geminiApiKey : openaiApiKey;
  const currentModel = provider === "claude" ? claudeModel : provider === "gemini" ? geminiModel : openaiModel;
  const currentApiKeyConfigured =
    provider === "claude"
      ? claudeApiKeyConfigured
      : provider === "gemini"
        ? geminiApiKeyConfigured
        : openaiApiKeyConfigured;

  const providerLabels: Record<string, string> = {
    openai: t("providerOptions.openai"),
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
    "gemini-3.1-flash-lite-preview": "Gemini 3.1 Flash Lite",
    "gemini-3.1-pro-preview": "Gemini 3.1 Pro",
    "gemini-2.5-pro": "Gemini 2.5 Pro",
    "gemini-2.5-flash": "Gemini 2.5 Flash",
    "gemini-2.5-flash-lite": "Gemini 2.5 Flash Lite",
    "gemini-2.0-flash": "Gemini 2.0 Flash",
  };

  async function handleTestConnection() {
    setIsTesting(true);
    setTestResult(null);
    try {
      const response = await apiFetch("/api/v1/plugins/chat-widget/test-connection", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          provider,
          apiKey: currentApiKey,
          model: currentModel,
        }),
      });
      const data = await response.json();
      setTestResult(data);
    } catch {
      setTestResult({ success: false, error: "Network error" });
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
    if (provider === "claude") setClaudeApiKey(value);
    else if (provider === "gemini") setGeminiApiKey(value);
    else setOpenaiApiKey(value);
  }

  function setCurrentModel(value: string) {
    if (provider === "claude") setClaudeModel(value);
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
              <p className="text-xs text-green-600 font-medium">
                {t("currentKey")}: {t("storedKeyConfigured")}
              </p>
            ) : null}
            {currentApiKeyConfigured && !currentApiKey && (
              <p className="text-xs text-muted-foreground">
                {t("configuredKeyPreserved")}
              </p>
            )}
          </div>

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
                {provider === "gemini" && (
                  <>
                    <SelectItem value="gemini-3.1-flash-lite-preview" label="Gemini 3.1 Flash Lite">Gemini 3.1 Flash Lite</SelectItem>
                    <SelectItem value="gemini-3.1-pro-preview" label="Gemini 3.1 Pro">Gemini 3.1 Pro</SelectItem>
                    <SelectItem value="gemini-2.5-pro" label="Gemini 2.5 Pro">Gemini 2.5 Pro</SelectItem>
                    <SelectItem value="gemini-2.5-flash" label="Gemini 2.5 Flash">Gemini 2.5 Flash</SelectItem>
                    <SelectItem value="gemini-2.5-flash-lite" label="Gemini 2.5 Flash Lite">Gemini 2.5 Flash Lite</SelectItem>
                    <SelectItem value="gemini-2.0-flash" label="Gemini 2.0 Flash">Gemini 2.0 Flash</SelectItem>
                  </>
                )}
              </SelectContent>
            </Select>
          </div>

          <div className="flex items-center gap-2">
            <Button type="button" variant="outline" size="sm" onClick={() => void handleTestConnection()} disabled={isTesting || !currentApiKey}>
              {isTesting ? tCommon("loading") : t("testConnection")}
            </Button>
            {testResult && (
              <span className={`text-sm ${testResult.success ? "text-green-600" : "text-destructive"}`}>
                {testResult.success ? t("testSuccess") : t("testFailed", { error: testResult.error ?? "" })}
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
              onChange={(e) => setMaxTokens(Number(e.target.value))}
              min={100}
              max={8192}
            />
          </div>

          <div className="space-y-2">
            <Label>{t("rateLimitPerMinute")}</Label>
            <Input
              type="number"
              value={rateLimitPerMinute}
              onChange={(e) => setRateLimitPerMinute(Number(e.target.value))}
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
