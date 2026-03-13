# API Reference

LLM 스트리밍 API 서비스입니다. 채팅 세션 기반으로 LLM completion 요청을 보내고, SSE(Server-Sent Events) 스트림으로 응답을 수신합니다.

**Base URL**

```
https://llmops.04515.ai
```

## 목차

- [인증](#인증)
- [모델](#모델)
  - [GET /v1/models](#get-v1models)
- [채팅 세션](#채팅-세션)
  - [POST /v1/chat-sessions](#post-v1chat-sessions)
  - [GET /v1/chat-sessions/:id](#get-v1chat-sessionsid)
- [Completion](#completion)
  - [POST /v1/chat-sessions/:id/talk](#post-v1chat-sessionsidtalk)
  - [GET /v1/chat-sessions/:id/resume](#get-v1chat-sessionsidresume)
- [추천 응답 생성](#추천-응답-생성)
  - [자동 추천 (tool event)](#자동-추천-tool-event)
  - [POST /v1/chat-sessions/:id/suggestions](#post-v1chat-sessionsidsuggestions)
- [장기 기억 (Haema)](#장기-기억-haema)
  - [GET /v1/chat-sessions/:id/haema](#get-v1chat-sessionsidhaema)
  - [PATCH /v1/chat-sessions/:id/haema](#patch-v1chat-sessionsidhaema)
  - [DELETE /v1/chat-sessions/:id/haema](#delete-v1chat-sessionsidhaema)
- [SSE 이벤트 형식](#sse-이벤트-형식)
  - [이벤트 타입](#이벤트-타입)
  - [finishReason](#finishreason)
- [사용량](#사용량)
  - [GET /v1/usage](#get-v1usage)
- [에러 응답](#에러-응답)

---

## 인증

모든 API 요청에는 `Authorization` 헤더에 API Key를 포함해야 합니다.

```
Authorization: Bearer <API_KEY>
```

```bash
curl -H "Authorization: Bearer {API_KEY}..." \
  https://llmops.04515.ai/v1/models
```

> **NOTE:** API Key는 서버에 해싱되어 저장되므로 원본을 확인할 수 없습니다. 분실 시에는 재발급이 필요합니다.

API Key가 누락되었거나 유효하지 않으면 `401` 응답이 반환됩니다.

```json
{
  "code": "UNAUTHORIZED",
  "message": "Invalid or missing API key"
}
```

---

## 모델

### GET /v1/models

지원하는 모델 목록을 조회합니다. API Key 종류에 따라 반환되는 모델이 다릅니다.

- **운영용 API Key**: 실제 LLM 모델 반환
- **테스트용 API Key**: 테스트 전용 모델(`mock`)만 반환

#### Response

```typescript
interface ModelsResponse {
  models: Array<{
    /** 모델 ID */
    id: string;
    /** 모델 상태 정보 */
    health: {
      /** 모델의 현재 상태 */
      status: 'available' | 'degraded' | 'unavailable' | 'unknown';
      /** 총 요청 수 */
      totalRequests: number;
      /** 성공 횟수 */
      successCount: number;
      /** 실패 횟수 */
      failureCount: number;
      /** 에러율 (0~1) */
      errorRate: number;
      /** 평균 Time To First Token (ms). 성공 요청이 없으면 null */
      avgTTFT: number | null;
    };
  }>;
}
```

> **NOTE:** `health` 통계는 최근 1시간 동안의 요청 기록을 기준으로 집계됩니다. 해당 기간 내 요청이 없으면 `status`는 `unknown`으로 반환됩니다.

#### 예시

```bash
curl -H "Authorization: Bearer {API_KEY}" \
  https://llmops.04515.ai/v1/models
```

```json
{
  "models": [
    {
      "id": "claude-sonnet-4.5",
      "health": {
        "status": "available",
        "totalRequests": 1024,
        "successCount": 1015,
        "failureCount": 9,
        "errorRate": 0.00878906,
        "avgTTFT": 1534
      }
    },
    {
      "id": "gemini-2.5-flash",
      "health": {
        "status": "available",
        "totalRequests": 91,
        "successCount": 91,
        "failureCount": 0,
        "errorRate": 0,
        "avgTTFT": 989
      }
    }
  ]
}
```

> **NOTE:** 지원 모델 목록은 변동될 수 있으므로 항상 이 엔드포인트를 통해 확인하세요.

---

## 채팅 세션

### POST /v1/chat-sessions

새 채팅 세션을 생성합니다. completion 요청을 보내기 전에 먼저 세션을 생성해야 합니다.

#### Response

성공 시 `201 Created` 상태 코드와 함께 생성된 세션 정보를 반환합니다.

```typescript
interface CreateChatSessionResponse {
  /** 생성된 채팅 세션 ID */
  id: number;
}
```

#### 예시

```bash
curl -X POST -H "Authorization: Bearer {API_KEY}" \
  https://llmops.04515.ai/v1/chat-sessions
```

```json
{
  "id": 1
}
```

---

### GET /v1/chat-sessions/:id

채팅 세션의 현재 상태를 조회합니다.

#### Path Parameters

| 파라미터 | 타입   | 설명         |
| -------- | ------ | ------------ |
| `id`     | number | 채팅 세션 ID |

#### Response

```typescript
interface ChatSessionResponse {
  /** 현재 스트리밍 진행 중 여부 */
  isStreaming: boolean;
  /** 채팅 세션 생성 시각 */
  createdAt: string; // ISO 8601
}
```

#### 예시

```bash
curl -H "Authorization: Bearer {API_KEY}" \
  https://llmops.04515.ai/v1/chat-sessions/1
```

```json
{
  "isStreaming": true,
  "createdAt": "2026-02-03T10:00:00.000Z"
}
```

#### 에러

| HTTP | 코드        | 설명                               |
| ---- | ----------- | ---------------------------------- |
| 404  | `NOT_FOUND` | 채팅 세션이 존재하지 않거나 미소유 |

---

## Completion

### POST /v1/chat-sessions/:id/talk

LLM completion 요청을 보내고, SSE 스트림으로 응답을 수신합니다.

> **NOTE:** 기존 활성 스트림이 있는 세션에 `/talk`을 호출하면 이전 스트림은 자동으로 abort됩니다.

#### Path Parameters

| 파라미터 | 타입   | 설명         |
| -------- | ------ | ------------ |
| `id`     | number | 채팅 세션 ID |

#### Request Body

```typescript
interface CompletionRequest {
  /** GET /v1/models에서 반환된 모델 ID */
  model: string;
  /** 컨텍스트 정보 */
  context: {
    /** 대화 메시지 목록 */
    messages: Array<{
      role: 'user' | 'assistant';
      content: string;
      createdAt: string; // ISO 8601
    }>;
    /** 페르소나 프롬프트 */
    persona: string;
    /** 캐릭터 프롬프트 */
    character: string;
    /** 로어북 */
    lorebook?: Array<{
      name: string;
      content: string;
    }>;
    /** 에셋 (이미지 등) */
    assets?: Array<{
      /** 최대 5자 랜덤 식별자 */
      slug: string;
      altText: string;
    }>;
    /** 매 응답 시 유저 메시지로 포함되는 노트 */
    usernote?: string;
    /** 커스텀 시스템 프롬프트 (기본 프롬프트 대체) */
    systemPrompt?: string;
  };
  /**
   * 모델 호출 옵션
   */
  options?: Partial<{
    /** 최대 출력 토큰 수 */
    maxOutputTokens: number;
    temperature: number;
    topP: number;
    topK: number;
    presencePenalty: number;
    frequencyPenalty: number;
    /** 생성 중단 시퀀스 목록 */
    stopSequences: string[];
    /** 재현 가능한 출력을 위한 시드 값 */
    seed: number;
    /** 최대 재시도 횟수 */
    maxRetries: number;
    /** 타임아웃 (ms 또는 단계별 설정) */
    timeout:
      | number
      | {
          totalMs?: number;
          stepMs?: number;
          chunkMs?: number;
        };
    /** 추가 HTTP 헤더 */
    headers: Record<string, string | undefined>;
  }>;
  /** SSE 스트림에서 사용할 메시지 correlation 용 ID */
  responseMessageId?: string;
  /** SSE 스트림에 포함될 메타데이터 */
  messageMetadata?: unknown;
}
```

#### Response

SSE 스트림 (`Content-Type: text/event-stream`)

이벤트 형식에 대한 자세한 내용은 [SSE 이벤트 형식](#sse-이벤트-형식) 섹션을 참고하세요. 응답 스트림에는 텍스트 생성 후 자동으로 [추천 응답 생성](#추천-응답-생성)이 tool event로 함께 전송됩니다.

#### 예시

```bash
curl -X POST -H "Authorization: Bearer {API_KEY}" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "claude-sonnet-4.5",
    "context": {
      "messages": [
        {
          "role": "assistant",
          "content": "안녕하세요",
          "createdAt": "2026-02-07T20:35:21.822Z"
        },
        {
          "role": "user",
          "content": "반갑습니다",
          "createdAt": "2026-02-07T20:35:25.822Z"
        }
      ],
      "persona": "<persona><name>테스트</name><description>테스트용</description></persona>",
      "character": "<character><name>캐릭터</name><description>테스트용 캐릭터</description></character>"
    }
  }' \
  https://llmops.04515.ai/v1/chat-sessions/1/talk
```

#### 에러

| HTTP | 코드                    | 설명                                     |
| ---- | ----------------------- | ---------------------------------------- |
| 400  | `INVALID_REQUEST`       | 지원하지 않는 모델 또는 잘못된 요청 형식 |
| 404  | `NOT_FOUND`             | 채팅 세션이 존재하지 않거나 미소유       |
| 500  | `INTERNAL_SERVER_ERROR` | 내부 서버 오류                           |

---

### GET /v1/chat-sessions/:id/resume

네트워크 끊김이나 페이지 새로고침 등으로 중단된 SSE 스트림을 재개합니다.

#### Path Parameters

| 파라미터 | 타입   | 설명         |
| -------- | ------ | ------------ |
| `id`     | number | 채팅 세션 ID |

#### Response

| 상황                           | HTTP | 응답                                           |
| ------------------------------ | ---- | ---------------------------------------------- |
| 진행 중인 스트림이 있는 경우   | 200  | SSE 스트림 (`Content-Type: text/event-stream`) |
| 재개 가능한 스트림이 없는 경우 | 204  | `No Content`                                   |
| 세션이 존재하지 않는 경우      | 404  | `Not Found`                                    |

이벤트 형식은 `/talk` 응답과 동일합니다. 자세한 내용은 [SSE 이벤트 형식](#sse-이벤트-형식)을 참고하세요.

#### 사용 흐름

스트림 재개가 필요한 상황에서는 다음과 같은 흐름으로 처리합니다.

1. `GET /v1/chat-sessions/:id/resume`을 호출합니다.
2. 응답 코드에 따라 분기합니다:
   - **200**: SSE 스트림을 수신합니다.
   - **204**: 재개 가능한 스트림이 없습니다. 필요하다면 `/talk`으로 새 요청을 보내세요.

```typescript
// 연결 끊김 복구 시 resume 직접 호출
const res = await fetch(`/v1/chat-sessions/${id}/resume`, {
  headers: { Authorization: `Bearer ${apiKey}` },
});

if (res.status === 200) {
  // SSE 스트림 수신 처리
  const reader = res.body.getReader();
  // ...
}
// 204인 경우: 재개할 스트림 없음 - 새 completion 요청 가능
```

#### 예시

```bash
curl -H "Authorization: Bearer {API_KEY}" \
  https://llmops.04515.ai/v1/chat-sessions/1/resume
```

---

## 추천 응답 생성

AI 응답 생성 시 자동으로 유저 추천 응답 3개가 함께 생성됩니다. 자동 추천과 수동 재생성, 두 가지 방식을 제공합니다.

### 자동 추천 (tool event)

`/talk` 응답의 SSE 스트림에서 텍스트 스트리밍 이후 `suggestNextUserInput` tool call 관련 이벤트가 자동으로 전송됩니다.

```
data: {"type":"tool-input-start","toolCallId":"fwPXblFTQjnUFg0r","toolName":"suggestNextUserInput"}

data: {"type":"tool-input-delta","toolCallId":"fwPXblFTQjnUFg0r","inputTextDelta":"{\"suggestions\":[\""}

...

data: {"type":"tool-input-available","toolCallId":"fwPXblFTQjnUFg0r","toolName":"suggestNextUserInput","input":{"suggestions":["\"안녕하세요.\" *손을 흔든다*","\"어떻게 지내셨어요?\" *미소 짓는다*","\"...\" *고개를 끄덕인다*"]}}

data: {"type":"tool-output-available","toolCallId":"fwPXblFTQjnUFg0r","output":{"suggestions":["\"안녕하세요.\" *손을 흔든다*","\"어떻게 지내셨어요?\" *미소 짓는다*","\"...\" *고개를 끄덕인다*"]}}
```

> **NOTE:** 대부분의 경우 최종 결과인 `tool-output-available` 이벤트만 처리하면 충분합니다.

`fetch` + `ReadableStream`으로 SSE 스트림을 파싱하여 추천 응답을 수신하는 예제입니다.

```typescript
/** SSE 스트림을 파싱하여 JSON 이벤트를 yield하는 제너레이터 */
async function* parseSSEStream(
  response: Response,
): AsyncGenerator<Record<string, unknown>> {
  const reader = response.body!.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop()!;

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed.startsWith('data: ') || trimmed === 'data: [DONE]') continue;
      yield JSON.parse(trimmed.slice(6));
    }
  }
}

/** /talk SSE 스트림에서 추천 응답(suggestions)을 추출 */
async function extractSuggestions(
  sessionId: number,
  body: Record<string, unknown>,
  apiKey: string,
): Promise<string[] | null> {
  const response = await fetch(`/v1/chat-sessions/${sessionId}/talk`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(body),
  });

  for await (const event of parseSSEStream(response)) {
    // tool-output-available 이벤트에서 suggestions 추출
    if (event.type === 'tool-output-available') {
      const output = event.output as { suggestions?: string[] };
      if (output.suggestions) return output.suggestions;
    }
  }

  return null;
}
```

---

### POST /v1/chat-sessions/:id/suggestions

새로운 유저 추천 응답 생성을 수동으로 요청합니다. 최근 대화 히스토리를 기반으로 사용자가 선택할 수 있는 응답 옵션을 제안합니다.

#### Path Parameters

| 파라미터 | 타입   | 설명         |
| -------- | ------ | ------------ |
| `id`     | number | 채팅 세션 ID |

#### Request Body

```typescript
interface SuggestionsRequest {
  messages: Array<{
    role: 'user' | 'assistant';
    content: string;
  }>;
}
```

> **NOTE:** 서버에서 최근 4턴(8개 메시지)으로 자동 제한됩니다.

```json
{
  "messages": [
    {
      "role": "user",
      "content": "안녕하세요"
    },
    {
      "role": "assistant",
      "content": "반갑습니다! 어떻게 도와드릴까요?"
    }
  ]
}
```

#### Response

```typescript
interface SuggestionsResponse {
  suggestions: string[];
}
```

```json
{
  "suggestions": [
    "\"도와주세요.\" *손을 든다*",
    "\"괜찮아요.\" *미소 짓는다*",
    "\"조금 생각해볼게요.\" *고개를 갸우뚱거린다*"
  ]
}
```

#### 사용 예시

```typescript
interface Message {
  role: 'user' | 'assistant';
  content: string;
}

/** 추천 응답을 재생성하여 반환 */
async function regenerateSuggestions(
  sessionId: number,
  recentMessages: Message[],
  apiKey: string,
): Promise<string[]> {
  const response = await fetch(`/v1/chat-sessions/${sessionId}/suggestions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({ messages: recentMessages }),
  });

  const { suggestions } = await response.json();
  return suggestions;
}

const suggestions = await regenerateSuggestions(sessionId, messages, apiKey);
console.log(suggestions);
// => ["\"도와주세요.\" *손을 든다*", "\"괜찮아요.\" *미소 짓는다*", ...]
```

#### 에러

| HTTP | 코드                    | 설명                   |
| ---- | ----------------------- | ---------------------- |
| 400  | `INVALID_REQUEST`       | 메시지 배열이 비어있음 |
| 404  | `NOT_FOUND`             | 세션을 찾을 수 없음    |
| 500  | `INTERNAL_SERVER_ERROR` | 추천 생성 실패         |

---

### 추천 응답 포맷

자동 방식(`/talk` tool event)과 수동 방식(`/suggestions`) 모두 동일한 형식의 객체를 반환합니다.

모든 추천 응답은 롤플레잉 마크다운 포맷을 따릅니다:

```
"대사" *행동*
```

**예시:**

- `"안녕하세요." *미소를 짓는다*`
- `"..." *고개를 끄덕이며 조용히 듣는다*`
- `"괜찮으신가요?" *걱정스러운 표정으로 바라본다*`

---

### 자동 방식과 수동 방식 비교

| 항목      | 자동 방식 (`/talk`)    | 수동 방식 (`/suggestions`) |
| --------- | ---------------------- | -------------------------- |
| 트리거    | AI 응답 완료 시 자동   | 재생성 요청 시             |
| 응답 형태 | SSE tool-output 이벤트 | JSON 응답                  |
| 컨텍스트  | 풀 컨텍스트            | 최근 4턴                   |
| 모델      | 메인 모델              | 경량 모델                  |
| 비용      | 추가 비용 없음         | 별도 API 콜                |

---

## 장기 기억 (Haema)

대화가 길어지면 컨텍스트 윈도우 제한으로 과거 메시지가 프롬프트에서 밀려납니다. Haema는 이러한 컨텍스트 밖의 메시지를 자동으로 요약하여 장기 기억으로 유지하는 기능입니다. 이를 통해 긴 대화에서도 이전 맥락이 자연스럽게 이어집니다.

> **NOTE:** Haema의 요약 생성은 서버에서 자동으로 동작합니다. 생성된 요약은 아래 API를 통해 조회·수정·삭제할 수 있습니다.

### 동작 방식

1. `/talk` 응답이 완료되면, 서버가 자동으로 요약 생성 조건을 확인합니다.
2. 마지막 요약 이후 일정 턴 수의 새 메시지가 누적되면 요약이 생성됩니다.
3. 생성된 요약은 이후 `/talk` 요청 시 프롬프트에 자동으로 포함되어, 히스토리 윈도우 밖의 과거 맥락을 LLM에 전달합니다.

### 메모리 관리

- 요약은 대화가 진행됨에 따라 누적됩니다.
- 요약 용량이 한계에 근접하면, 오래된 요약은 자동으로 압축되어 최신 맥락에 더 높은 정보 밀도를 유지합니다.

### 클라이언트 영향

| 항목          | 설명                                                                              |
| ------------- | --------------------------------------------------------------------------------- |
| 요약 생성     | `/talk` 완료 시 자동 실행                                                         |
| 첫 요약 시점  | 세션 시작 후 일정 턴 이상 대화가 누적된 뒤 첫 요약이 생성됩니다                   |
| 사용량        | 요약 생성에 사용된 토큰은 [사용량](#사용량) 로그에 별도로 기록됩니다              |
| 컨텍스트 관리 | 생성 후 다음 요청에서 요약된 내용(과거 이벤트·캐릭터 관계 등)이 프롬프트에 반영됨 |
| 요약 관리     | 생성된 요약은 GET / PATCH / DELETE 엔드포인트로 조회·수정·삭제 가능               |

> **NOTE:** 테스트용 API Key 사용 시에는 요약이 생성되지 않습니다.

---

### GET /v1/chat-sessions/:id/haema

채팅 세션의 현재 요약을 조회합니다.

#### Path Parameters

| 파라미터 | 타입   | 설명         |
| -------- | ------ | ------------ |
| `id`     | number | 채팅 세션 ID |

#### Response

```typescript
interface HaemaResponse {
  id: number;
  /** 채팅 세션 ID */
  sessionId: number;
  /** 요약된 내용 */
  memory: string;
  /** 생성 시각 */
  createdAt: string; // ISO 8601
  /** 최종 수정 시각 */
  updatedAt: string; // ISO 8601
}
```

#### 예시

```bash
curl -H "Authorization: Bearer {API_KEY}" \
  https://llmops.04515.ai/v1/chat-sessions/1/haema
```

```json
{
  "id": 1,
  "sessionId": 1,
  "memory": "... 비행기 추락 후 폭풍우가 몰아치는 해변에서 부상당한 기장을 구조하고 임시 피난처를 찾아 생존을 모색하는 상황 ...",
  "createdAt": "2026-02-03T12:00:00.000Z",
  "updatedAt": "2026-02-03T14:30:00.000Z"
}
```

#### 에러

| HTTP | 코드        | 설명                                         |
| ---- | ----------- | -------------------------------------------- |
| 404  | `NOT_FOUND` | 채팅 세션이 존재하지 않거나 요약이 없는 경우 |

---

### PATCH /v1/chat-sessions/:id/haema

채팅 세션의 장기 기억 요약을 수정합니다.

#### Path Parameters

| 파라미터 | 타입   | 설명         |
| -------- | ------ | ------------ |
| `id`     | number | 채팅 세션 ID |

#### Request Body

```typescript
interface UpdateHaemaRequest {
  /** 수정된 내용 */
  memory: string;
}
```

```json
{
  "memory": " ... 딸기 케이크를 함께 먹은 뒤 친밀도가 상승했다. ..."
}
```

#### Response

수정된 해마 요약을 반환합니다. 응답 형식은 [GET /v1/chat-sessions/:id/haema](#get-v1chat-sessionsidhaema)와 동일합니다.

#### 예시

```bash
curl -X PATCH -H "Authorization: Bearer {API_KEY}" \
  -H "Content-Type: application/json" \
  -d '{"memory": " ... 딸기 케이크를 함께 먹은 뒤 친밀도가 상승했다. ..."}' \
  https://llmops.04515.ai/v1/chat-sessions/1/haema
```

#### 에러

| HTTP | 코드        | 설명                                         |
| ---- | ----------- | -------------------------------------------- |
| 404  | `NOT_FOUND` | 채팅 세션이 존재하지 않거나 요약이 없는 경우 |

---

### DELETE /v1/chat-sessions/:id/haema

채팅 세션의 요약을 삭제합니다. 삭제 후에는 새로운 대화가 누적되면 요약이 다시 자동 생성됩니다.

#### Path Parameters

| 파라미터 | 타입   | 설명         |
| -------- | ------ | ------------ |
| `id`     | number | 채팅 세션 ID |

#### Response

성공 시 `204 No Content`를 반환합니다.

#### 예시

```bash
curl -X DELETE -H "Authorization: Bearer {API_KEY}" \
  https://llmops.04515.ai/v1/chat-sessions/1/haema
```

#### 에러

| HTTP | 코드        | 설명                                         |
| ---- | ----------- | -------------------------------------------- |
| 404  | `NOT_FOUND` | 채팅 세션이 존재하지 않거나 요약이 없는 경우 |

---

## SSE 이벤트 형식

`/talk` 및 `/resume` 엔드포인트의 SSE 스트림은 다음 이벤트들로 구성됩니다.

### 이벤트 타입

| 이벤트                  | 설명                                                   |
| ----------------------- | ------------------------------------------------------ |
| `start`                 | 메시지 시작 (`messageId`, `messageMetadata` 포함 가능) |
| `start-step`            | 스텝 시작                                              |
| `text-start`            | 텍스트 파트 시작                                       |
| `text-delta`            | 텍스트 청크                                            |
| `text-end`              | 텍스트 파트 종료                                       |
| `reasoning-start`       | 추론 파트 시작 (모델의 thinking 과정)                  |
| `reasoning-delta`       | 추론 텍스트 청크                                       |
| `reasoning-end`         | 추론 파트 종료                                         |
| `tool-input-start`      | 도구 호출 시작 (`toolName` 포함)                       |
| `tool-input-delta`      | 도구 호출 인자 청크                                    |
| `tool-input-available`  | 도구 호출 인자 완성 (`input` 포함)                     |
| `tool-output-available` | 도구 호출 실행 결과 (`output` 포함)                    |
| `finish-step`           | 스텝 종료                                              |
| `finish`                | 메시지 완료 (`finishReason` 포함)                      |
| `error`                 | 에러 발생 (`errorText` 포함)                           |

> **NOTE:** 도구 호출 이벤트(추천 응답 생성 등)는 최종 결과인 `tool-output-available`만 처리하면 충분합니다.

`/talk` 요청에 `responseMessageId`를 지정하면 `start` 이벤트의 `messageId`가 해당 값으로 설정됩니다. `messageMetadata`를 지정하면 `start` 이벤트에 `messageMetadata` 필드로 포함됩니다.

### finishReason

`finish` 이벤트에 포함되는 `finishReason` 값입니다.

| 값               | 설명                                     |
| ---------------- | ---------------------------------------- |
| `stop`           | 모델이 자연스럽게 응답을 완료한 경우     |
| `length`         | 최대 토큰 수에 도달하여 응답이 잘린 경우 |
| `content-filter` | 콘텐츠 필터에 의해 응답이 중단된 경우    |
| `tool-calls`     | 모델이 도구 호출을 요청한 경우           |
| `error`          | 에러로 인해 응답이 중단된 경우           |
| `other`          | 기타 사유로 응답이 종료된 경우           |

> **NOTE:** `other`는 종료 사유가 표준 값에 매핑되지 않은 경우이며, 사용량 기록(usage logs)에 원본 사유가 기록됩니다.

### 스트림 예시

```
data: {"type":"start","messageId":"msg-abc123","messageMetadata":{"key":"value"}}


data: {"type":"start-step"}


data: {"type":"reasoning-start","id":"ycgstf559vODHaSmNoQoN"}


data: {"type":"reasoning-delta","id":"ycgstf559vODHaSmNoQoN","delta":"Lorem "}


data: {"type":"reasoning-delta","id":"ycgstf559vODHaSmNoQoN","delta":"ipsum "}


data: {"type":"reasoning-delta","id":"ycgstf559vODHaSmNoQoN","delta":"dolor "}


data: {"type":"reasoning-end","id":"ycgstf559vODHaSmNoQoN"}


data: {"type":"text-start","id":"uzLysO2vgTpwoI4Mik3Nh"}


data: {"type":"text-delta","id":"uzLysO2vgTpwoI4Mik3Nh","delta":"Sed "}


data: {"type":"text-delta","id":"uzLysO2vgTpwoI4Mik3Nh","delta":"ut "}


data: {"type":"text-delta","id":"uzLysO2vgTpwoI4Mik3Nh","delta":"nulla "}


data: {"type":"text-end","id":"uzLysO2vgTpwoI4Mik3Nh"}


data: {"type":"tool-input-start","toolCallId":"fwPXblFTQjnUFg0r","toolName":"suggestNextUserInput",...}


data: {"type":"tool-input-delta","toolCallId":"fwPXblFTQjnUFg0r","inputTextDelta":"..."}


data: {"type":"tool-input-available","toolCallId":"fwPXblFTQjnUFg0r","toolName":"suggestNextUserInput","input":...}


data: {"type":"tool-output-available","toolCallId":"fwPXblFTQjnUFg0r","output":{"suggestions":["\"그래서 여기에서는 뭘 하면 돼?\" *두리번거리며 묻는다*","\"당신은 누구야?\" *경계하는 눈빛으로 쳐다본다*","\"음, 기대되네. 어떤 일이 기다리고 있을까?\" *작게 미소 짓는다*"]}}


data: {"type":"finish-step"}


data: {"type":"finish","finishReason":"stop"}


data: [DONE]
```

> **참고:** `reasoning-*` 이벤트는 모델이 추론(thinking) 기능을 지원하는 경우에만 전송됩니다.

---

## 사용량

### GET /v1/usage

API Key의 토큰 사용량을 조회합니다. 해당 API Key로 발생한 사용량만 반환됩니다.

> **NOTE:** 테스트용 API Key로 발생한 요청은 사용량 로그에 기록되지 않습니다.

#### Query Parameters

| 파라미터 | 타입   | 필수 | 기본값 | 설명                          |
| -------- | ------ | ---- | ------ | ----------------------------- |
| `start`  | string | N    | -      | 시작 시각 (ISO 8601 datetime) |
| `end`    | string | N    | -      | 종료 시각 (ISO 8601 datetime) |
| `limit`  | number | N    | 20     | 페이지당 항목 수 (1-100)      |
| `offset` | number | N    | 0      | 시작 오프셋                   |

#### Response

```typescript
interface UsageResponse {
  items: Array<{
    id: number;
    chatSessionId: number;
    /** 사용 목적 */
    purpose: string;
    /** 사용된 모델 ID */
    modelId: string;
    /** 실제 사용된 provider */
    provider: string;
    /** 응답 종료 사유 */
    finishReason: string;
    /** 입력 토큰 수 */
    inputTokens: number;
    /** 출력 토큰 수 (추론 토큰 포함) */
    outputTokens: number;
    /** 캐시 미적용 토큰 */
    noCacheTokens: number;
    /** 캐시 읽기 토큰 */
    cacheReadTokens: number;
    /** 캐시 쓰기 토큰 */
    cacheWriteTokens: number;
    createdAt: string; // ISO 8601
  }>;
  pagination: {
    limit: number;
    offset: number;
    total: number;
  };
}
```

#### 예시

```bash
curl -H "Authorization: Bearer {API_KEY}" \
  "https://llmops.04515.ai/v1/usage?start=2026-02-01T00:00:00Z&end=2026-02-28T23:59:59Z&limit=10"
```

```json
{
  "items": [
    {
      "id": 1,
      "chatSessionId": 42,
      "purpose": "chat",
      "modelId": "claude-sonnet-4.5",
      "provider": "anthropic",
      "finishReason": "stop",
      "inputTokens": 1500,
      "outputTokens": 320,
      "noCacheTokens": 500,
      "cacheReadTokens": 1000,
      "cacheWriteTokens": 0,
      "createdAt": "2026-02-03T10:30:00.000Z"
    }
  ],
  "pagination": {
    "limit": 10,
    "offset": 0,
    "total": 1
  }
}
```

#### 에러

| HTTP | 코드              | 설명                                     |
| ---- | ----------------- | ---------------------------------------- |
| 400  | `INVALID_REQUEST` | 시작 시각이 종료 시각보다 늦은 경우 등   |
| 422  |                   | 날짜 형식이 잘못되어 파싱할 수 없는 경우 |

---

## 에러 응답

모든 에러는 다음과 같은 공통 형식으로 반환됩니다.

### 공통 에러 형식

```typescript
interface ErrorResponse {
  code: string;
  message: string;
  /** 에러에 따라 추가 정보가 포함될 수 있습니다 */
  details?: Record<string, unknown>;
}
```

### 공통 에러 코드

| 코드                    | HTTP | 설명                           |
| ----------------------- | ---- | ------------------------------ |
| `UNAUTHORIZED`          | 401  | API Key 인증 실패              |
| `INVALID_REQUEST`       | 400  | 잘못된 요청 형식 또는 파라미터 |
| `NOT_FOUND`             | 404  | 리소스를 찾을 수 없음          |
| `INTERNAL_SERVER_ERROR` | 500  | 내부 서버 오류                 |
