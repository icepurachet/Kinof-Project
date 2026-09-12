import { isStaffAdmin, isSuperAdmin } from "./roles";

export function getDisplayName(user) {
  if (isSuperAdmin(user?.userType)) return user?.jobTitle || "ผู้ดูแลสูงสุด";
  if (isStaffAdmin(user?.userType)) return user?.jobTitle || "ผู้ดูแลระบบ";
  if (!user?.firstName) return "ผู้ใช้งาน";

  const lastInitial = user.lastName?.trim()?.[0];
  return lastInitial ? `${user.firstName} ${lastInitial}.` : user.firstName;
}
