import { readFile } from "node:fs/promises";

export async function readIntent(intentPath) {
  const text = await readFile(intentPath, "utf8");
  return intentFromText(text, intentPath);
}

export function intentFromText(text, path = "<intent>") {
  const requirements = extractRequirements(text);

  return {
    path,
    text,
    requirements
  };
}

export function extractRequirements(text) {
  return segmentIntent(text)
    .map(normalizeRequirement)
    .filter(isRequirementCandidate)
    .map((requirementText, index) => ({
      id: `R${index + 1}`,
      text: requirementText,
      keywords: keywordsFor(requirementText)
    }));
}

function segmentIntent(text) {
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .filter((line) => !line.startsWith("#"));

  const hasBullets = lines.some((line) => /^[-*]\s+/.test(line) || /^\d+[.)]\s+/.test(line));

  if (hasBullets) {
    return lines.map((line) => line.replace(/^[-*]\s+/, "").replace(/^\d+[.)]\s+/, "").trim());
  }

  const prose = lines.join(" ");
  return splitProse(prose);
}

function splitProse(prose) {
  const segments = [];
  const parts = prose.split(/\s+(?=(?:oh and|also|eventually|additionally|but)\b)/i);

  for (const part of parts) {
    const sentences = part.split(/(?<=[.!?;])\s+/);

    for (const sentence of sentences) {
      const clauses = sentence.split(/\s+(?:i also|and then|once they(?:'re| are) in)\s+/i);
      segments.push(...clauses);
    }
  }

  return segments.map((segment) => segment.trim()).filter(Boolean);
}

function normalizeRequirement(text) {
  return text
    .replace(/^(ok so|oh and|also|eventually|i also want|i want to|i need to|want them to|there should be an?)\s+/i, "")
    .replace(/\s*\([^)]*\)\s*/g, " ")
    .replace(/\s+(?:for now|maybe later|but first|keep it simple|ship the auth \+ tasks first|at some point,?)\.?/i, "")
    .replace(/\s+/g, " ")
    .trim();
}

function isRequirementCandidate(text) {
  if (text.length < 20) {
    return false;
  }

  if (/^(ok so|i want to build|keep it simple|ship the|flip it on the client|use whatever)\b/i.test(text)) {
    return false;
  }

  return /\b(can|should|need|must|receive|approve|charge|bill|notify|notified|create|assign|activate|turn on|log in|sign up|signup|billing|webhook)\b/i.test(text);
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
    "with",
    "when",
    "where",
    "who",
    "they",
    "them",
    "their",
    "someone",
    "something",
    "actually",
    "only",
    "after",
    "before"
  ]);

  const words = text
    .toLowerCase()
    .replace(/[^a-z0-9_\s-]/g, " ")
    .split(/\s+/)
    .filter((word) => word.length > 2 && !stopWords.has(word));

  const keywords = new Set(words);

  for (const word of words) {
    if (word.endsWith("ed") && word.length > 5) {
      keywords.add(word.slice(0, -2));
    }

    if (word.startsWith("notif")) {
      keywords.add("notif");
    }
  }

  return [...keywords];
}
