import { NextResponse } from 'next/server';

export async function POST() {
  const apiKey = process.env.LLM_API_KEY;
  const baseUrl = process.env.NEXT_PUBLIC_API_BASE_URL;

  if (!apiKey) {
    return NextResponse.json({ error: 'API Key not configured' }, { status: 500 });
  }

  try {
    const response = await fetch(`${baseUrl}/v1/chat-sessions`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
      },
    });

    const data = await response.json();
    return NextResponse.json(data, { status: response.status });
  } catch (error) {
    console.error('Session creation error:', error);
    return NextResponse.json({ error: 'Failed to create session' }, { status: 500 });
  }
}
