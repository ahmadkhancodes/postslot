// Postslot data model (docs/ARCHITECTURE.md section 2). All docs carry orgId; the Db driver adds `app`.

export type FormStatus = "active" | "paused" | "suspended";
export type SpamMode = "standard" | "strict" | "off";

export interface FormRules {
  maxLinks: number;
  blockedPhrases: string[];
  blockScripts: boolean;
  blockDisposable: boolean;
}

export const DEFAULT_RULES: FormRules = { maxLinks: 2, blockedPhrases: [], blockScripts: true, blockDisposable: true };

export interface Form {
  _id: string;
  orgId: string;
  name: string;
  /** Public key in the endpoint URL (22 base62 chars). */
  key: string;
  status: FormStatus;
  redirectUrl?: string;
  allowedOrigins: string[];
  spamMode: SpamMode;
  spamThreshold: number;
  rules: FormRules;
  altchaEnabled: boolean;
  subjectTemplate: string;
  recipientIds: string[];
  blockedCount: number;
  lastBlockedAt?: Date;
  lastBlockedOrigin?: string;
  createdAt: Date;
}

export interface Recipient {
  /** `${orgId}|${email}` so (org, email) is unique. */
  _id: string;
  orgId: string;
  email: string;
  verifiedAt?: Date;
  verifyTokenHash?: string;
  verifySentAt?: Date;
  source: "login" | "manual";
  /** Set on a hard bounce or complaint, cleared by unsuppress. Drives the form banner. */
  bouncedAt?: Date;
  bounceDetail?: string;
}

export type SubmissionStatus = "received" | "sorted" | "dispatched" | "delivered" | "returned" | "quarantined" | "held" | "failed";
export type HoldReason = "over_limit" | "recipient_unverified";

export interface SpamSignal {
  name: string;
  weight: number;
  detail?: string;
}

export interface Submission {
  _id: string;
  orgId: string;
  formId: string;
  receivedAt: Date;
  status: SubmissionStatus;
  fields: Record<string, string>;
  replyTo?: string;
  fromName?: string;
  subject?: string;
  searchText: string;
  emailLower?: string;
  spamScore: number;
  signals: SpamSignal[];
  /** false = content scoring did not run ("unscored"). */
  scored: boolean;
  isTest: boolean;
  holdReason?: HoldReason;
  /** True once this submission has been counted on the monthly meter. */
  metered?: boolean;
  origin?: string;
  ipHash: string;
  ua?: string;
  sortedAt?: Date;
  releasedAt?: Date;
  releasedBy?: string;
  /** Owner marked it spam (trained Bayes). */
  markedSpam?: boolean;
  country?: string;
  purgeAt?: Date;
}

export type DeliveryStatus = "queued" | "dispatched" | "accepted" | "deferred" | "returned" | "complaint" | "blocked" | "failed";

export interface Delivery {
  _id: string;
  orgId: string;
  submissionId: string;
  recipientId: string;
  recipientEmail: string;
  channel: "email";
  mailerMessageId?: string;
  status: DeliveryStatus;
  attempts: number;
  nextAttemptAt?: Date;
  lastEventAt: Date;
  lastError?: string;
  createdAt: Date;
}

export type DeliveryEventType = "received" | "sorted" | "dispatched" | "accepted" | "deferred" | "returned" | "complaint" | "blocked" | "expired" | "released";

export interface DeliveryEvent {
  _id: string;
  orgId: string;
  submissionId: string;
  deliveryId?: string;
  type: DeliveryEventType;
  at: Date;
  detail?: string;
  expireAt: Date;
}
