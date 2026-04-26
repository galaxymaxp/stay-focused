import { NextResponse } from 'next/server'
import { summarizeResourceForUser } from '@/lib/source-summaries'

export const runtime = 'nodejs'

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params
    const summary = await summarizeResourceForUser(id)
    return NextResponse.json({ ok: true, summary })
  } catch (error) {
    return NextResponse.json({
      ok: false,
      error: error instanceof Error ? error.message : 'Could not summarize this source.',
    }, { status: 400 })
  }
}
