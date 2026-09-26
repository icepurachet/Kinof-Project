import { apiFetch } from "./auth";

export function getBehavior() {
  return apiFetch("/lab/behavior");
}
