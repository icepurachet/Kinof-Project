import { apiFetch, readStoredAuth } from "./auth";
import { isStaffAdmin } from "../utils/roles";
export function getNavBadges() {
  const user = readStoredAuth()?.user;
  return apiFetch(isStaffAdmin(user?.userType ?? user?.role) ? "/lab/admin/nav-badges" : "/lab/nav-badges");
}
