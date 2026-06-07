const RE = (s, flags = "i") => new RegExp(s, flags);

const PACKAGES = (...names) => RE(`^(${names.join("|")})$`);

export const DEFAULT_CATALOG = [
  {
    name: "auth",
    signatures: [
      {
        kind: "package", nameRegex: PACKAGES(
          "passport", "next-auth", "@auth0\\/[^/]+", "lucia", "authlib",
          "firebase", "firebase-admin", "@clerk\\/[^/]+",
          "@supabase\\/supabase-js", "jsonwebtoken", "jose"
        ),
        role: "library",
      },
      {
        kind: "integration", nameRegex: /^(clerk|auth0|firebase|supabase)$/i,
        role: "provider",
      },
      {
        kind: "env_var", nameRegex: /^(JWT_|SESSION_|OAUTH_|AUTH_)/i,
        role: "credential",
      },
      {
        kind: "api_route", nameRegex: /\/(?:auth|login|logout|session|oauth|register|signup|signin|sso|token|refresh|me)(?:\/|\s|$)/i,
        role: "endpoint",
      },
      {
        kind: "db_model", nameRegex: /^(User|Account|Session|Token|RefreshToken|Identity|Credential)$/,
        pathRegex: /(?:auth|user|account|session|login|identity)/i,
        role: "entity",
      },
    ],
  },
  {
    name: "payment",
    signatures: [
      {
        kind: "package", nameRegex: PACKAGES(
          "stripe", "@stripe\\/[^/]+", "paypalrestsdk", "@paypal\\/[^/]+",
          "braintree", "@braintree\\/[^/]+", "square", "lemonsqueezy"
        ),
        role: "library",
      },
      {
        kind: "integration", nameRegex: /^(stripe|paypal|braintree|square)$/i,
        role: "provider",
      },
      {
        kind: "env_var", nameRegex: /^(STRIPE_|PAYPAL_|BRAINTREE_|SQUARE_)/i,
        role: "credential",
      },
      {
        kind: "api_route", nameRegex: /\/(?:payment|checkout|billing|stripe|subscription|invoice|charge|customer)(?:\/|\s|$)/i,
        role: "endpoint",
      },
      {
        kind: "db_model", nameRegex: /^(Payment|Subscription|Invoice|Charge|Plan|Order|Customer)$/,
        pathRegex: /(?:payment|billing|checkout|subscription|order)/i,
        role: "entity",
      },
    ],
  },
  {
    name: "file_storage",
    signatures: [
      {
        kind: "package", nameRegex: PACKAGES(
          "boto3", "@aws-sdk\\/[^/]+", "aws-sdk", "google-cloud-storage",
          "@google-cloud\\/storage", "cloudinary", "azure-storage-blob",
          "@azure\\/storage-blob", "@supabase\\/storage-js"
        ),
        role: "library",
      },
      {
        kind: "integration", nameRegex: /^(s3|gcs|cloudinary|azure_blob)$/i,
        role: "provider",
      },
      {
        kind: "env_var", nameRegex: /^(S3_|AWS_|GCS_|GOOGLE_CLOUD_|GCLOUD_|CLOUDINARY_|AZURE_)/i,
        role: "credential",
      },
      {
        kind: "api_route", nameRegex: /\/(?:upload|storage|s3|file|attachment|media|asset)(?:\/|\s|$)/i,
        role: "endpoint",
      },
    ],
  },
  {
    name: "email",
    signatures: [
      {
        kind: "package", nameRegex: PACKAGES(
          "sendgrid", "@sendgrid\\/mail", "mailgun", "nodemailer",
          "mjml", "postmark", "@postmark\\/postmark-client",
          "aws-sdk", "@aws-sdk\\/client-ses", "resend", "react-email"
        ),
        role: "library",
      },
      {
        kind: "integration", nameRegex: /^(sendgrid|mailgun|smtp|postmark|ses|resend)$/i,
        role: "provider",
      },
      {
        kind: "env_var", nameRegex: /^(SENDGRID_|MAILGUN_|SMTP_|EMAIL_|POSTMARK_|RESEND_)/i,
        role: "credential",
      },
      {
        kind: "api_route", nameRegex: /\/(?:email|mail|send-mail|sendgrid|mailgun)(?:\/|\s|$)/i,
        role: "endpoint",
      },
    ],
  },
  {
    name: "notifications",
    signatures: [
      {
        kind: "package", nameRegex: PACKAGES(
          "onesignal", "@onesignal\\/[^/]+", "pusher", "pusher-js",
          "@react-native-firebase\\/messaging",
          "firebase-admin", "web-push", "apn", "@parse\\/node-apn"
        ),
        role: "library",
      },
      {
        kind: "integration", nameRegex: /^(onesignal|pusher|fcm|apn|web_push)$/i,
        role: "provider",
      },
      {
        kind: "env_var", nameRegex: /^(FCM_|ONESIGNAL_|PUSHER_|APN_|VAPID_)/i,
        role: "credential",
      },
      {
        kind: "api_route", nameRegex: /\/(?:notify|notification|push|alert)(?:\/|\s|$)/i,
        role: "endpoint",
      },
    ],
  },
  {
    name: "settings",
    signatures: [
      {
        kind: "schema", nameRegex: /^(Settings|Config|AppConfig|BaseSettings)$/,
        pathRegex: /(?:settings|config)/i,
        role: "config",
      },
      {
        kind: "package", nameRegex: PACKAGES(
          "pydantic-settings", "dotenv", "python-dotenv",
          "@nestjs\\/config", "config"
        ),
        role: "library",
      },
    ],
  },
  {
    name: "health",
    signatures: [
      {
        kind: "api_route", nameRegex: /^(?:GET|POST|PUT|PATCH|DELETE)\s+\/(?:health|ping|status|ready|alive|healthz|readyz|livez)(?:\/|$)/i,
        role: "endpoint",
      },
    ],
  },
];

export function getPattern(name) {
  return DEFAULT_CATALOG.find((p) => p.name === name);
}

function validateAdditionalPattern(p) {
  if (!p || typeof p.name !== "string")
    throw new Error(`additional pattern: name (string) is required`);
  if (!Array.isArray(p.signatures) || p.signatures.length === 0)
    throw new Error(`additional pattern "${p.name}": signatures array is required and must be non-empty`);
  for (const sig of p.signatures) {
    if (typeof sig.kind !== "string")
      throw new Error(`additional pattern "${p.name}": sig.kind (string) is required`);
    if (!(sig.nameRegex instanceof RegExp))
      throw new Error(`additional pattern "${p.name}": sig.nameRegex (RegExp) is required`);
    if (typeof sig.role !== "string")
      throw new Error(`additional pattern "${p.name}": sig.role (string) is required`);
    if (sig.pathRegex !== undefined && !(sig.pathRegex instanceof RegExp))
      throw new Error(`additional pattern "${p.name}": sig.pathRegex must be RegExp if present`);
  }
}

export function buildCatalog(config) {
  const stock = config?.stock ?? {};
  const disabled = new Set(stock.disabled ?? []);
  const out = DEFAULT_CATALOG.filter((p) => !disabled.has(p.name));
  for (const p of stock.additional ?? []) {
    validateAdditionalPattern(p);
    out.push(p);
  }
  return out;
}
