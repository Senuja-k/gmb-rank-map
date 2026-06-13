export const ROLES = ["super_admin", "admin", "user"];

export function canCreateRole(actorRole, targetRole) {
  if (actorRole === "super_admin") return ROLES.includes(targetRole);
  if (actorRole === "admin") return targetRole === "user";
  return false;
}

export function canChangeRole(actorRole, currentRole, nextRole) {
  if (actorRole !== "super_admin") return false;
  if (!ROLES.includes(currentRole) || !ROLES.includes(nextRole)) return false;
  return true;
}

export function canDisableRole(actorRole, targetRole) {
  if (actorRole === "super_admin") return targetRole === "admin" || targetRole === "user";
  if (actorRole === "admin") return targetRole === "user";
  return false;
}
