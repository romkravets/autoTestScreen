import Anthropic from '@anthropic-ai/sdk';

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// Distribution of question types
function buildTypeDistribution(count) {
  // ~50% single, ~30% multiple, ~20% text
  const single = Math.round(count * 0.5);
  const multiple = Math.round(count * 0.3);
  const text = count - single - multiple;
  return { single, multiple, text };
}

const TYPE_LABELS = {
  single: 'одна правильна відповідь (single)',
  multiple: 'кілька правильних відповідей (multiple)',
  text: 'вписати відповідь (text)',
};

export async function generateQuestions(content, count, topic = '') {
  const dist = buildTypeDistribution(count);

  const topicNote = topic ? `Тема тесту: "${topic}".` : '';

  const prompt = `Ти генеруєш тест для освітнього порталу vseosvita.ua.
${topicNote}
Текст джерела:
---
${content}
---

Створи рівно ${count} запитань трьох типів:
- ${dist.single} запитань типу "single" (одна правильна відповідь, 4 варіанти)
- ${dist.multiple} запитань типу "multiple" (2-3 правильні відповіді, 5-6 варіантів)
- ${dist.text} запитань типу "text" (одне поле для вписування відповіді, вказати 1-3 правильні варіанти)

Вимоги:
- Питання мають бути на основі тексту, різноманітні за складністю
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

  console.log(`Generating ${count} questions via Claude API...`);

  const message = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 8096,
    messages: [{ role: 'user', content: prompt }],
  });

  const rawText = message.content[0].text.trim();

  // Extract JSON even if wrapped in markdown code block
  const jsonMatch = rawText.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    throw new Error('Claude did not return valid JSON. Response:\n' + rawText.slice(0, 500));
  }

  const parsed = JSON.parse(jsonMatch[0]);

  if (!parsed.questions || !Array.isArray(parsed.questions)) {
    throw new Error('Invalid response structure from Claude.');
  }

  console.log(`Generated ${parsed.questions.length} questions.`);
  return parsed.questions;
}
