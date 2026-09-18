# Tree Leaves AR

Walk up to a tree, raise your camera, open your hand. Words you wrote drift
down and settle among the branches, as if dressing the tree in a poem. Sweep
a finger across them and the leaves turn into birds, and scatter.

你可以走到一棵树前,举起镜头,张开手掌。一段由你写下的文字慢慢落在树枝间,
像给树穿上了一首诗。手指轻轻划过,树叶变成小鸟,随之散开。

![status](https://img.shields.io/badge/license-CC%20BY--NC%204.0-lightgrey)

---

## How it works

1. **Camera** — `react-webcam` shows the live rear-facing feed.
2. **Branch detection** — one JPEG frame is posted to `/api/analyze-tree`,
   which asks Gemini to return the branches as normalized polylines
   (`x`/`y` in `0..1`). A fallback chain of models keeps it working when one
   is unavailable.
3. **Hand tracking** — MediaPipe Hands follows your index fingertip in the
   browser; nothing leaves the device for this step.
4. **Rendering** — a p5.js sketch grows text leaves along the detected
   branches, with birds that scatter when your hand sweeps past.

## Privacy

The camera stream is processed **in your browser**. Hand tracking runs
locally via MediaPipe and no video is uploaded.

The one exception: when you tap scan, a **single still frame** is sent to
your own `/api/analyze-tree` endpoint, which forwards it to the Google
Gemini API for branch detection. That frame is not stored by this app. If
you self-host, that request goes to *your* deployment and *your* API key —
see Google's terms for how they handle API input.

There is no analytics, no tracking, no cookies, and no local storage.

摄像头画面全部在浏览器本地处理,手势识别用 MediaPipe 在本机运行,视频不会
上传。唯一的例外:点击扫描时,**一张静止帧**会发送到你自己的
`/api/analyze-tree`,再转发给 Google Gemini 做枝干识别。本应用不保存这张图。
无统计、无追踪、无 cookie、无本地存储。

## Running it locally

Requires Node 18+ and a [Gemini API key](https://aistudio.google.com/apikey).

```bash
git clone https://github.com/iqnuxul/TouchTreeAR.git
cd TouchTreeAR
npm install
echo 'GEMINI_API_KEY=your_key_here' > .env
npm run dev
```

Then open `http://localhost:3000`. Note that browsers only grant camera
access over HTTPS or on `localhost`, so test on your phone by deploying
rather than by hitting your laptop's LAN address.

## Deploying to Vercel

The repo is set up for Vercel out of the box: `vite build` produces the
static frontend and `api/` becomes serverless functions.

```bash
npm i -g vercel
vercel link
vercel env add GEMINI_API_KEY production
vercel deploy --prod
```

`server.ts` exists only for local development — it wraps the same
`api/_analyze.ts` implementation in an Express server with Vite middleware,
so local and deployed behaviour match.

## Where to change things

| What you want to change | File |
| --- | --- |
| UI, controls, colour pickers | `src/App.tsx` |
| Leaf growth, physics, birds | `src/lib/leaf_system.ts` |
| Gesture recognition | `src/lib/hand_tracker.ts` |
| The prompt & model list sent to Gemini | `api/_analyze.ts` |
| Branch thinning / smoothing | `src/lib/skeletonizer.ts` |
| Bird sprites | `public/birds/` |

## License

[Creative Commons Attribution-NonCommercial 4.0 International](LICENSE)
(CC BY-NC 4.0).

You are free to copy, modify and share this project, including feeding it
to an AI assistant and building your own version on top of it, as long as
you **give credit** and **do not use it commercially**.

你可以自由克隆、修改、分发本项目,包括把它交给 AI 助手让它在此基础上改造 ——
条件是**署名**且**不得用于商业用途**。

Because of the non-commercial restriction this is *source-available* rather
than "open source" in the OSI sense. For commercial use, please get in touch.
