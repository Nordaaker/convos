import Reactive from '../js/Reactive';
import SortedMap from '../js/SortedMap';
import Time from '../js/Time';
import {l} from '../js/i18n';
import {md} from '../js/md';
import {str2color} from '../js/util';

const channelRe = new RegExp('^[#&]');
const modes = {o: '@', v: '+'};
const modeVals = {o: 10, v: 9};

const sortParticipants = (a, b) => {
  return (modeVals[b.mode] || 0) - (modeVals[a.mode] || 0) || a.name.localeCompare(b.name);
};

export default class Dialog extends Reactive {
  constructor(params) {
    super();

    const path = [];
    if (params.connection_id) path.push(params.connection_id);
    if (params.dialog_id) path.push(params.dialog_id);

    this._readOnlyAttr('api', params.api);
    this._readOnlyAttr('connection_id', params.connection_id || '');
    this._readOnlyAttr('events', params.events);
    this._readOnlyAttr('is_private', () => !channelRe.test(this.name));
    this._readOnlyAttr('participants', new SortedMap([], {sorter: sortParticipants}));
    this._readOnlyAttr('path', path.map(p => encodeURIComponent(p)).join('/'));

    this._updateableAttr('last_active', new Time(params.last_active));
    this._updateableAttr('last_read', new Time(params.last_read));
    this._updateableAttr('messages', []);
    this._updateableAttr('mode', '');
    this._updateableAttr('name', params.name || 'Unknown');
    this._updateableAttr('status', 'loading');
    this._updateableAttr('topic', params.topic || '');
    this._updateableAttr('unread', params.unread || 0);

    if (params.hasOwnProperty('dialog_id')) {
      this._readOnlyAttr('dialog_id', params.dialog_id);
      this._updateableAttr('frozen', params.frozen || '');
    }
    else {
      this._readOnlyAttr('frozen', () => this._calculateFrozen());
    }

    this.events.on('update', this._loadParticipants.bind(this));
    this._addOperations();
  }

  addMessage(msg) {
    this.update({unread: this.unread + 1});
    return this.addMessages('push', [msg]);
  }

  addMessages(method, messages) {
    let start = 0;
    let stop = messages.length;

    switch (method) {
      case 'push':
        start = this.messages.length;
        messages = this.messages.concat(messages);
        stop = messages.length;
        break;
      case 'unshift':
        messages = messages.concat(this.messages);
        break;
    }

    for (let i = start; i < stop; i++) {
      const msg = messages[i];
      if (msg.hasOwnProperty('markdown')) continue; // Already processed
      if (!msg.from) msg.from = this.connection_id || 'Convos';
      if (msg.vars) msg.message = l(msg.message, ...msg.vars);
      if (msg.highlight) this.events.notifyUser(msg.from, msg.message);

      msg.color = str2color(msg.from.toLowerCase());
      msg.ts = new Time(msg.ts);
      msg.dayChanged = i == 0 ? false : msg.ts.getDate() != messages[i - 1].ts.getDate();
      msg.embeds = (msg.message.match(/https?:\/\/(\S+)/g) || []).map(url => url.replace(/([.!?])?$/, ''));
      msg.isSameSender = i == 0 ? false : messages[i].from == messages[i - 1].from;
      msg.markdown = md(msg.message);
    }

    this.update({messages, status: 'loaded'});
    return this;
  }

  findParticipants(params) {
    if (!params) return this.participants.toArray();

    const needleKeys = Object.keys(params);
    const found = [];

    this.participants.forEach(participant => {
      for (let ni = 0; ni < needleKeys.length; ni++) {
        const needleKey = params[needleKeys[ni]];
        if (params[needleKey] != participant[needleKey]) return;
      }
      found.push(participant);
    });

    return found;
  }

  is(status) {
    if (status == 'frozen') return this.frozen && true;
    if (status == 'private') return this.is_private;
    if (status == 'unread') return this.unread && true;
    return this.status == status;
  }

  async load() {
    if (this.is_private && this.dialog_id) this.send('/ison', '_noop'); // Check if user is active
    if (!this.messagesOp || this.messagesOp.is('success')) return this;
    this.update({status: 'loading'});
    await this.messagesOp.perform(this);
    this._loadParticipants();
    return this.addMessages('set', this.messagesOp.res.body.messages || []);
  }

