export type Page =
  | "Dashboard"
  | "Profiles"
  | "Android viewer"
  | "Network"
  | "Phone center"
  | "Settings";

export type NetworkMode = "direct" | "proxy";

export type ProfileStatus =
  | "stopped"
  | "starting"
  | "running"
  | "suspended"
  | "unavailable";

export interface ProfilePhone {
  sid: string;
  number: string;
  capabilities: {
    sms: boolean;
    voice: boolean;
  };
  country: string;
  google_verification: string;
  ownership: string;
  ownership_checked_at: number;
  number_type: string;
}

export interface Profile {
  id: string;
  name: string;
  status: ProfileStatus;
  archived: boolean;
  label: string;
  recovery: string;
  account_status: "user_label_only" | "not_connected";
  phone_sid: string | null;
  phone: ProfilePhone | null;
  network: {
    mode: NetworkMode;
    endpoint: string;
    has_credentials: boolean;
    fail_closed: boolean;
    location?: string;
  };
}

export interface DashboardData {
  profiles: number;
  active: number;
  runtime_configured: boolean;
  phone_configured: boolean;
  phone_status: string;
  network_status: string;
  network_checked: number;
  network_us: number;
  max_active: number;
  max_profiles: number;
  resources: {
    scope: string;
    cpu_percent: number;
    memory_used_gb: number;
    memory_total_gb: number;
  };
}

export interface SettingsData {
  public_url: string;
  runtime_enabled: boolean;
  android_image: string;
  max_active: number;
  max_profiles: number;
  session_hours: number;
  database: string;
  provider_configured: boolean;
  turn_configured: boolean;
  secrets: string;
  version: string;
}

export interface DiagnosticsData {
  status: string;
  stale?: boolean;
  ip?: string | null;
  country?: string | null;
  city?: string | null;
  is_us?: boolean | null;
  latency_ms?: number;
  checked_at?: number;
  observers?: string[];
  mode?: string;
  dns?: {
    policy: string;
    resolution?: string;
    resolver_attribution: string;
    full_leak_test: string;
  };
}

export interface ProviderNumber {
  sid: string;
  number: string;
  name: string;
  capabilities: {
    sms: boolean;
    voice: boolean;
  };
  number_type: string;
  google_verification: string;
}

export interface ProviderInventory {
  status: string;
  trial: boolean;
  account_status: string;
  numbers: ProviderNumber[];
}

export interface PhoneEventItem {
  sid: string;
  kind: "sms" | "call";
  received: number;
  from: string;
  to: string;
  body?: string;
  status: string;
  duration?: string;
}

export type AndroidKey =
  | "HOME"
  | "BACK"
  | "APP_SWITCH"
  | "ENTER"
  | "DEL"
  | "POWER"
  | "VOLUME_UP"
  | "VOLUME_DOWN";

export interface InputEventPayload {
  kind: "tap" | "swipe" | "key" | "text" | "google" | "dns-test" | "location";
  x?: number;
  y?: number;
  x2?: number;
  y2?: number;
  duration?: number;
  key?: AndroidKey;
  text?: string;
  enabled?: boolean;
}
