import assert from "node:assert/strict";
import { test } from "node:test";

import {
  chunk,
  readReceipts,
  safeEqual,
  ticketsToTrack,
  tokensToForget,
  type ExpoMessage,
} from "./expo-push.ts";

const message = (to: string): ExpoMessage => ({
  to,
  title: "Famille",
  body: "C'est décidé : Pizza. Bon appétit !",
  data: {},
  sound: "default",
  channelId: "default",
  priority: "high",
});

const messages = [message("ExponentPushToken[a]"), message("ExponentPushToken[b]"), message("ExponentPushToken[c]")];
const dead = { status: "error", message: "mort", details: { error: "DeviceNotRegistered" } } as const;
const rateLimited = { status: "error", message: "trop vite", details: { error: "MessageRateExceeded" } } as const;

test("safeEqual compare sans se tromper, longueurs différentes comprises", () => {
  assert.equal(safeEqual("secret-123", "secret-123"), true);
  assert.equal(safeEqual("secret-123", "secret-124"), false);
  assert.equal(safeEqual("secret", "secret-123"), false);
  assert.equal(safeEqual("", "secret"), false);
});

test("chunk découpe en paquets de taille maximale", () => {
  assert.deepEqual(chunk([1, 2, 3, 4, 5], 2), [[1, 2], [3, 4], [5]]);
  assert.deepEqual(chunk([], 100), []);
});

test("tokensToForget ne garde que les DeviceNotRegistered, dans l'ordre de l'envoi", () => {
  assert.deepEqual(tokensToForget(messages, [{ status: "ok", id: "t1" }, dead, rateLimited]), [
    "ExponentPushToken[b]",
  ]);
});

test("tokensToForget ignore un ticket sans message correspondant", () => {
  assert.deepEqual(tokensToForget([], [dead]), []);
});

test("ticketsToTrack garde les tickets acceptés avec leur jeton", () => {
  assert.deepEqual(ticketsToTrack(messages, [{ status: "ok", id: "t1" }, dead, { status: "ok", id: "t3" }]), [
    { id: "t1", token: "ExponentPushToken[a]" },
    { id: "t3", token: "ExponentPushToken[c]" },
  ]);
});

test("readReceipts : jetons morts à oublier, reçus arrivés à ne plus suivre, les autres attendent", () => {
  const tracked = [
    { id: "t1", token: "ExponentPushToken[a]" },
    { id: "t2", token: "ExponentPushToken[b]" },
    { id: "t3", token: "ExponentPushToken[c]" },
    { id: "t4", token: "ExponentPushToken[b]" },
  ];
  const result = readReceipts(tracked, {
    t1: { status: "ok" },
    t2: dead,
    t3: rateLimited,
    // t4 : pas encore de reçu
  });
  assert.deepEqual(result.forget, ["ExponentPushToken[b]"]);
  assert.deepEqual(result.settled, ["t1", "t2", "t3"]);
});

test("readReceipts : un jeton mort deux fois n'est listé qu'une fois", () => {
  const tracked = [
    { id: "t1", token: "ExponentPushToken[a]" },
    { id: "t2", token: "ExponentPushToken[a]" },
  ];
  assert.deepEqual(readReceipts(tracked, { t1: dead, t2: dead }).forget, ["ExponentPushToken[a]"]);
});
