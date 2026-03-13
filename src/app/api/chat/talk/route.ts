import { NextRequest } from 'next/server';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const apiKey = process.env.LLM_API_KEY;
  const baseUrl = process.env.NEXT_PUBLIC_API_BASE_URL;

  if (!apiKey) {
    return new Response('API Key not configured', { status: 500 });
  }

  try {
    const body = await req.json();
    const { sessionId, ...payload } = body;

    if (!sessionId) {
      return new Response('Session ID is required', { status: 400 });
    }

    const response = await fetch(`${baseUrl}/v1/chat-sessions/${sessionId}/talk`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const errorText = await response.text();
      return new Response(errorText, { status: response.status });
    }

    const { readable, writable } = new TransformStream();
    response.body?.pipeTo(writable);

    return new Response(readable, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache, no-transform',
        'Connection': 'keep-alive',
        'X-Accel-Buffering': 'no', // Disable buffering for Nginx/Vercel
      },
    });
  } catch (error) {
    console.error('Chat talk proxy error:', error);
    return new Response('Failed to proxy chat talk', { status: 500 });
  }
}
