export const MAX_DOMAINS = 3;
export const CHALLENGE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
export const WINDOW_MS = 10 * 60 * 1000;
export const MAX_OPERATIONS = 20;
export const MAX_SCANS = 5;
export const MAX_DAILY_SCANS = 30;

export interface VisitorDomain {
  host: string;
  token: string;
  createdAt: number;
  verifiedAt: number | null;
}

export interface VisitorRecord {
  version: 1;
  domains: VisitorDomain[];
  quota: {
    windowStart: number;
    operations: number;
    scans: number;
    day: string;
    dailyScans: number;
  };
}

export interface DomainView {
  host: string;
  recordName: string;
  recordValue: string;
  verifiedAt: string | null;
  expiresAt: string | null;
}

export interface VisitorDomains {
  domains: DomainView[];
  limits: { remainingScans: number; dailyRemaining: number; resetsAt: string };
}

export interface VisitorStatus {
  authenticated: boolean;
  loginConfigured: boolean;
  storageConfigured: boolean;
}
