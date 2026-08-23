// backend/quickstart-usecases.js
'use strict';

const USE_CASES = [
  {
    id: 'make-website',
    label: 'Make a Website',
    icon: '🌐',
    description: 'Answer a few questions, get a real live website.',
    questions: [
      { key: 'siteName', prompt: "What's your site or business called?", type: 'text', placeholder: 'Acme Coffee' },
      { key: 'tagline', prompt: 'One line that sums it up', type: 'text', placeholder: 'Best beans in town' },
      { key: 'about', prompt: 'Tell people what this is about', type: 'textarea', placeholder: 'We roast small-batch coffee daily...' },
      {
        key: 'style', prompt: 'Pick a look', type: 'select',
        options: [
          { value: 'minimal_dark', label: 'Minimal Dark' },
          { value: 'warm_light', label: 'Warm & Light' },
          { value: 'bold_neon', label: 'Bold Neon' },
        ],
      },
      { key: 'contactEmail', prompt: 'Contact email (optional)', type: 'email', placeholder: 'hi@example.com' },
    ],
  },
  {
    id: 'write-social-post',
    label: 'Write a Social Post',
    icon: '📣',
    description: 'Turn an idea into a ready-to-post caption.',
    questions: [
      { key: 'topic', prompt: "What's this post about?", type: 'text', placeholder: 'Launching our new coffee blend' },
      {
        key: 'platform', prompt: 'Which platform?', type: 'select',
        options: [
          { value: 'twitter', label: 'X / Twitter' },
          { value: 'instagram', label: 'Instagram' },
          { value: 'linkedin', label: 'LinkedIn' },
        ],
      },
      { key: 'tone', prompt: 'What tone?', type: 'text', placeholder: 'Fun and casual' },
    ],
  },
  {
    id: 'name-my-business',
    label: 'Name My Business',
    icon: '💡',
    description: 'Get name ideas for a new business or product.',
    questions: [
      { key: 'whatItDoes', prompt: 'What does the business do?', type: 'textarea', placeholder: 'We sell handmade candles online' },
      { key: 'vibe', prompt: 'What vibe do you want?', type: 'text', placeholder: 'Cozy, warm, premium' },
    ],
  },
];

module.exports = { USE_CASES };
