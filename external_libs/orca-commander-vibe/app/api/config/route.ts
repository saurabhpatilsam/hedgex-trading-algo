import { NextResponse } from 'next/server';
import { getPriceChannelConfigs, getChannelMapping, getInstruments } from '@/lib/config';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET() {
  try {
    const configs = getPriceChannelConfigs();
    const mapping = getChannelMapping();
    const instruments = getInstruments();
    
    return NextResponse.json({
      configs,
      mapping,
      instruments
    });
  } catch (error) {
    console.error('Error fetching config:', error);
    return NextResponse.json({ error: 'Failed to fetch configuration' }, { status: 500 });
  }
}
