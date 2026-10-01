/**
 * Avisa UMA vez cada vez que o AudioContext passa a poder tocar.
 *
 * O aviso de "áudio destravado" só saía quando o `resume()` tirava o
 * contexto de `suspended`. Um contexto criado dentro de um gesto (ou depois
 * de a página já ter recebido um) nasce `running`: o aviso nunca saía, a
 * eleição da aba dona do som não disputava o lock e o bip não tocava até a
 * janela perder e ganhar foco de novo.
 *
 * Chame com o estado atual depois de criar/retomar o contexto e a cada
 * `statechange`. Voltar a um estado travado rearma o aviso.
 */
export function createAudioRunningAnnouncer(announce: () => void): (state: string) => void {
  let announced = false;
  return (state) => {
    if (state !== "running") {
      announced = false;
      return;
    }
    if (announced) return;
    announced = true;
    announce();
  };
}
