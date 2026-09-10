// ============================================================================
//  Team chat: player text chat, quick-chat wheel, and reactive bot chatter.
//  Mirrors classic MLBB lobby vibes - teammates ping for help, celebrate
//  multi-kills, tilt after being ganked, and type gg at the end.
// ============================================================================

import { ChatMessage, Hero, QuickChatOption } from '../types/game';

export const QUICK_CHAT: QuickChatOption[] = [
  { id: 'attack', label: 'Attack!', chat: 'Attack! Push the objective.', kind: 'attack' },
  { id: 'retreat', label: 'Retreat!', chat: 'Retreat! Back off now.', kind: 'retreat' },
  { id: 'help', label: 'Need help!', chat: 'Need help!', kind: 'help' },
  { id: 'gather', label: 'Gather!', chat: 'Gather up, group for a fight.', kind: 'gather' },
  { id: 'nice', label: 'Nice!', chat: 'Nice!', kind: 'nice' },
  { id: 'thanks', label: 'Thanks', chat: 'Thanks.', kind: 'thanks' },
  { id: 'turtle', label: 'Kill Turtle', chat: 'Let us take the Turtle.' },
  { id: 'lord', label: 'Take Lord', chat: 'Take the Lord, then push.' },
  { id: 'defend', label: 'Defend base', chat: 'Defend the base!' },
  { id: 'gg', label: 'Good game', chat: 'Good game, well played.' }
];

interface Persona {
  /** chance to speak after an exciting event, per second */
  chattiness: number;
  tilt: number;
  positive: string[];
  negative: string[];
  callouts: string[];
  replies: string[];
}

const PERSONAS: Persona[] = [
  {
    chattiness: 0.06, tilt: 0.4,
    positive: ['ez game ez win', 'nice nice!', 'keep pushing, we got this', 'i like this draft', 'solo rank carry incoming'],
    negative: ['we need tanks', 'they invade my jungle??', 'focus the marksman not me', 'stop diving 2 towers pls'],
    callouts: ['turtle is up, come river', 'lord spawn soon', 'their mid is roaming missing', 'ward the bush, they like to bush'],
    replies: ['ok', 'on my way', 'gg wp', 'copy', 'sure, i come']
  },
  {
    chattiness: 0.045, tilt: 0.6,
    positive: ['not bad', 'i respect that', 'ok this is fun', 'one more tower and we win'],
    negative: ['mid why no help', 'i die 3 times already', 'this jungle is feeding', 'retro? no no no'],
    callouts: ['i need backup top', 'they have red buff, careful', 'do not force, wait for minions'],
    replies: ['later, i farm first', 'ok ok', 'dont worry', 'my bad']
  },
  {
    chattiness: 0.055, tilt: 0.25,
    positive: ['thanks!', 'good teamfight', 'we can come back from this', 'i believe in us', 'alhamdulillah'],
    negative: ['please stop solo fighting', 'we should group up', 'save your CC for their assassin'],
    callouts: ['i will roam and ward', 'use the bushes for vision', 'they are doing turtle, stop them!'],
    replies: ['siap!', 'coming now', 'thanks for the info', 'i support you']
  },
  {
    chattiness: 0.03, tilt: 0.75,
    positive: ['fine', 'acceptable', 'i guess we win this'],
    negative: ['this is my 5th loss today', 'pick meta heroes pls', 'if you feed, i am also done', '1v9 as usual'],
    callouts: ['push a lane, do not group mid all game', 'last hit your creeps!!'],
    replies: ['hm', 'ok', 'do your job']
  },
  {
    chattiness: 0.05, tilt: 0.15,
    positive: ['we are so back', 'lets go!!', 'i am hyped', 'great play teammate'],
    negative: ['that hurt', 'ow my turtle', 'they stole my buff again'],
    callouts: ['i will distract them, you flank', 'careful franco hook!!'],
    replies: ['yes yes yes', 'hahaha ok', 'i come i come']
  }
];

export type ChatTrigger =
  | 'first-blood' | 'kill' | 'death' | 'double' | 'triple' | 'maniac' | 'savage'
  | 'turret-lost' | 'turret-kill' | 'turtle' | 'lord' | 'steal' | 'losing'
  | 'winning' | 'end-close' | 'greet' | 'nice' | 'thanks' | 'apology';