  async loadHistoric() {
    const first = this.messages[0];
    if (!first || first.end) return;

    this.update({status: 'loading'});
    await this.messagesOp.perform({
      before: first.ts.toISOString(),
      connection_id: this.connection_id,
      dialog_id: this.dialog_id,
    });

    const messages = this.messagesOp.res.body.messages || [];
    if (!messages.length && this.messages.length) first.endOfHistory = true;
    return this.addMessages('unshift', messages);
  }

  participant(nick, params = {}) {
    const id = this._participantId(nick);
    params.nick = nick;

    let participant = this.participants.get(id);
    if (participant) {
      Object.keys(params).forEach(k => { participant[k] = params[k] });
    }
    else {
      participant = {mode: '', ...params, color: str2color(id), id, name: nick, ts: new Time()};
      this.participants.set(id, participant);
    }

    this.update({});

    return participant;
  }

  send(message, methodName) {
    this.events.send(
      {connection_id: this.connection_id, dialog_id: this.dialog_id || '', message},
      methodName ? this[methodName].bind(this) : null,
    );
  }

  async setLastRead() {
    if (!this.setLastReadOp) return;
    await this.setLastReadOp.perform({connection_id: this.connection_id, dialog_id: this.dialog_id});
    this.update({unread: 0, ...this.setLastReadOp.res.body}); // Update last_read
  }

  wsEventMode(params) {
    if (!params.nick) return this.update({mode: params.mode}); // Channel mode
    this.participant(params.nick, {mode: params.mode});
    this.addMessage({message: '%1 got mode %2 from %3.', vars: [params.nick, params.mode, params.from]});
  }

  wsEventNickChange(params) {
    const oldId = this._participantId(params.old_nick);
    if (!this.participants.has(oldId)) return;
    if (params.old_nick == params.new_nick) return;
    this.participants.delete(oldId);
    this.participant(params.new_nick, params);
    this.addMessage({message: '%1 changed nick to %2.', vars: [params.old_nick, params.new_nick]});
  }

  wsEventPart(params) {
    const id = this._participantId(params.nick);
    const participant = this.participants.find(p => p.id == id) || {};
    this.addMessage(this._partMessage(params));
    if (participant.me) return;
    this.participants.delete(id);
    this.update({});
  }

  wsEventSentNames(params) {
    this._updateParticipants(params);

    const msg = {message: 'Participants (%1): %2', vars: []};
    const participants = this.participants.map(p => (modes[p.mode] || '') + p.name);
    if (participants.length > 1) {
      msg.message += ' and %3.';
      msg.vars[2] = participants.pop();
    }

    msg.vars[0] = participants.length;
    msg.vars[1] = participants.join(', ');
    this.addMessage(msg);
  }

  _addOperations() {
    this._readOnlyAttr('setLastReadOp', this.api.operation('setDialogLastRead'));
    this._readOnlyAttr('messagesOp', this.api.operation('dialogMessages'));
  }

  _calculateFrozen() {
    return '';
  }

  _loadParticipants() {
    if (!this.messagesOp || !this.messagesOp.is('success')) return;
    if (!this.events.ready || this._participantsLoaded) return;
    if (this.dialog_id && !this.is('private') && !this.is('frozen')) this.send('/names', '_updateParticipants');
    this._participantsLoaded = true;
  }

  _noop() {
  }

  _participantId(name) {
    return name.toLowerCase();
  }

  _partMessage(params) {
    const msg = {message: '%1 parted.', vars: [params.nick]};
    if (params.kicker) {
      msg.message = '%1 was kicked by %2' + (params.message ? ': %3' : '');
      msg.vars.push(params.kicked);
      msg.vars.push(params.message);
    }
    else if (params.message) {
      msg.message += ' Reason: %2';
      msg.vars.push(params.message);
    }

    return msg;
  }

  _updateParticipants(params) {
    this.participants.clear();
    params.participants.forEach(p => this.participant(p.nick || p.name, {mode: p.mode}));
    params.stopPropagation();
  }
}
