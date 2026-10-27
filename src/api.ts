import { dispatchControlPlane } from "./services/controlPlane";
import type { Profile } from "./types";

export type { Profile };

export let csrf = "";

export function setCsrf(value: string): void {
  csrf = value;
}

export async function api<T = any>(
  path: string,
  method = "GET",
  body?: unknown,
): Promise<T> {
  try {
    return (await dispatchControlPlane(path, method, body, csrf)) as T;
  } catch (err) {
    const status = (err as { status?: number })?.status;
    if (status === 401 && !path.endsWith("/login")) {
      window.dispatchEvent(new Event("clouddroid-signed-out"));
    }
    throw err instanceof Error ? err : new Error("Request failed");
  }
}