export class ChatSystem {
  messages: ChatMessage[] = [];
  version = 0;
  enabled = true;
  private uid = 1;
  private cooldowns = new Map<number, number>();
  private personaFor = new Map<number, number>();
  private now = 0;
  /** set by the engine so bots can respond to the player typing */
  onIncoming?: (text: string, toAll: boolean) => void;

  private persona(hero: Hero): Persona {
    let idx = this.personaFor.get(hero.uid);
    if (idx === undefined) {
      idx = Math.floor(Math.random() * PERSONAS.length);
      this.personaFor.set(hero.uid, idx);
    }
    return PERSONAS[idx];
  }

  private static pick<T>(arr: readonly T[]): T {
    return arr[Math.floor(Math.random() * arr.length)];
  }

  push(msg: Omit<ChatMessage, 'uid'>): ChatMessage {
    const full: ChatMessage = { ...msg, uid: this.uid++ };
    this.messages.push(full);
    if (this.messages.length > 120) this.messages.splice(0, this.messages.length - 120);
    this.version++;
    return full;
  }

  system(text: string, tone: ChatMessage['tone'] = 'neutral') {
    return this.push({
      channel: 'system', senderName: '', senderTeam: 'system', text,
      time: this.now, tone
    });
  }

  /** Player typed something in the chat box. */
  fromPlayer(hero: Hero, text: string, toAll: boolean) {
    const clean = text.trim().slice(0, 120);
    if (!clean) return;
    this.push({
      channel: toAll ? 'all' : 'team',
      senderName: hero.name,
      senderTeam: hero.team,
      senderHeroId: hero.defId,
      text: clean,
      time: this.now,
      isPlayer: true
    });
    this.onIncoming?.(clean, toAll);
  }

  /** Player used the quick-chat wheel. */
  quickFromPlayer(hero: Hero, option: QuickChatOption, toAll = false) {
    this.push({
      channel: toAll ? 'all' : 'team',
      senderName: hero.name,
      senderTeam: hero.team,
      senderHeroId: hero.defId,
      text: option.chat,
      time: this.now,
      isQuick: true,
      isPlayer: true,
      pingKind: option.kind
    });
  }

  /** A bot says something to the team. */
  botSay(hero: Hero, text: string, opts: { force?: boolean; isQuick?: boolean } = {}) {
    if (hero.isPlayer) return;
    const cd = this.cooldowns.get(hero.uid) ?? 0;
    if (!opts.force && this.now < cd) return;
    this.cooldowns.set(hero.uid, this.now + 7 + Math.random() * 12);
    this.push({
      channel: 'team',
      senderName: hero.name,
      senderTeam: hero.team,
      senderHeroId: hero.defId,
      text,
      time: this.now,
      isQuick: opts.isQuick
    });
  }

