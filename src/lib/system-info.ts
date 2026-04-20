import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import os from "node:os";
import { promisify } from "node:util";
import { formatNumber } from "@/lib/formatting";

const execFileAsync = promisify(execFile);
const COMMAND_TIMEOUT_MS = 1000;
const OS_RELEASE_PATH = "/etc/os-release";

export type RuntimeSystemInfo = {
  cpu: string;
  architecture: string;
  os: string;
};

type LscpuInfo = {
  architecture: string | null;
  modelName: string | null;
};

const ARCHITECTURE_PATTERNS: RegExp[] = [
  /\b(Neoverse[-\s]?[A-Z0-9]+)\b/i,
  /\b(Cortex[-\s]?[A-Z0-9]+)\b/i,
  /\b(Haswell|Broadwell|Skylake|Kaby Lake|Coffee Lake|Tiger Lake|Ice Lake|Sapphire Rapids)\b/i,
  /\b(Zen(?:\s?[1-5])?|Zen\s?\d?)\b/i,
  /\b(Apple\sM\d(?:\s(?:Pro|Max|Ultra))?)\b/i,
];

const ARCHITECTURE_LABELS: Record<string, string> = {
  aarch64: "ARM64",
  arm64: "ARM64",
  armv7l: "ARMv7",
  armv8l: "ARMv8",
  i386: "x86",
  i686: "x86",
  riscv64: "RISC-V 64",
  x64: "x86-64",
  x86_64: "x86-64",
};

let runtimeSystemInfoPromise: Promise<RuntimeSystemInfo> | undefined;

