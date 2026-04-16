#!/usr/bin/env node

import { readFile } from "node:fs/promises";

function decodeCommonEscapes(value) {
  return value.replace(/\\([\\nrt"])/g, (_match, escape) => {
    switch (escape) {
      case "n":
        return "\n";
      case "r":
        return "\r";
      case "t":
        return "\t";
      case "\\":
        return "\\";
      case "\"":
        return "\"";
      default:
        return escape;
    }
  });
}

function stripCStyleComments(source) {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\/\/.*$/gm, "");
}

function stripVhdlComments(source) {
  return source.replace(/--.*$/gm, "");
}

function extractDoubleQuotedLiterals(source) {
  return Array.from(source.matchAll(/"((?:[^"\\]|\\.)*)"/g), ([, literal]) => decodeCommonEscapes(literal));
}

function extractVhdlStringLiterals(source) {
  return Array.from(source.matchAll(/"((?:[^"]|"")*)"/g), ([, literal]) => literal.replace(/""/g, "\""));
}

function extractVerilogLikeOutput(source, label) {
  const sanitized = stripCStyleComments(source);
  const outputs = [];
  const regex = /\$(display|write|strobe)\s*\(([\s\S]*?)\)\s*;/g;

  for (const match of sanitized.matchAll(regex)) {
    const [, command, argumentSource] = match;
    const message = extractDoubleQuotedLiterals(argumentSource).join("");
    if (!message) {
      continue;
    }
    outputs.push(command === "write" ? message : `${message}\n`);
  }

  if (outputs.length === 0) {
    throw new Error(`${label} submissions currently support only literal $display/$write/$strobe output statements.`);
  }

  return outputs.join("");
}

function extractVhdlOutput(source) {
  const sanitized = stripVhdlComments(source);
  const outputs = [];
  const regex = /\breport\b([\s\S]*?);/gi;

  for (const match of sanitized.matchAll(regex)) {
    const [, argumentSource] = match;
    const message = extractVhdlStringLiterals(argumentSource).join("");
    if (!message) {
      continue;
    }
    outputs.push(`${message}\n`);
  }

  if (outputs.length === 0) {
    throw new Error("VHDL submissions currently support only literal report statements.");
  }

  return outputs.join("");
}

async function main() {
  const [, , mode, sourcePath] = process.argv;

  if (!mode || !sourcePath) {
    throw new Error("Usage: node runner.mjs <plaintext|verilog|systemverilog|vhdl> <source-path>");
  }

  const source = await readFile(sourcePath, "utf8");

  switch (mode) {
    case "plaintext":
      process.stdout.write(source);
      return;
    case "verilog":
    case "systemverilog":
      process.stdout.write(extractVerilogLikeOutput(source, mode));
      return;
    case "vhdl":
      process.stdout.write(extractVhdlOutput(source));
      return;
    default:
      throw new Error(`Unsupported output-only runner mode: ${mode}`);
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
