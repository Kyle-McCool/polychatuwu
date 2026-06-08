import { TwitchSource } from "./sources/twitch";

// Joins several often-live channels anonymously and counts messages per channel
// to prove the Twitch IRC ingestion path works against real live chat.
const chans = ["kaicenat", "jynxzi", "caseoh_", "summit1g", "ironmouse", "stableronaldo", "zackrawrr"];
const counts: Record<string, number> = {};
const sample: string[] = [];

new TwitchSource(
  chans,
  (m) => {
    counts[m.channel] = (counts[m.channel] || 0) + 1;
    if (sample.length < 8) sample.push(`${m.channel} | ${m.user}: ${m.text}`);
  },
  (s) => {
    if (s.state === "live") console.log(`status: ${s.channel} ${s.state}`);
  },
);

setTimeout(() => {
  console.log("\n--- message counts after 10s ---");
  console.log(counts);
  console.log("\n--- sample ---");
  for (const s of sample) console.log(s);
  process.exit(0);
}, 10000);
