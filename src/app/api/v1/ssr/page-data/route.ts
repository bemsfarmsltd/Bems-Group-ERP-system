import { NextResponse } from 'next/server';
import { loadSsrPageData } from '@/lib/services/ssr-page-data';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const page = String(searchParams.get('page') || '').trim();
  const requestNumber = searchParams.get('requestNumber') || undefined;
  const result = await loadSsrPageData(request, page, requestNumber);
  return NextResponse.json(result.body, { status: result.status });
}
