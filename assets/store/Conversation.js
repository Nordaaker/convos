import Messages from './Messages';
import Participants from '../store/Participants';
import Reactive from '../js/Reactive';
import Time from '../js/Time';
import {api} from '../js/Api';
import {calculateModes, is, str2color} from '../js/util';
import {channelModeCharToModeName} from '../js/constants';
import {getSocket} from '../js/Socket';
import {i18n} from './I18N';
import {notify} from '../js/Notify';
import {route} from '../store/Route';

const channelRe = new RegExp('^[#&]');

export default class Conversation extends Reactive {
  constructor(params) {
    super();

    const keyPrefix = [params.connection_id, params.conversation_id, ''].filter(is.defined).join(':');
    this.prop('persist', 'userInput', '', {key: keyPrefix + 'userInput'});

    this.prop('ro', 'color', str2color(params.conversation_id || params.connection_id || ''));
    this.prop('ro', 'connection_id', params.connection_id || '');
    this.prop('ro', 'messages', new Messages({}));
    this.prop('ro', 'participants', new Participants());
    this.prop('ro', 'path', route.conversationPath(params));

    this.prop('rw', 'historyStartAt', null);
    this.prop('rw', 'historyStopAt', null);
    this.prop('rw', 'modes', {});
    this.prop('rw', 'name', params.name || params.conversation_id || params.connection_id || 'ERR');
    this.prop('rw', 'notifications', params.notifications || 0);
    this.prop('rw', 'status', 'pending');
    this.prop('rw', 'topic', params.topic || '');
    this.prop('rw', 'unread', params.unread || 0);

    if (params.hasOwnProperty('conversation_id')) {
      this.prop('ro', 'conversation_id', params.conversation_id);
      this.prop('ro', 'title', () => [this.name, this.connection_id.replace(/^\w+-/, '')].join(' - '));
      this.prop('rw', 'frozen', params.frozen || '');
    }
    else {
      this.prop('ro', 'frozen', () => this._calculateFrozen());
      this.prop('ro', 'title', () => this.name);
    }

    if (params.conversation_id) {
      this.prop('persist', 'wantNotifications', this.is('private'), {key: params.conversation_id +  ':wantNotifications'});
    }

    this.socket = params.socket || getSocket('/events');
    this.messages.on('notify', (msg) => this.notify(msg));
    this._addOperations();
  }

  addMessages(messages, method) {
    if (!Array.isArray(messages)) {
      this._maybeIncreaseUnread(messages);
      this._maybeNotify(messages);
      if (!this.historyStopAt && ['action', 'private'].indexOf(messages.type) != -1) return;
      messages.fresh = true;
      messages = [messages];
    }

    this.messages[method || 'push'](messages);
    return this;
  }

  is(status) {
    if (status == 'connection') return !this.conversation_id;
    if (status == 'conversation') return this.conversation_id && !this.is('notifications');
    if (status == 'frozen') return this.frozen && true;
    if (status == 'locked') return this.frozen == 'Invalid password.';
    if (status == 'not_found') return this.frozen == 'Not found.';
    if (status == 'notifications') return false;
    if (status == 'pending') return this.frozen.match(/pending invitation/i);
    if (status == 'private') return this.conversation_id && !channelRe.test(this.conversation_id) || false;
    if (status == 'search') return false;
    if (status == 'unread') return this.unread && true;
    return this.status == status;
  }

  async load(params = {}) {
    if (this._skipLoad(params)) return this;

    // Load messages
    this.update({status: 'loading'});
    if (!params.limit) params.limit = 40;

    const opParams = {...params, connection_id: this.connection_id, conversation_id: this.conversation_id};
    await this.messagesOp.perform(opParams);

    this.update({status: this.messagesOp.status});

    const body = this.messagesOp.res.body;
    if (!body.messages) body.messages = [];
    const internalMessages = [];
    if (params.around || (!params.after && !params.before)) {
      internalMessages.push.apply(internalMessages, this.messages.toArray().filter(msg => msg.internal));
      this.messages.clear();
    }

    this.addMessages(body.messages, params.before ? 'unshift' : 'push');
    this.addMessages(internalMessages, 'push');
    this._setEndOfStream(params, body);

    return this;
  }

  notify(msg) {
    if (notify.appHasFocus) return;
    const title = msg.from == this.name ? msg.from : i18n.l('%1 in %2', msg.from, this.name);
    this.lastNotification = notify.show(msg.message, {path: this.path, title});
  }

  send(message, cb) {
    if (is.string(message)) message = {message};
    return this.socket.send({method: 'send', connection_id: this.connection_id, conversation_id: this.conversation_id || '', ...message}, cb);
  }

  async markAsRead() {
    if (!this.markAsReadOp) return;
    this.update({unread: 0});
    await this.markAsReadOp.perform({connection_id: this.connection_id, conversation_id: this.conversation_id});
    return this;
  }

  update(params) {
    this._loadParticipants();
    return super.update(params);
  }

