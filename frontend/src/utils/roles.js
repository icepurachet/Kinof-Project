export function isStaffAdmin(userType) {
  return userType === "admin" || isSuperAdmin(userType);
}

export function isSuperAdmin(userType) {
  return userType === "super_admin" || userType === "superadmin";
}
