import Anthropic from '@anthropic-ai/sdk';
import OpenAI from 'openai';

// ── Provider configs ──────────────────────────────────────────────────────────
//
// Model string format:  "provider:model-name"
//
// Built-in providers:
//   claude                        → Anthropic, claude-sonnet-4-6 (default)
//   claude:claude-opus-4-6        → Anthropic, specific model
//   groq:llama-3.3-70b-versatile  → Groq (free tier)
//   openrouter:meta-llama/...     → OpenRouter (many free models)
//   ollama:llama3.2               → Local Ollama (localhost:11434)
//   lmstudio:model-name           → Local LM Studio (localhost:1234)
//   custom:model-name             → reads CUSTOM_API_BASE + CUSTOM_API_KEY from .env

const PROVIDERS = {
  claude: {
    label: 'Anthropic Claude',
    defaultModel: 'claude-sonnet-4-6',
  },
  groq: {
    label: 'Groq',
    baseURL: 'https://api.groq.com/openai/v1',
    envKey: 'GROQ_API_KEY',
    defaultModel: 'llama-3.3-70b-versatile',
    free: true,
  },
  openrouter: {
    label: 'OpenRouter',
    baseURL: 'https://openrouter.ai/api/v1',
    envKey: 'OPENROUTER_API_KEY',
    defaultModel: 'meta-llama/llama-3.3-70b-instruct:free',
    free: true,
  },
  ollama: {
    label: 'Ollama (local)',
    baseURL: process.env.OLLAMA_BASE_URL || 'http://localhost:11434/v1',
    apiKey: 'ollama',
    defaultModel: 'llama3.2',
    local: true,
  },
  lmstudio: {
    label: 'LM Studio (local)',
    baseURL: process.env.LMSTUDIO_BASE_URL || 'http://localhost:1234/v1',
    apiKey: 'lmstudio',
    defaultModel: 'local-model',
    local: true,
  },
  custom: {
    label: 'Custom',
    baseURL: process.env.CUSTOM_API_BASE,
    envKey: 'CUSTOM_API_KEY',
    defaultModel: 'custom-model',
  },
};

// ── Parse "provider:model" string ─────────────────────────────────────────────
function parseModelString(modelStr = 'claude') {
  const colonIdx = modelStr.indexOf(':');
  if (colonIdx === -1) {
    // Just a provider name → use its default model
    const provider = PROVIDERS[modelStr];
    if (!provider) throw new Error(`Unknown provider: "${modelStr}". Available: ${Object.keys(PROVIDERS).join(', ')}`);
    return { providerName: modelStr, provider, modelId: provider.defaultModel };
  }

  const providerName = modelStr.slice(0, colonIdx);
  const modelId = modelStr.slice(colonIdx + 1);
  const provider = PROVIDERS[providerName];
  if (!provider) throw new Error(`Unknown provider: "${providerName}". Available: ${Object.keys(PROVIDERS).join(', ')}`);
  return { providerName, provider, modelId };
}

// ── Build AI client ───────────────────────────────────────────────────────────
function buildClient(providerName, provider) {
  if (providerName === 'claude') {
    const key = process.env.ANTHROPIC_API_KEY;
    if (!key) throw new Error('ANTHROPIC_API_KEY not set in .env');
    return { type: 'anthropic', client: new Anthropic({ apiKey: key }) };
  }

  // All other providers use OpenAI-compatible API
  const apiKey =
    provider.apiKey ||
    (provider.envKey ? process.env[provider.envKey] : null) ||
    'no-key';

  if (provider.envKey && !process.env[provider.envKey] && !provider.local) {
    throw new Error(`${provider.envKey} not set in .env (required for ${provider.label})`);
  }

  if (!provider.baseURL) {
    throw new Error(`Base URL not configured for provider "${providerName}". Set CUSTOM_API_BASE in .env`);
  }

  return {
    type: 'openai',
    client: new OpenAI({ apiKey, baseURL: provider.baseURL }),
  };
}

