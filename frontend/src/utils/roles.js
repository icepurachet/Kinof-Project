export function isStaffAdmin(userType) {
  return userType === "admin" || userType === "superadmin";
}

export function isSuperAdmin(userType) {
  return userType === "superadmin";
}
