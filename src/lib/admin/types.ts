export interface HostSettings {
  hosts: string[];
  revision: string | null;
  updatedAt: string | null;
}

export interface AdminStatus {
  authenticated: boolean;
  authConfigured: boolean;
  storageConfigured: boolean;
}

export const MAX_ALLOWED_HOSTS = 10;
