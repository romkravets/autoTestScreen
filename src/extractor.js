import fs from 'fs';
import path from 'path';
import axios from 'axios';
import * as cheerio from 'cheerio';

// Detect source type
function detectSourceType(source) {
  if (source.startsWith('http://') || source.startsWith('https://')) return 'url';
  const ext = path.extname(source).toLowerCase();
  if (ext === '.pdf') return 'pdf';
  if (ext === '.docx') return 'docx';
  throw new Error(`Unknown source type: ${source}`);
}

async function extractFromUrl(url) {
  console.log(`Fetching URL: ${url}`);
  const { data } = await axios.get(url, {
    headers: {
      'User-Agent':
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    },
    timeout: 15000,
  });

  const $ = cheerio.load(data);

  // Remove noise
  $('script, style, nav, footer, header, .menu, .sidebar, .advertisement, .ads').remove();

  // Try to get main content
  const selectors = [
    'article',
    'main',
    '.article-content',
    '.post-content',
    '.entry-content',
    '.content',
    '#content',
  ];

  let text = '';
  for (const sel of selectors) {
    if ($(sel).length) {
      text = $(sel).first().text();
      break;
    }
  }

  // Fallback to body
  if (!text.trim()) {
    text = $('body').text();
  }

  // Normalize whitespace
  return text.replace(/\s+/g, ' ').trim();
}

async function extractFromPdf(filePath) {
  console.log(`Reading PDF: ${filePath}`);
  // Dynamic import since pdf-parse uses CommonJS
  const { default: pdfParse } = await import('pdf-parse/lib/pdf-parse.js');
  const buffer = fs.readFileSync(filePath);
  const data = await pdfParse(buffer);
  return data.text.replace(/\s+/g, ' ').trim();
}

async function extractFromDocx(filePath) {
  console.log(`Reading DOCX: ${filePath}`);
  const { default: mammoth } = await import('mammoth');
  const buffer = fs.readFileSync(filePath);
  const result = await mammoth.extractRawText({ buffer });
  return result.value.replace(/\s+/g, ' ').trim();
}

export async function extractContent(source) {
  const type = detectSourceType(source);

  let text;
  if (type === 'url') text = await extractFromUrl(source);
  else if (type === 'pdf') text = await extractFromPdf(source);
  else if (type === 'docx') text = await extractFromDocx(source);

  if (!text || text.length < 100) {
    throw new Error('Extracted content is too short. Check the source.');
  }

  // Limit to ~15000 chars to stay within API limits
  return text.slice(0, 15000);
}
