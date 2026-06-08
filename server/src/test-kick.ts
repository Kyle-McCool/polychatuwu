import { resolveKickChannel, closeKickBrowser } from "./sources/kickResolver";
import { KickSource } from "./sources/kick";

// Resolves several Kick channels (proves the Cloudflare bypass), then connects to
// the first live one and counts real chat messages.
const passed = process.argv.slice(2);
const slugs = passed.length ? passed : ["xqc", "trainwreckstv", "adinross", "roshtein", "westcol", "kaicenat"];

let liveSlug: string | null = null;
for (const slug of slugs) {
  try {
    const info = await resolveKickChannel(slug);
    console.log(`${slug} -> chatroomId=${info.chatroomId} live=${info.live}`);
    if (info.live && !liveSlug) liveSlug = slug;
  } catch (e: any) {
    console.log(`${slug} -> ERR ${e?.message || e}`);
  }
}

if (liveSlug) {
  console.log(`\nconnecting to live channel: ${liveSlug}`);
  let n = 0;
  new KickSource(
    liveSlug,
    (m) => {
      n++;
      if (n <= 8) console.log(`${m.user}: ${m.text}`);
    },
    (s) => console.log("status:", s.state, s.detail || ""),
  );
  setTimeout(async () => {
    console.log(`\nkick messages in 12s: ${n}`);
    await closeKickBrowser();
    process.exit(0);
  }, 12000);
} else {
  console.log("\nno live channel found; id resolution above is the Cloudflare-bypass proof");
  await closeKickBrowser();
  process.exit(0);
}
