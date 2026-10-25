import test from "node:test";
import assert from "node:assert/strict";
import { fileError, publishSchema } from "../src/features/publish/validation.ts";
import { createTaskScope } from "../src/features/publish/task.ts";
import { computeFileMd5 } from "../src/lib/hash.ts";
import {
  CHUNK_SIZE,
  initializeUpload,
  normalizeChunks,
  confirmedBytes,
} from "../src/features/publish/upload-video.ts";

test("initialization restores unique valid chunks and counts the short last chunk exactly", async () => {
  const file = new File([new Uint8Array(CHUNK_SIZE + 1)], "x.mp4");
  let input;
  const progress = [];
  const api = {
    initChunkUpload: async (value) => {
      input = value;
      return { upload_id: "resume", uploaded_chunks: [1, 1, -1, 2, 0.5, "0"] };
    },
  };
  const result = await initializeUpload(file, {
    api,
    signal: new AbortController().signal,
    fileHash: "hash",
    onProgress: (v) => progress.push(v),
  });
  assert.equal(result.totalChunks, 2);
  assert.deepEqual([...result.uploaded], [1]);
  assert.deepEqual(progress, [1]);
  assert.equal(input.chunk_size, CHUNK_SIZE);
  assert.equal(input.file_hash, "hash");
  assert.equal(confirmedBytes(file.size, new Set([0, 1])), file.size);
  assert.equal(normalizeChunks(null, 1).size, 0);
  assert.equal(normalizeChunks(undefined, 1).size, 0);
  await assert.rejects(
    initializeUpload(file, {
      api: { initChunkUpload: async () => ({}) },
      signal: new AbortController().signal,
      fileHash: "hash",
    }),
    { name: 'AppError', key: 'errors.uploadIdMissing' },
  );
});

test("task scope locks submissions and rejects late callbacks after cancellation or account switch", () => {
  let session = 1;
  const scope = createTaskScope(() => session);
  const first = scope.start();
  assert.equal(scope.start(), undefined);
  session++;
  assert.equal(first.current(), false);
  scope.cancel();
  const second = scope.start();
  first.finish();
  assert.equal(first.signal.aborted, true);
  assert.equal(second.current(), true);
  second.finish();
  assert.ok(scope.start());
});

test("WASM initialization rejection reaches the caller", async () => {
  await assert.rejects(
    computeFileMd5(new Blob(["x"]), {
      createHasher: async () => {
        throw Error("WASM unavailable");
      },
    }),
    /WASM unavailable/,
  );
});

test("publish validates extensions, empty files, exact size boundaries and empty MIME", () => {
  for (const kind of ["video", "cover"]) {
    const limit = (kind === "video" ? 200 : 10) * 1024 * 1024;
    const name = kind === "video" ? "VIDEO.MP4" : "COVER.JPEG";
    assert.equal(fileError({ name, size: limit }, kind), undefined);
    assert.ok(fileError({ name, size: limit + 1 }, kind));
    assert.ok(fileError(new File([], name), kind));
    assert.ok(fileError(new File(["x"], "bad.exe"), kind));
    assert.equal(fileError(new File(["x"], name), kind), undefined);
    assert.ok(fileError(null, kind));
  }
  assert.equal(
    publishSchema.safeParse({ title: " ", description: "", video: null, cover: null }).success,
    false,
  );
});

import { uploadMissing, abortableWait } from "../src/features/publish/upload-video.ts";
import { ApiError } from "../src/api/client.ts";
import { createHash } from "node:crypto";

test("chunks upload serially in order with independent hashes and exact confirmed progress", async () => {
  for (const size of [1, CHUNK_SIZE, CHUNK_SIZE + 1, CHUNK_SIZE * 2]) {
    const file = new File([new Uint8Array(size)], "x.mp4");
    const state = { uploadId: "u", totalChunks: Math.ceil(size / CHUNK_SIZE), uploaded: new Set() };
    let inFlight = 0;
    const indices = [],
      progress = [];
    await uploadMissing(file, state, {
      signal: new AbortController().signal,
      api: {
        uploadChunk: async (id, index, hash, chunk) => {
          assert.equal(++inFlight, 1);
          assert.equal(
            hash,
            createHash("md5")
              .update(new Uint8Array(await chunk.arrayBuffer()))
              .digest("hex"),
          );
          indices.push(index);
          inFlight--;
          return { chunk_index: index };
        },
      },
      onProgress: (bytes) => progress.push(bytes),
    });
    assert.deepEqual(indices, [...Array(state.totalChunks).keys()]);
    assert.equal(progress.at(-1), size);
  }
});

