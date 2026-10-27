export let csrf = "";
export function setCsrf(value: string) {
  csrf = value;
}
export async function api<T = any>(
  path: string,
  method = "GET",
  body?: unknown,
): Promise<T> {
  const response = await fetch("/api" + path, {
    method,
    credentials: "same-origin",
    headers: { "Content-Type": "application/json", "X-CSRF-Token": csrf },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    if (response.status === 401 && !path.endsWith("/login"))
      window.dispatchEvent(new Event("clouddroid-signed-out"));
    throw new Error(
      typeof data.detail === "string"
        ? data.detail
        : Array.isArray(data.detail)
          ? data.detail.map((e: any) => e.field + ": " + e.message).join("; ")
          : "Request failed",
    );
  }
  return data;
}
export type Profile = {
  id: string;
  name: string;
  status: string;
  archived: boolean;
  label: string;
  recovery: string;
  account_status: string;
  phone_sid: string | null;
  phone: null | {
    number: string;
    capabilities: { sms: boolean; voice: boolean };
    google_verification: string;
  };
  network: {
    mode: "direct" | "proxy";
    endpoint: string;
    has_credentials: boolean;
    fail_closed: boolean;
  };
};
