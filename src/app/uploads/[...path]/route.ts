import { NextResponse } from 'next/server';
import { lookupStoredFileByPath } from '@/lib/stored-file-lookup';

export const dynamic = 'force-dynamic';

export async function GET(
  _request: Request,
  context: { params: Promise<{ path: string[] }> },
) {
  try {
    const { path } = await context.params;
    const rawPath = Array.isArray(path) ? path.join('/') : '';
    const file = await lookupStoredFileByPath(rawPath);
    if (!file) {
      return new NextResponse('Not Found', { status: 404 });
    }
    return new NextResponse(new Uint8Array(file.data), {
      status: 200,
      headers: {
        'Content-Type': file.mimeType,
        'Cache-Control': 'public, max-age=31536000, immutable',
      },
    });
  } catch (error) {
    console.error('[UPLOADS_GET]', error);
    return new NextResponse('Internal Server Error', { status: 500 });
  }
}