function normalizeWhitespace(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

function titleCaseSegment(value: string) {
  return value
    .toLowerCase()
    .split(/[-\s]+/)
    .filter(Boolean)
    .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
    .join("-");
}

function formatFrequency(speedMHz: number | undefined) {
  if (!speedMHz || !Number.isFinite(speedMHz) || speedMHz <= 0) {
    return null;
  }

  if (speedMHz >= 1000) {
    return `${formatNumber(speedMHz / 1000, { maximumFractionDigits: 1 })} GHz`;
  }

  return `${Math.round(speedMHz)} MHz`;
}

/** Map microarchitecture names to actual chip names where known. */
const CHIP_NAME_MAP: Record<string, string> = {
  "neoverse-n1": "Ampere Altra (Neoverse-N1)",
  "neoverse-n2": "Ampere AmpereOne (Neoverse-N2)",
  "neoverse-v1": "AWS Graviton3 (Neoverse-V1)",
  "neoverse-v2": "AWS Graviton4 (Neoverse-V2)",
};

function formatCpuLabel(model: string | null, speedMHz: number | undefined) {
  const frequency = formatFrequency(speedMHz);
  let displayModel = model;

  // Map microarchitecture to chip name
  if (model) {
    const key = model.trim().toLowerCase();
    if (CHIP_NAME_MAP[key]) {
      displayModel = CHIP_NAME_MAP[key];
    }
  }

  if (displayModel && frequency && !displayModel.includes(frequency)) {
    return `${displayModel} @ ${frequency}`;
  }

  return displayModel ?? "Unknown";
}

function formatInstructionSet(rawArchitecture: string) {
  const normalizedArchitecture = rawArchitecture.trim().toLowerCase();
  const label = ARCHITECTURE_LABELS[normalizedArchitecture] ?? rawArchitecture.toUpperCase();

  if (label.toLowerCase() === normalizedArchitecture) {
    return label;
  }

  return `${label} (${rawArchitecture})`;
}

function detectArchitectureName(cpuModel: string | null) {
  if (!cpuModel) {
    return null;
  }

  const normalizedModel = normalizeWhitespace(cpuModel);

  for (const pattern of ARCHITECTURE_PATTERNS) {
    const match = normalizedModel.match(pattern);

    if (match?.[1]) {
      const value = match[1];
      return value.includes("Apple") ? normalizeWhitespace(value) : titleCaseSegment(value);
    }
  }

  return null;
}

function parseKeyValueOutput(text: string, separator: string, stripQuotes = false): Map<string, string> {
  const entries = new Map<string, string>();

  for (const line of text.split(/\n+/)) {
    const separatorIndex = line.indexOf(separator);

    if (separatorIndex <= 0) {
      continue;
    }

    const key = normalizeWhitespace(line.slice(0, separatorIndex));
    const rawValue = line.slice(separatorIndex + 1).trim();
    const value = stripQuotes ? rawValue.replace(/^"|"$/g, "") : normalizeWhitespace(rawValue);

    if (key && value) {
      entries.set(key, value);
    }
  }

  return entries;
}

async function tryReadCommandOutput(command: string, args: string[]) {
  try {
    const { stdout } = await execFileAsync(command, args, {
      timeout: COMMAND_TIMEOUT_MS,
      maxBuffer: 64 * 1024,
    });

    const output = stdout.trim();
    return output.length > 0 ? output : null;
  } catch {
    return null;
  }
}

async function getLinuxOsName() {
  try {
    const contents = await readFile(OS_RELEASE_PATH, "utf8");
    const entries = parseKeyValueOutput(contents, "=", true);
    const prettyName = entries.get("PRETTY_NAME") ?? entries.get("NAME");
    const version = entries.get("VERSION_ID") ?? entries.get("VERSION");

    if (prettyName) {
      return prettyName;
    }

    if (version && entries.get("NAME")) {
      return `${entries.get("NAME")} ${version}`;
    }

    return null;
  } catch {
    return null;
  }
}

async function getMacOsName() {
  const [productName, productVersion] = await Promise.all([
    tryReadCommandOutput("sw_vers", ["-productName"]),
    tryReadCommandOutput("sw_vers", ["-productVersion"]),
  ]);

  if (productName && productVersion) {
    return `${normalizeWhitespace(productName)} ${normalizeWhitespace(productVersion)}`;
  }

  const fallback = productName ?? productVersion;
  return fallback ? normalizeWhitespace(fallback) : null;
}

async function getLscpuInfo(): Promise<LscpuInfo> {
  if (os.platform() !== "linux") {
    return {
      architecture: null,
      modelName: null,
    };
  }

  const output = await tryReadCommandOutput("lscpu", []);

  if (!output) {
    return {
      architecture: null,
      modelName: null,
    };
  }

  const info = parseKeyValueOutput(output, ":");

  return {
    architecture: info.get("Architecture") ?? null,
    modelName: info.get("Model name") ?? null,
  };
}

async function detectRuntimeSystemInfo(): Promise<RuntimeSystemInfo> {
  const primaryCpu = os.cpus()[0];
  const lscpuInfo = await getLscpuInfo();
  const cpuModel = normalizeWhitespace(lscpuInfo.modelName ?? primaryCpu?.model ?? "") || null;
  const cpu = formatCpuLabel(cpuModel, primaryCpu?.speed);

  const instructionSet = formatInstructionSet(lscpuInfo.architecture ?? os.arch());
  const architectureName = detectArchitectureName(lscpuInfo.modelName ?? cpuModel);
  const architecture = architectureName
    ? `${architectureName} (${instructionSet})`
    : instructionSet;

  let operatingSystem = `${os.type()} ${os.release()}`;

  if (os.platform() === "linux") {
    operatingSystem = (await getLinuxOsName()) ?? operatingSystem;
  } else if (os.platform() === "darwin") {
    operatingSystem = (await getMacOsName()) ?? operatingSystem;
  }

  return {
    cpu,
    architecture,
    os: operatingSystem,
  };
}

export function getRuntimeSystemInfo() {
  runtimeSystemInfoPromise ??= detectRuntimeSystemInfo();
  return runtimeSystemInfoPromise;
}
