import { describe, expect, it, vi } from "vitest";

import { createAudioRunningAnnouncer } from "../audio-running-announcer";
import { createSoundOwnerElection, type SoundOwnerLocks } from "../sound-owner-election";

describe("createAudioRunningAnnouncer", () => {
  it("contexto que já nasce tocando avisa na primeira checagem", () => {
    const announce = vi.fn();
    const check = createAudioRunningAnnouncer(announce);
    check("running");
    expect(announce).toHaveBeenCalledTimes(1);
  });

  it("não repete o aviso a cada gesto com o contexto tocando", () => {
    const announce = vi.fn();
    const check = createAudioRunningAnnouncer(announce);
    check("running");
    check("running");
    check("running");
    expect(announce).toHaveBeenCalledTimes(1);
  });

  it("travado não avisa; ao destravar, avisa", () => {
    const announce = vi.fn();
    const check = createAudioRunningAnnouncer(announce);
    check("suspended");
    expect(announce).not.toHaveBeenCalled();
    check("running");
    expect(announce).toHaveBeenCalledTimes(1);
  });

  it("voltar a travar rearma: destravar de novo avisa de novo", () => {
    const announce = vi.fn();
    const check = createAudioRunningAnnouncer(announce);
    check("running");
    check("interrupted");
    check("running");
    expect(announce).toHaveBeenCalledTimes(2);
  });
});

describe("aviso de áudio tocando + eleição da aba dona do som", () => {
  /** Lock exclusivo mínimo: concede na hora a quem pede primeiro. */
  const grantingLocks = (): SoundOwnerLocks => ({
    request: (_name, _options, cb) => Promise.resolve(cb({} as Lock)),
  });

  it("contexto que nasce tocando faz a aba disputar e virar dona", async () => {
    let state = "suspended";
    const election = createSoundOwnerElection({
      lockName: "som:teste",
      locks: grantingLocks(),
      isAudioRunning: () => state === "running",
    });
    // Montagem, antes de qualquer gesto: sem áudio, não disputa.
    election.acquire(true);
    expect(election.isOwner()).toBe(false);

    const check = createAudioRunningAnnouncer(() => election.acquire(true));
    // Primeiro gesto: o contexto é criado já `running`.
    state = "running";
    check(state);
    await Promise.resolve();
    expect(election.isOwner()).toBe(true);
  });
});
