export function extractRequestForensics(request?: Request | { headers?: Headers | Record<string, string | string[] | undefined> } | null) {
  if (!request?.headers) {
    return { ipAddress: null as string | null, userAgent: null as string | null, deviceLabel: null as string | null };
  }
  const getHeader = (name: string): string | null => {
    if (request.headers instanceof Headers) return request.headers.get(name);
    const rec = request.headers as Record<string, string | string[] | undefined>;
    const v = rec[name] ?? rec[name.toLowerCase()];
    return Array.isArray(v) ? v[0] ?? null : v ?? null;
  };

  const forwarded = getHeader('x-forwarded-for');
  const realIp = getHeader('x-real-ip') || getHeader('cf-connecting-ip');
  const ipAddress = (forwarded ? forwarded.split(',')[0]?.trim() : realIp?.trim()) || null;
  const userAgent = getHeader('user-agent')?.trim() || null;

  let deviceLabel: string | null = null;
  if (userAgent) {
    const ua = userAgent.toLowerCase();
    const browser = ua.includes('edg/') ? 'Edge'
      : ua.includes('chrome/') ? 'Chrome'
      : ua.includes('firefox/') ? 'Firefox'
      : ua.includes('safari/') && !ua.includes('chrome/') ? 'Safari'
      : ua.includes('dart/') || ua.includes('flutter') ? 'BEMS Mobile App'
      : 'Client';
    const os = ua.includes('iphone') || ua.includes('ipad') ? 'iOS'
      : ua.includes('android') ? 'Android'
      : ua.includes('mac os') || ua.includes('macintosh') ? 'macOS'
      : ua.includes('windows') ? 'Windows'
      : ua.includes('linux') ? 'Linux'
      : 'Unknown OS';
    deviceLabel = `${browser} on ${os}`;
  }

  return { ipAddress, userAgent, deviceLabel };
}

export function inferAuditModule(targetType: string, action?: string): string {
  const t = (targetType || '').toUpperCase();
  const a = (action || '').toUpperCase();
  if (t.includes('WALLET') || a.includes('WALLET') || a.includes('PIN') || a.includes('OTP') || a.includes('RECOVERY')) return 'WALLET';
  if (t.includes('PAYROLL')) return 'PAYROLL';
  if (t.includes('FINANCE_ACCOUNTING') || t.includes('ACCOUNTING') || t.includes('JOURNAL')) return 'ACCOUNTING';
  if (t.includes('REQUEST') || t.includes('DISBURSEMENT') || t.includes('ACCOUNTABILITY')) return 'REQUESTS';
  if (t.includes('VENDOR') || t.includes('INVOICE') || t.includes('PO')) return 'VENDORS';
  if (t.includes('ATTENDANCE')) return 'ATTENDANCE';
  if (t.includes('PROJECT')) return 'PROJECTS';
  if (t.includes('POLICY') || t.includes('SECURITY') || t.includes('ADMIN') || t.includes('LEADERSHIP') || t.includes('AI_ACCESS')) return 'CONTROL_CENTER';
  if (t.includes('EMPLOYEE') || t.includes('HR') || t.includes('STAFF')) return 'HR';
  return 'SYSTEM';
}
