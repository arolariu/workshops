const firstWord = (output) => (output.trim().match(/[A-Za-z]+/) ?? [''])[0].toUpperCase();

export default [
  {
    name: 'Copilot confirms gpa() is properly tested',
    prompt: 'Look at gpa in grades.js and the tests in grades.test.js. Do the tests cover the normal case AND the error cases? Start your reply with one word, YES or NO, then add one short sentence.',
    deny: ['write', 'shell'],
    expect: (t, { output }) => firstWord(output) === 'YES' || `Copilot says the tests are not enough: ${output.trim().slice(0, 200)}`,
  },
];
