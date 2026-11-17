/**
 * Converts raw technical/Prisma/SQL errors into plain, user-friendly messages.
 * Full details remain logged on the server only.
 */
export function sanitizeUserError(error: unknown, fallback = 'Something went wrong. Please review your details and try again.'): string {
  const raw = error instanceof Error ? error.message : typeof error === 'string' ? error : '';
  const msg = raw.trim();
  if (!msg) return fallback;

  const looksTechnical =
    msg.includes('prisma.') ||
    msg.includes('Invalid `') ||
    msg.includes('invocation:') ||
    msg.includes('P20') ||
    msg.includes('Unique constraint') ||
    msg.includes('Foreign key constraint') ||
    msg.includes('relation "') ||
    msg.includes('syntax error') ||
    msg.includes('ECONNREFUSED') ||
    msg.includes('ETIMEDOUT') ||
    msg.includes('TypeError:') ||
    msg.includes('ReferenceError:') ||
    msg.length > 220;

  if (looksTechnical) {
    if (msg.includes('Unique constraint')) {
      return 'A record with these exact details already exists. Please refresh and try again.';
    }
    if (msg.includes('Foreign key constraint')) {
      return 'One of the selected items (such as company, vendor, or account) is no longer available. Please refresh and select again.';
    }
    if (msg.includes('Invalid Date')) {
      return 'The date provided is invalid. Please select a valid date and try again.';
    }
    return fallback;
  }

  return msg;
}