test("only chunk transport errors retry at 500/1000 ms, at most three attempts", async () => {
  for (const error of [
    new TypeError("network"),
    new ApiError("server", 503),
    new ApiError("bad", 400),
    new DOMException("stop", "AbortError"),
    Error("protocol"),
  ]) {
    let attempts = 0;
    const waits = [];
    const file = new File(["x"], "x.mp4");
    await assert.rejects(
      uploadMissing(
        file,
        { uploadId: "u", totalChunks: 1, uploaded: new Set() },
        {
          signal: new AbortController().signal,
          api: {
            uploadChunk: async () => {
              attempts++;
              throw error;
            },
          },
          wait: async (ms) => {
            waits.push(ms);
          },
        },
      ),
    );
    const retries =
      error instanceof TypeError || (error instanceof ApiError && error.status === 503);
    assert.equal(attempts, retries ? 3 : 1);
    assert.deepEqual(waits, retries ? [500, 1000] : []);
  }
});

test("cancelling retry delay stops subsequent requests and clears timer", async () => {
  const controller = new AbortController();
  const waiting = abortableWait(10000, controller.signal);
  controller.abort();
  await assert.rejects(waiting, { name: "AbortError" });
  let calls = 0;
  const c = new AbortController();
  await assert.rejects(
    uploadMissing(
      new File(["x"], "x.mp4"),
      { uploadId: "u", totalChunks: 1, uploaded: new Set() },
      {
        signal: c.signal,
        api: {
          uploadChunk: async () => {
            calls++;
            throw new TypeError("network");
          },
        },
        wait: async () => {
          c.abort();
        },
      },
    ),
    { name: "AbortError" },
  );
  assert.equal(calls, 1);
});

import { uploadVideoChunked, uploadUrl } from "../src/features/publish/upload-video.ts";
function uploadFixture(statuses = [[0]], initial = []) {
  const calls = [];
  const api = {
    initChunkUpload: async () => {
      calls.push("init");
      return { upload_id: "u", uploaded_chunks: initial };
    },
    uploadChunk: async (_, index) => {
      calls.push(index);
      return { chunk_index: index };
    },
    chunkStatus: async () => {
      calls.push("status");
      return { total_chunks: 1, uploaded_chunks: statuses.shift() ?? [] };
    },
    completeChunkUpload: async () => {
      calls.push("complete");
      return { url: "/static/x.mp4" };
    },
  };
  return { api, calls, signal: new AbortController().signal, fileHash: "hash" };
}
test("completion always checks status, repairs at most once and never merges incomplete chunks", async () => {
  const file = new File(["x"], "x.mp4");
  const resumed = uploadFixture([[0]], [0]);
  await uploadVideoChunked(file, resumed);
  assert.deepEqual(resumed.calls, ["init", "status", "complete"]);
  const repaired = uploadFixture([[], [0]]);
  await uploadVideoChunked(file, repaired);
  assert.deepEqual(repaired.calls, ["init", 0, "status", 0, "status", "complete"]);
  const missing = uploadFixture([[], []]);
  await assert.rejects(uploadVideoChunked(file, missing), { name: 'AppError', key: 'errors.chunksUnconfirmed' });
  assert.equal(missing.calls.includes("complete"), false);
  const mismatch = uploadFixture();
  mismatch.api.chunkStatus = async () => ({ total_chunks: 3, uploaded_chunks: [0] });
  await assert.rejects(uploadVideoChunked(file, mismatch), { name: "AppError", key: "errors.chunkCountMismatch" });
});
test("complete never retries and missing or unsafe URLs cannot reach publication", async () => {
  const fixture = uploadFixture();
  let completes = 0;
  fixture.api.completeChunkUpload = async () => {
    completes++;
    throw new TypeError("lost response");
  };
  await assert.rejects(uploadVideoChunked(new File(["x"], "x.mp4"), fixture), { name: 'AppError', key: 'errors.mergeUncertain' });
  assert.equal(completes, 1);
  for (const url of ["", "javascript:x", "//evil.test/x", "bad"])
    assert.throws(() => uploadUrl({ url }, "video"));
  assert.equal(uploadUrl({ play_url: "/static/x.mp4" }, "video"), "/static/x.mp4");
  const invalid = uploadFixture();
  invalid.api.completeChunkUpload = async () => ({});
  await assert.rejects(uploadVideoChunked(new File(["x"], "x.mp4"), invalid), { name: 'AppError', key: 'errors.uploadMediaMissing' });
});

