declare module './world-service' {
  export type ValueUpdater = number | ((prev: number) => number);
  export interface WorldService {
    setPlayerHP(roleId: number, value: ValueUpdater): number;
    setPlayerMP(roleId: number, value: ValueUpdater): number;
    setPlayerLevel(roleId: number, value: ValueUpdater): number;
    setPlayerAttackStrength(roleId: number, value: ValueUpdater): number;
    setPlayerMagicStrength(roleId: number, value: ValueUpdater): number;
    setPlayerDefense(roleId: number, value: ValueUpdater): number;
    setPlayerDexterity(roleId: number, value: ValueUpdater): number;
    setPlayerFleeRate(roleId: number, value: ValueUpdater): number;
  }
  const worldService: WorldService;
  export default worldService;
}
