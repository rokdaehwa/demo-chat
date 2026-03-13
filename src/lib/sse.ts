export async function* parseSSEStream(reader: ReadableStreamDefaultReader<Uint8Array>) {
  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    
    // SSE messages are separated by double newlines
    const parts = buffer.split('\n');
    buffer = parts.pop() || '';

    for (const part of parts) {
      const line = part.trim();
      if (!line) continue;

      if (line.startsWith('data: ')) {
        const dataStr = line.slice(6).trim();
        if (dataStr === '[DONE]') continue;
        
        try {
          const parsed = JSON.parse(dataStr);
          yield parsed;
        } catch (e) {
          console.warn('Incomplete or invalid JSON in SSE line:', dataStr);
          // If JSON is incomplete, add it back to buffer for next chunk
          buffer = line + '\n' + buffer;
        }
      }
    }
  }
}