  /** Random flavour line tied to a match event. */
  botReact(
    speakers: Hero[],
    time: number,
    trigger: ChatTrigger,
    context: { hero?: Hero; victim?: Hero; losing?: boolean; chance?: number } = {}
  ) {
    this.now = time;
    const chance = context.chance ?? 0.45;
    const pool = speakers.filter(h => !!h.dead && (context.hero ? h.team === context.hero.team : true));
    if (!pool.length) return;
    if (Math.random() > chance) return;
    const speaker = pool[Math.floor(Math.random() * pool.length)];
    const p = this.persona(speaker);
    let text = '';

    switch (trigger) {
      case 'greet':
        text = ChatSystem.pick(['good luck all', 'gl hf', 'have fun everyone', 'i mid, ok?', 'lets win this']);
        break;
      case 'first-blood':
        text = ChatSystem.pick(context.hero?.team === speaker.team
          ? ['first blood! keep going', 'nice!!', 'i told you, he is feed']
          : ['first blood and we already lose?', 'be careful now', 'sorry, my mistake']);
        break;
      case 'kill':
      case 'double':
      case 'triple':
      case 'maniac':
      case 'savage':
        if (context.hero?.team === speaker.team) {
          text = ChatSystem.pick(trigger === 'savage'
            ? ['SAVAGE!!!', 'omg savage, i clip that', 'carry carry carry']
            : trigger === 'maniac'
              ? ['maniac! so hot', 'you are crazy good']
              : ['nice kill!', 'that combo was clean', 'keep feeding him']);
        } else {
          text = ChatSystem.pick(['we got played', 'someone stop him pls', 'i cannot carry alone']);
        }
        break;
      case 'death':
        text = ChatSystem.pick(context.hero?.team === speaker.team
          ? ['sorry i died', 'he burst too fast', 'need backup next time']
          : ['dead once more', 'i go jungle to heal up', 'wait for me, i respawn soon']);
        break;
      case 'turret-lost':
        text = ChatSystem.pick(context.hero?.team === speaker.team
          ? ['tower gone, do not force now', 'defend the next tower!!']
          : ['good, now push the lane', 'tower down, we rotate']);
        break;
      case 'turret-kill':
        text = ChatSystem.pick(['tower! push push', 'we can take core now', 'nice, minions matter']);
        break;
      case 'turtle':
      case 'lord':
        text = ChatSystem.pick(context.hero?.team === speaker.team
          ? ['objective is ours, group up', 'now we push']
          : ['they took it, do not fight 5v4', 'ward the river next time']);
        break;
      case 'steal':
        text = ChatSystem.pick(['they stole my buff...', 'steal!! so annoying', 'careful in own jungle']);
        break;
      case 'losing':
        text = ChatSystem.pick(p.negative);
        break;
      case 'winning':
        text = ChatSystem.pick(p.positive);
        break;
      case 'end-close':
        text = ChatSystem.pick(['gg wp', 'good game all', 'well played', 'that was close, respect']);
        break;
      case 'nice':
        text = ChatSystem.pick(p.positive);
        break;
      case 'thanks':
      case 'apology':
        text = ChatSystem.pick(['np', 'no worries', 'its ok', 'sorry my bad']);
        break;
    }
    if (!text) text = ChatSystem.pick(p.callouts);
    this.botSay(speaker, text, { force: trigger === 'greet' || trigger === 'end-close' });
  }

  /** Bots answer when the player types something. */
  botReplyTo(allies: Hero[], text: string, time: number) {
    this.now = time;
    const lower = text.toLowerCase();
    let reply: string | null = null;
    if (/(help|backup|come)/.test(lower)) reply = 'coming, wait 5 second';
    else if (/(gg|good game)/.test(lower)) reply = 'gg wp, nice game';
    else if (/(sorry|my bad|maaf|fps)/.test(lower)) reply = 'no worries, focus next fight';
    else if (/(attack|push|go)/.test(lower)) reply = 'ok, i follow you';
    else if (/(noob|feed|trash|mid noob)/.test(lower)) reply = 'do not tilt, we can still win';
    else if (/(thanks|ty|terima)/.test(lower)) reply = 'np!';
    else if (/(turtle|lord|objective)/.test(lower)) reply = 'yes objective first, then push';
    const alive = allies.filter(a => a.isBot && !a.dead);
    if (!reply && Math.random() < 0.5 && alive.length) {
      reply = ChatSystem.pick(this.persona(ChatSystem.pick(alive)).replies);
    }
    if (!reply || !alive.length) return;
    this.botSay(ChatSystem.pick(alive), reply, { force: true });
  }

  /** Occasional ambient team chatter, weighted by how the match is going. */
  tickIdle(allies: Hero[], time: number, scoreDiff: number) {
    this.now = time;
    if (Math.random() > 0.5) return;
    const cand = allies.filter(a => a.isBot && !a.dead);
    if (!cand.length) return;
    const who = cand[Math.floor(Math.random() * cand.length)];
    const p = this.persona(who);
    if (scoreDiff <= -3 && Math.random() < p.tilt) {
      this.botSay(who, ChatSystem.pick(p.negative), {});
    } else if (scoreDiff >= 3) {
      this.botSay(who, ChatSystem.pick(p.positive), {});
    } else {
      this.botSay(who, ChatSystem.pick(p.callouts), {});
    }
  }

  clear() {
    this.messages = [];
    this.version++;
  }
}
