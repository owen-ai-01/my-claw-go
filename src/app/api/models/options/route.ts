import { getSelectableModelOptions } from '@/lib/myclawgo/model-options';
import { NextResponse } from 'next/server';

export async function GET() {
  try {
    const options = getSelectableModelOptions();
    return NextResponse.json({ ok: true, data: { options } });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: {
          message:
            error instanceof Error
              ? error.message
              : 'Failed to load model options',
        },
      },
      { status: 500 }
    );
  }
}
