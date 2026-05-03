export const ADMIN_EMAILS = [
  'mugilvannan@myipstrategy.com',
  'mugil2927@gmail.com',
];

export function isAdminEmail(email: string): boolean {
  return ADMIN_EMAILS.includes(email.toLowerCase().trim());
}
