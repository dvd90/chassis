import { NextResponse } from 'next/server';

/** Nothing to guard without an auth provider — every request passes. */
export function middleware() {
  return NextResponse.next();
}
