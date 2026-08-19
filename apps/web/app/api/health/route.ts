import { NextResponse } from 'next/server';

/** Liveness probe for the web container — checks nothing downstream. */
export function GET() {
  return NextResponse.json({ status: 'ok' });
}
