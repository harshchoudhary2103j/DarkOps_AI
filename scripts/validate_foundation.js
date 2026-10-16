const fs = require('fs');
const path = require('path');

let errors = 0;

function check(desc, condition) {
  if (condition) {
    console.log(`[PASS] ${desc}`);
  } else {
    console.error(`[FAIL] ${desc}`);
    errors++;
  }
}

console.log('--- Checking Antigravity Rules ---');
const rulesDir = path.join(__dirname, '..', '.agents', 'rules');
const rules = fs.readdirSync(rulesDir);
for (const rule of rules) {
  if (!rule.endsWith('.md')) continue;
  const content = fs.readFileSync(path.join(rulesDir, rule), 'utf8');
  check(`Rule ${rule} has valid frontmatter`, content.startsWith('---') && content.indexOf('---', 3) > 0);
}

console.log('\n--- Checking Antigravity Skills ---');
const skillsDir = path.join(__dirname, '..', '.agents', 'skills');
const skills = fs.readdirSync(skillsDir);
for (const skill of skills) {
  const skillFile = path.join(skillsDir, skill, 'SKILL.md');
  const exists = fs.existsSync(skillFile);
  check(`Skill ${skill}/SKILL.md exists`, exists);
  if (exists) {
    const content = fs.readFileSync(skillFile, 'utf8');
    check(`Skill ${skill} has YAML frontmatter`, content.startsWith('---'));
    check(`Skill ${skill} defines name:`, /name:\s*[\w-]+/.test(content));
    check(`Skill ${skill} defines description:`, /description:/.test(content));
  }
}

console.log('\n--- Checking Prompts ---');
const promptsDir = path.join(__dirname, '..', 'prompts');
const prompts = fs.readdirSync(promptsDir);
const requiredPromptSections = [
  '## Objective',
  '## Scope',
  '## Dependencies',
  '## Business & Engineering Invariants',
  '## Acceptance Criteria',
  '## Required Tests',
  '## Documentation Updates',
  '## Completion Report Format'
];

for (const prompt of prompts) {
  if (!prompt.endsWith('.md')) continue;
  const content = fs.readFileSync(path.join(promptsDir, prompt), 'utf8');
  for (const sec of requiredPromptSections) {
    check(`Prompt ${prompt} has ${sec}`, content.includes(sec));
  }
}

console.log('\n--- Checking ADRs ---');
const adrDir = path.join(__dirname, '..', 'docs', 'adr');
const adrs = fs.readdirSync(adrDir);
for (const adr of adrs) {
  if (!adr.endsWith('.md')) continue;
  const content = fs.readFileSync(path.join(adrDir, adr), 'utf8');
  check(`ADR ${adr} has Status`, content.includes('- **Status**: Accepted'));
  check(`ADR ${adr} has Decision`, content.includes('## Decision'));
  check(`ADR ${adr} has Consequences`, content.includes('## Consequences'));
}

console.log('\n--- Checking Documentation & Foundation Files ---');
check('AGENTS.md exists', fs.existsSync(path.join(__dirname, '..', 'AGENTS.md')));
check('README.md exists', fs.existsSync(path.join(__dirname, '..', 'README.md')));
check('ARCHITECTURE.md exists', fs.existsSync(path.join(__dirname, '..', 'ARCHITECTURE.md')));
check('docs/IMPLEMENTATION_PLAN.md exists', fs.existsSync(path.join(__dirname, '..', 'docs', 'IMPLEMENTATION_PLAN.md')));
check('.gitignore exists', fs.existsSync(path.join(__dirname, '..', '.gitignore')));
check('.env.example exists', fs.existsSync(path.join(__dirname, '..', '.env.example')));
check('docker-compose.yml exists', fs.existsSync(path.join(__dirname, '..', 'docker-compose.yml')));
check('.github/workflows/ci.yml exists', fs.existsSync(path.join(__dirname, '..', '.github', 'workflows', 'ci.yml')));

console.log(`\n========================================`);
if (errors === 0) {
  console.log('ALL CHECKS PASSED PERFECTLY!');
  process.exit(0);
} else {
  console.error(`FAILED WITH ${errors} ERRORS`);
  process.exit(1);
}
