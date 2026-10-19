- S1: upcoming() skips items with done: true before it checks the window.
- S2: today() builds YYYY-MM-DD from getFullYear(), getMonth() and getDate().
- S3: daysBetween() checks both dates and throws a RangeError for one that isn't a real YYYY-MM-DD.

npm test: 13 pass, 0 fail.
