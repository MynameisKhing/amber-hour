export const EMOJIS = ["👍", "❤️", "😂", "😮", "🔥"];

export const COMMANDS = [
  { name: "play",  hint: "play", desc: "Queue a song" },
  { name: "skip",  hint: "skip",                     desc: "Vote to skip" },
  { name: "queue", hint: "queue",                    desc: "Show queue" },
  { name: "loop",  hint: "loop on | off",            desc: "Toggle loop" },
  { name: "w",     hint: "w @user",                  desc: "Whisper" },
];

export const isImage = (url: string) => /\.(jpe?g|png|gif|webp|svg|bmp|avif)$/i.test(url);
