import { readFile } from "node:fs/promises";

export async function readIntent(intentPath) {
  const text = await readFile(intentPath, "utf8");
  const requirements = extractRequirements(text);

  return {
    path: intentPath,
    text,
    requirements
  };
}

export function extractRequirements(text) {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .filter((line) => !line.startsWith("#"))
    .map((line) => line.replace(/^[-*]\s+/, ""))
    .filter((line) => line.length >= 8)
    .map((text, index) => ({
      id: `R${index + 1}`,
      text,
      keywords: keywordsFor(text)
    }));
}

function keywordsFor(text) {
  const stopWords = new Set([
    "a",
    "an",
    "and",
    "are",
    "as",
    "be",
    "by",
    "can",
    "for",
    "from",
    "in",
    "is",
    "it",
    "of",
    "on",
    "or",
    "should",
    "the",
    "to",
    "with"
  ]);

  return [...new Set(
    text
      .toLowerCase()
      .replace(/[^a-z0-9_\s-]/g, " ")
      .split(/\s+/)
      .filter((word) => word.length > 2 && !stopWords.has(word))
  )];
}
