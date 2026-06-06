// Derived extractor: infers external-service integrations from already-extracted
// `package` and `env_var` facts. Unlike the per-file extractors, this runs once
// over the merged, deduped fact set (see deriveIntegrations in index.js) — it has
// no file scanning of its own.
//
// Each catalog entry maps a service to the signals that imply it:
//   - packages: dependency names (npm or python) that pull the service in
//   - envPrefixes: env-var name prefixes that configure it
// A service is reported when EITHER a package OR an env prefix matches. Evidence
// records which signals fired and the files they came from, so a reader can trace
// the inference back to source.

const CATALOG = [
  // Payments
  { name: "Stripe",            category: "payments",       packages: ["stripe", "@stripe/stripe-js", "@stripe/react-stripe-js"], envPrefixes: ["STRIPE_"] },
  { name: "PayPal",            category: "payments",       packages: ["paypalrestsdk", "@paypal/react-paypal-js"], envPrefixes: ["PAYPAL_"] },

  // Error / observability
  { name: "Sentry",            category: "observability",  packages: ["sentry-sdk", "@sentry/react", "@sentry/node", "@sentry/browser"], envPrefixes: ["SENTRY_"] },
  { name: "Datadog",           category: "observability",  packages: ["datadog", "ddtrace", "dd-trace"], envPrefixes: ["DD_", "DATADOG_"] },
  { name: "OpenTelemetry",     category: "observability",  packages: ["opentelemetry-api", "opentelemetry-sdk", "@opentelemetry/api"], envPrefixes: ["OTEL_"] },

  // Cloud storage
  { name: "Google Cloud Storage", category: "storage",    packages: ["google-cloud-storage", "@google-cloud/storage"], envPrefixes: ["GCS_", "GOOGLE_CLOUD_", "GCLOUD_"] },
  { name: "AWS S3",            category: "storage",        packages: ["boto3", "aws-sdk", "@aws-sdk/client-s3"], envPrefixes: ["AWS_", "S3_"] },
  { name: "Cloudinary",        category: "storage",        packages: ["cloudinary"], envPrefixes: ["CLOUDINARY_"] },

  // Email
  { name: "SendGrid",          category: "email",          packages: ["sendgrid", "@sendgrid/mail"], envPrefixes: ["SENDGRID_"] },
  { name: "Mailgun",           category: "email",          packages: ["mailgun", "mailgun.js"], envPrefixes: ["MAILGUN_"] },
  { name: "SMTP / Email",      category: "email",          packages: ["nodemailer"], envPrefixes: ["SMTP_", "EMAIL_"] },

  // AI / LLM
  { name: "OpenAI",            category: "ai",             packages: ["openai"], envPrefixes: ["OPENAI_"] },
  { name: "Anthropic",         category: "ai",             packages: ["anthropic", "@anthropic-ai/sdk"], envPrefixes: ["ANTHROPIC_"] },
  { name: "Google Gemini",     category: "ai",             packages: ["google-genai", "google-generativeai", "@google/generative-ai"], envPrefixes: ["GEMINI_"] },

  // Auth / identity
  { name: "Auth0",             category: "auth",           packages: ["auth0", "@auth0/auth0-react"], envPrefixes: ["AUTH0_"] },
  { name: "Clerk",             category: "auth",           packages: ["@clerk/clerk-react", "@clerk/nextjs"], envPrefixes: ["CLERK_"] },
  { name: "Firebase",          category: "auth",           packages: ["firebase", "firebase-admin"], envPrefixes: ["FIREBASE_"] },

  // Data stores / infra
  { name: "PostgreSQL",        category: "database",       packages: ["psycopg2", "psycopg2-binary", "psycopg", "pg", "asyncpg"], envPrefixes: ["POSTGRES_", "PG"] },
  { name: "Redis",             category: "cache",          packages: ["redis", "ioredis", "aioredis"], envPrefixes: ["REDIS_"] },
  { name: "MongoDB",           category: "database",       packages: ["pymongo", "mongoose", "motor"], envPrefixes: ["MONGO_", "MONGODB_"] },

  // Messaging / queues
  { name: "Celery",            category: "queue",          packages: ["celery"], envPrefixes: ["CELERY_"] },
  { name: "RabbitMQ",          category: "queue",          packages: ["pika", "amqplib"], envPrefixes: ["RABBITMQ_", "AMQP_"] },
  { name: "Kafka",             category: "queue",          packages: ["kafka-python", "kafkajs", "confluent-kafka"], envPrefixes: ["KAFKA_"] },

  // Dev platform
  { name: "GitHub API",        category: "platform",       packages: ["PyGithub", "@octokit/rest", "octokit"], envPrefixes: ["GITHUB_"] },

  // Analytics
  { name: "Segment",           category: "analytics",      packages: ["analytics-python", "@segment/analytics-next"], envPrefixes: ["SEGMENT_"] },
  { name: "PostHog",           category: "analytics",      packages: ["posthog", "posthog-js", "posthog-node"], envPrefixes: ["POSTHOG_"] },
];

// Build lookup indexes once at module load. Package names are matched
// case-insensitively (python facts are already lowercased; npm names vary).
const PACKAGE_INDEX = new Map();   // lowercased pkg name -> catalog entry
const ENV_PREFIXES = [];           // [{ prefix, entry }] checked longest-first
for (const entry of CATALOG) {
  for (const pkg of entry.packages) PACKAGE_INDEX.set(pkg.toLowerCase(), entry);
  for (const prefix of entry.envPrefixes) ENV_PREFIXES.push({ prefix, entry });
}
ENV_PREFIXES.sort((a, b) => b.prefix.length - a.prefix.length);

function matchEnvPrefix(name) {
  for (const { prefix, entry } of ENV_PREFIXES) {
    if (name.startsWith(prefix)) return entry;
  }
  return null;
}

// Derive integration facts from the merged package/env_var facts.
// Returns one `integration` fact per detected service, with evidence listing the
// matched packages, env vars, and the files they were found in.
export function deriveIntegrations(facts) {
  // service name -> { entry, packages:Set, envVars:Set, files:Set }
  const hits = new Map();

  function record(entry, signal, value, file) {
    let hit = hits.get(entry.name);
    if (!hit) {
      hit = { entry, packages: new Set(), envVars: new Set(), files: new Set() };
      hits.set(entry.name, hit);
    }
    if (signal === "package") hit.packages.add(value);
    else hit.envVars.add(value);
    if (file) hit.files.add(file);
  }

  for (const fact of facts) {
    if (fact.kind === "package") {
      const entry = PACKAGE_INDEX.get(fact.name.toLowerCase());
      if (entry) record(entry, "package", fact.name, fact.evidence?.[0]?.file);
    } else if (fact.kind === "env_var") {
      const entry = matchEnvPrefix(fact.name);
      if (entry) record(entry, "env", fact.name, fact.evidence?.[0]?.file);
    }
  }

  const integrations = [];
  for (const { entry, packages, envVars, files } of hits.values()) {
    // A package signal is strong (the SDK is a declared dependency); an env-only
    // match is weaker (a configured name prefix). Reflect that in the layer.
    const layer = packages.size > 0 ? "ast" : "heuristic";
    integrations.push({
      kind: "integration",
      name: entry.name,
      category: entry.category,
      evidence: [...files].sort().map((file) => ({ file })),
      signals: {
        packages: [...packages].sort(),
        envVars: [...envVars].sort(),
      },
      layer,
    });
  }

  integrations.sort((a, b) => a.name.localeCompare(b.name));
  return integrations;
}