// ── Call the model ────────────────────────────────────────────────────────────
async function callModel(clientInfo, modelId, promptText) {
  if (clientInfo.type === 'anthropic') {
    const msg = await clientInfo.client.messages.create({
      model: modelId,
      max_tokens: 8096,
      messages: [{ role: 'user', content: promptText }],
    });
    return msg.content[0].text.trim();
  }

  // OpenAI-compatible
  const completion = await clientInfo.client.chat.completions.create({
    model: modelId,
    max_tokens: 8096,
    messages: [{ role: 'user', content: promptText }],
    temperature: 0.7,
  });
  return completion.choices[0].message.content.trim();
}

// ── Parse JSON from model response ───────────────────────────────────────────
function parseResponse(rawText) {
  const jsonMatch = rawText.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    throw new Error('Model did not return valid JSON. Response:\n' + rawText.slice(0, 500));
  }
  const parsed = JSON.parse(jsonMatch[0]);
  if (!parsed.questions || !Array.isArray(parsed.questions)) {
    throw new Error('Invalid response structure from model.');
  }
  return parsed.questions;
}

// ── Prompt template ───────────────────────────────────────────────────────────
function buildTypeDistribution(count) {
  const single = Math.round(count * 0.5);
  const multiple = Math.round(count * 0.3);
  const text = count - single - multiple;
  return { single, multiple, text };
}

function buildPrompt(contentOrPrompt, count, isFromSource = false, topic = '') {
  const dist = buildTypeDistribution(count);

  const sourceSection = isFromSource
    ? `Тема тесту: "${topic}".\nТекст джерела:\n---\n${contentOrPrompt}\n---\n`
    : `Завдання від користувача: "${contentOrPrompt}"\n\nВикористовуй свої знання щоб скласти якісний тест.\n`;

  return `Ти генеруєш тест для освітнього порталу vseosvita.ua.
${sourceSection}
Створи рівно ${count} запитань трьох типів:
- ${dist.single} запитань типу "single" (одна правильна відповідь, 4 варіанти)
- ${dist.multiple} запитань типу "multiple" (2-3 правильні відповіді, 5-6 варіантів)
- ${dist.text} запитань типу "text" (одне поле для вписування відповіді, вказати 1-3 правильні варіанти)

Вимоги:
- Питання різноманітні за складністю (легкі, середні, складні)
- Відповіді — чіткі, однозначні
- Мова: українська
- Уникай питань зі словами "що НЕ є..." або подвійного заперечення
- Для типу "text" поле answers містить масив правильних відповідей (рядки)

Поверни ТІЛЬКИ JSON без жодного додаткового тексту, у такому форматі:
{
  "questions": [
    {
      "type": "single",
      "question": "Текст питання?",
      "answers": [
        { "text": "Варіант А", "correct": true },
        { "text": "Варіант Б", "correct": false },
        { "text": "Варіант В", "correct": false },
        { "text": "Варіант Г", "correct": false }
      ]
    },
    {
      "type": "multiple",
      "question": "Текст питання?",
      "answers": [
        { "text": "Варіант А", "correct": true },
        { "text": "Варіант Б", "correct": true },
        { "text": "Варіант В", "correct": false },
        { "text": "Варіант Г", "correct": false },
        { "text": "Варіант Д", "correct": false }
      ]
    },
    {
      "type": "text",
      "question": "Текст питання?",
      "answers": [
        { "text": "правильна відповідь", "correct": true }
      ]
    }
  ]
}`;
}

// ── Public API ────────────────────────────────────────────────────────────────

export async function generateFromPrompt(userPrompt, count, modelStr = 'claude') {
  const { providerName, provider, modelId } = parseModelString(modelStr);
  const clientInfo = buildClient(providerName, provider);
  console.log(`Generating ${count} questions via ${provider.label} (${modelId})...`);

  const prompt = buildPrompt(userPrompt, count, false);
  const rawText = await callModel(clientInfo, modelId, prompt);
  const questions = parseResponse(rawText);

  console.log(`Generated ${questions.length} questions.`);
  return questions;
}

export async function generateQuestions(content, count, topic = '', modelStr = 'claude') {
  const { providerName, provider, modelId } = parseModelString(modelStr);
  const clientInfo = buildClient(providerName, provider);
  console.log(`Generating ${count} questions via ${provider.label} (${modelId})...`);

  const prompt = buildPrompt(content, count, true, topic);
  const rawText = await callModel(clientInfo, modelId, prompt);
  const questions = parseResponse(rawText);

  console.log(`Generated ${questions.length} questions.`);
  return questions;
}

export { PROVIDERS };
