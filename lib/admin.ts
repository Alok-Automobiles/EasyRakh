export function getAdminEmails(value = process.env.ADMIN_EMAILS) {
  return new Set(
    (value || '')
      .split(',')
      .map((email) => email.trim().toLowerCase())
      .filter(Boolean)
  );
}

export function isAdminEmail(email?: string | null, adminEmails = process.env.ADMIN_EMAILS) {
  if (!email) return false;
  return getAdminEmails(adminEmails).has(email.trim().toLowerCase());
}