import { publishVideo, reconcileFiles } from "../src/features/publish/publish-video.ts";
function publishFixture() {
  const upload = uploadFixture();
  const counts = { cover: 0, publish: 0 };
  const draft = {
    title: " title ",
    description: " desc ",
    video: new File(["x"], "x.mp4"),
    cover: new File(["x"], "x.jpg"),
  };
  upload.api.uploadCover = async () => {
    counts.cover++;
    return { cover_url: "/static/c.jpg" };
  };
  upload.api.publish = async (input) => {
    counts.publish++;
    return { id: 9, ...input };
  };
  return { ...upload, counts, draft, checkpoints: { video: null, cover: null } };
}
test("cover failure preserves merged video; explicit publish refusal preserves both media", async () => {
  const f = publishFixture();
  f.api.uploadCover = async () => {
    f.counts.cover++;
    throw new ApiError("cover", 400);
  };
  await assert.rejects(publishVideo(f.draft, f.checkpoints, f), /cover/);
  assert.equal(f.checkpoints.videoUrl, "/static/x.mp4");
  f.api.uploadCover = async () => {
    f.counts.cover++;
    return { url: "/static/c.jpg" };
  };
  f.api.publish = async () => {
    f.counts.publish++;
    throw new ApiError("title", 400);
  };
  await assert.rejects(publishVideo(f.draft, f.checkpoints, f), /title/);
  f.api.publish = async (input) => {
    f.counts.publish++;
    assert.equal(input.title, "edited");
    return { id: 9, ...input };
  };
  const result = await publishVideo({ ...f.draft, title: " edited " }, f.checkpoints, f);
  assert.equal(result.id, 9);
  assert.equal(f.calls.filter((c) => c === "complete").length, 1);
  assert.deepEqual(f.counts, { cover: 2, publish: 2 });
  reconcileFiles(f.checkpoints, f.draft.video, null);
  assert.ok(f.checkpoints.videoUrl);
  assert.equal(f.checkpoints.coverUrl, undefined);
  reconcileFiles(f.checkpoints, null, null);
  assert.equal(f.checkpoints.videoUrl, undefined);
});
test("lost publish response cannot be automatically or manually resubmitted with the same checkpoints", async () => {
  const f = publishFixture();
  f.api.publish = async () => {
    f.counts.publish++;
    throw new TypeError("network");
  };
  await assert.rejects(publishVideo(f.draft, f.checkpoints, f), { name: 'AppError', key: 'errors.publishUncertain' });
  await assert.rejects(publishVideo(f.draft, f.checkpoints, f), { name: 'AppError', key: 'errors.publishUncertain' });
  assert.equal(f.counts.publish, 1);
});

test("cancellation at every network boundary stops the remaining publication pipeline", async () => {
  for (const method of [
    "initChunkUpload",
    "uploadChunk",
    "chunkStatus",
    "completeChunkUpload",
    "uploadCover",
    "publish",
  ]) {
    const f = publishFixture();
    const controller = new AbortController();
    f.signal = controller.signal;
    const original = f.api[method];
    f.api[method] = async (...args) => {
      const result = await original(...args);
      controller.abort();
      return result;
    };
    await assert.rejects(publishVideo(f.draft, f.checkpoints, f));
    if (method !== "publish") assert.equal(f.counts.publish, 0);
    if (["initChunkUpload", "uploadChunk", "chunkStatus", "completeChunkUpload"].includes(method))
      assert.equal(f.counts.cover, 0);
    if (method === "uploadCover") assert.equal(f.checkpoints.coverUrl, undefined);
    if (method === "publish") assert.equal(f.checkpoints.uncertain, true);
  }
});

test("late completion after leaving the task cannot update UI or release a new task lock", async () => {
  const scope = createTaskScope(() => 1);
  const old = scope.start();
  let resolve;
  const operation = new Promise((r) => {
    resolve = r;
  });
  let notifications = 0;
  const pending = operation
    .then(() => {
      if (old.current()) notifications++;
    })
    .finally(old.finish);
  scope.cancel();
  const current = scope.start();
  resolve();
  await pending;
  assert.equal(notifications, 0);
  assert.equal(current.current(), true);
  assert.equal(scope.start(), undefined);
});
