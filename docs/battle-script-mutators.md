# Battle Script Battle-State Mutations

This table captures every battle-related opcode in `script.js` that mutates battle
state and the helper(s) we now rely on. Keeping this list up to date makes it
easy to confirm that all writes go through `BattleService`/state-service APIs.

| Opcode | Debug Message | Helper(s) | Target Fields |
| ------ | ------------- | --------- | ------------- |
| `0x0021` | Inflict damage to the enemy | `setEnemyHealth` | `enemy[index].e.health` (subtract damage for one or all enemies) |
| `0x0028` | Apply poison to enemy | `setEnemyPoison` | `enemy[index].poisons[slot].poisonID` / `.poisonScript` |
| `0x002A` | Cure poison by object ID for enemy | `clearEnemyPoison` | `enemy[index].poisons[slot]` (reset entry) |
| `0x002E` | Set the status for enemy | `setEnemyStatus` | `enemy[index].status[statusId]` |
| `0x0039` | Drain HP from enemy | `setEnemyHealth` | `enemy[eventObjectID].e.health` (subtract and transfer to player HP) |
| `0x005B` | Halve the enemy’s HP | `setEnemyHealth` | `enemy[eventObjectID].e.health` (subtract computed amount) |
| `0x005C` | Hide for a while | `setHidingTime` | `battle.hidingTime` |
| `0x0060` | Immediate KO of the enemy | `setEnemyHealth` | `enemy[eventObjectID].e.health = 0` |
| `0x0067` | Enemy use magic | `setEnemyMagic`, `setEnemyMagicRate` | `enemy[eventObjectID].e.magic`, `.magicRate` |
| `0x006B` | Blow away enemies | `setBattleBlow` | `battle.blow` |
| `0x0075` | Set the player party | `setPlayerActionType` | `player[assigned].action.actionType` |
| `0x0089` | Set the battle result | `setBattleResult` | `battle.battleResult` |
| `0x0092` | Show a magic-casting animation for a player in battle | `setPlayer`, `setPlayerColorShift` | `player[index].currentFrameNum`, `player[j].colorShift` |
| `0x009C` | Enemy duplicate itself | `setEnemy` (for clones), `setEnemyHealth`, `setEnemyPosition` | Cloned enemy record, split health, unify positions |
| `0x009E` | Enemy summons another monster | `setEnemyColorShift` | Reset color shift after summoning |
| `0x009F` | Enemy transforms into something else | `setEnemyObject`, `setEnemy`, `setEnemyColorShift` | Replace enemy template, reset frames/color shifts |

Notes:

- Read-only helpers such as `getEnemy` are omitted from the table because they don’t mutate state.
- Player/status updates outside battle use `stateService` helpers (`mutateGlobalValue`, `mutatePlayerRoles`, etc.) and are covered by `global-mutation-lint`.