  wsEventMode(params) {
    const listName = ['banlist', 'exceptlist', 'invitelist', 'quietlist'].filter(n => params[n])[0];
    if (listName) {
      const n = params[listName].length;
      const entries = n == 1 ? 'entry' : 'entries';
      this.addMessages({...params, message: '%1 has %2 ' + entries + ' in %3.', vars: [this.name, n, i18n.l(listName)]});
    }
    else if (params.nick) {
      this.participants.add({nick: params.nick, mode: params.mode});
      this.addMessages({...params, message: '%1 got mode %2 from %3.', vars: [params.nick, params.mode, params.from]});
    }
    else if (params.mode_changed) {
      this.addMessages({...params, message: '%1 received mode %2.', vars: [this.name, params.mode]});
      this.update({modes: Object.assign({}, this.modes, calculateModes(channelModeCharToModeName, params.mode))});
    }
    else {
      this.addMessages({...params, message: '%1 got mode %2.', vars: [this.name, params.mode]});
      this.update({modes: Object.assign({}, this.modes, calculateModes(channelModeCharToModeName, params.mode))});
    }
  }

  wsEventNickChange(params) {
    if (!this.participants.has(params.old_nick)) return;
    if (params.old_nick == params.new_nick) return;
    this.participants.rename(params.old_nick, params.new_nick);
    const message = params.type == 'me' ? 'You (%1) changed nick to %2.' : '%1 changed nick to %2.';
    this.addMessages({message, vars: [params.old_nick, params.new_nick]});
  }

  wsEventPart(params) {
    const participant = this.participants.get(params.nick);
    if (!participant || participant.me) return;
    this.participants.delete(params.nick);
    this.update({participants: true});
    if (!params.silent) {
      this.addMessages(this._partMessage(params));
    }
  }

  wsEventSentClear(params) {
    if (params.errors) return;
    this.messages.clear();
    this.addMessages({message: 'History was cleared for %1.', vars: [this.name]});
  }

  wsEventSentNames(params) {
    this.participants.add(params.participants);

    const msg = {...params, message: 'Participants (%1): %2', vars: []};
    const participants = this.participants.nicks();
    if (participants.length > 1) {
      msg.message += ' and %3.';
      msg.vars[2] = participants.pop();
    }

    msg.vars[0] = participants.length;
    msg.vars[1] = participants.join(', ');
    this.addMessages(msg);
  }

  wsEventSentTopic(params) {
    const message = params.topic ? 'Topic for %1 is: %2': 'No topic is set for %1.';
    this.addMessages({message, vars: [this.name, params.topic]});
    this.update({topic: params.topic});
  }

  _addOperations() {
    this.prop('ro', 'messagesOp', api('/api', 'conversationMessages'));
    this.prop('ro', 'markAsReadOp', api('/api', 'markConversationAsRead'));
  }

  _calculateFrozen() {
    return '';
  }

  _loadParticipants() {
    if (this.participantsLoaded || !this.conversation_id || !this.messagesOp) return;
    if (this.is('frozen') || !this.messagesOp.is('success')) return;
    this.participantsLoaded = true;

    if (this.is('private')) {
      this.send('/whois ' + this.conversation_id, (e) => {
        e.stopPropagation();
        this.update({frozen: e.errors && e.errors.length ? e.errors[0].message : ''});
      });
    }
    else {
      this.send('/names ' + this.conversation_id, (e) => {
        e.stopPropagation();
        this.participants.clear();
        if (e.participants) this.participants.add(e.participants);
      });
    }
  }

  _maybeIncreaseUnread(msg) {
    if (!msg.from || msg.yourself) return this;
    if (['action', 'error', 'private'].indexOf(msg.type) == -1) return this;
    this.update({unread: this.unread + 1});
  }

  _maybeNotify(msg) {
    if (!msg.from || msg.yourself) return;
    if (['action', 'error', 'private'].indexOf(msg.type) == -1) return;
    if (!msg.highlight && !this.wantNotifications) return;
    this.notify(msg);
  }

  _noop() {
  }

  _partMessage(params) {
    const msg = {message: '%1 parted.', vars: [params.nick]};
    if (params.kicker) {
      msg.message = '%1 was kicked by %2' + (params.message ? ': %3' : '');
      msg.vars.push(params.kicker);
      msg.vars.push(params.message);
    }
    else if (params.message) {
      msg.message += ' Reason: %2';
      msg.vars.push(params.message);
    }

    return msg;
  }

  _setEndOfStream(params, body) {
    if (!params.before && !body.after) {
      const msg = body.messages.slice(-1)[0];
      this.update({historyStopAt: new Time(msg && msg.ts)});
    }
    if (!params.after && !body.before) {
      const msg = body.messages[0];
      this.update({historyStartAt: new Time(msg && msg.ts)});
    }

    if (body.after) this.update({historyStopAt: null});
    if (body.before) this.update({historyStartAt: null});
    if (body.messages && body.messages.length <= 1) this.update({historyStartAt: new Time(), historyStopAt: new Time()});
  }

  _skipLoad(opParams) {
    if (!this.messagesOp || this.is('loading')) return true;
    if (!this.messages.length) return this.is('success');
    if (opParams.around) return !!this.messages.toArray().find(msg => msg.ts.toISOString() == opParams.around);
    if (opParams.before && this.historyStartAt) return true;
    if (opParams.after && this.historyStopAt) return true;
    return false;
  }
}
