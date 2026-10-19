// study-timer: count down N minutes (default 25), then say so.
const minutes = Number(process.argv[2] ?? 25);
console.log(`Timer started: ${minutes} minutes.`);
setTimeout(() => console.log('Time is up! Take a 5-minute break.'), minutes * 60 * 1000);
