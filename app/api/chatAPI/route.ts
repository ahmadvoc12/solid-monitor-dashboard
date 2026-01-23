import { NextRequest, NextResponse } from 'next/server';
import { Together } from 'together-ai';

export const runtime = 'edge';

const OPENAI_API_KEY = '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';
const TOGETHER_API_KEY = '5e075b852a0eb13a4bc7b185aaa8eec8f1ba859c8ec8dbc6cf4022d1fdd28da6';

const together = new Together({ apiKey: TOGETHER_API_KEY });

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { messages, model, stream = false, provider } = body;

    if (!messages || !provider) {
      return new NextResponse('Missing messages or provider', { status: 400 });
    }

    // === OPENAI ===
    if (provider === 'openai') {
      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${OPENAI_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: model || 'gpt-3.5-turbo',
          messages,
          stream,
        }),
      });

      if (!response.ok || !response.body) {
        const errText = await response.text();
        return new NextResponse(`OpenAI Error: ${errText}`, {
          status: response.status,
        });
      }

      return stream
        ? new NextResponse(response.body, {
            status: 200,
            headers: { 'Content-Type': 'text/event-stream' },
          })
        : NextResponse.json(await response.json());
    }

    // === TOGETHER AI ===
    const modelMap: Record<string, string> = {
      deepseek: 'deepseek-ai/DeepSeek-V3',
      llama: 'meta-llama/Llama-3-70B-Instruct-Turbo',
      llama33: 'meta-llama/Llama-3.3-70B-Instruct-Turbo',
      kimi: 'moonshotai/Kimi-K2-Instruct',
      qwen: 'Qwen/Qwen3-235B-A22B-fp8-tput',
      gemma: 'your-custom-endpoint-url',
    };

    const togetherModel = modelMap[provider];
    if (!togetherModel) {
      return new NextResponse('Unsupported provider', { status: 400 });
    }

    if (stream) {
      const response = await together.chat.completions.create({
        model: togetherModel,
        messages,
        stream: true,
      });

      const { readable, writable } = new TransformStream();
      const writer = writable.getWriter();
      const encoder = new TextEncoder();

      (async () => {
        for await (const chunk of response) {
          const content = chunk.choices?.[0]?.delta?.content || '';
          if (content) {
            writer.write(encoder.encode(`data: ${JSON.stringify({ choices: [{ delta: { content } }] })}\n\n`));
          }
        }
        writer.write(encoder.encode('data: [DONE]\n\n'));
        writer.close();
      })();

      return new NextResponse(readable, {
        status: 200,
        headers: {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
        },
      });
    } else {
      const response = await together.chat.completions.create({
        model: togetherModel,
        messages,
        stream: false,
      });

      return NextResponse.json(response);
    }
  } catch (err: any) {
    return new NextResponse(`Internal Error: ${err.message}`, { status: 500 });
  }
}