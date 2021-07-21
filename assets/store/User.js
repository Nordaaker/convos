import Connection from './Connection';
import ConnectionProfiles from './ConnectionProfiles';
import Conversation from './Conversation';
import Notifications from './Notifications';
import Reactive from '../js/Reactive';
import Search from './Search';
import SortedMap from '../js/SortedMap';
import {camelize, extractErrorMessage} from '../js/util';
import {route} from './Route';
import {getSocket} from './../js/Socket';

export default class User extends Reactive {
  constructor(params) {
    super();

    this.prop('ro', 'connections', new SortedMap());
    this.prop('ro', 'connectionProfiles', new ConnectionProfiles());
    this.prop('ro', 'notifications', new Notifications({}));
    this.prop('ro', 'search', new Search({}));
    this.prop('ro', 'roles', new Set());
    this.prop('ro', 'unread', () => this._calculateUnread());

    this.prop('persist', 'expandUrlToMedia', true);
    this.prop('persist', 'ignoreStatuses', false);
    this.prop('persist', 'lastUrl', '');

    this.prop('rw', 'activeConversation', this.notifications);
    this.prop('rw', 'email', '');
    this.prop('rw', 'forced_connection', false);
    this.prop('rw', 'default_connection', 'irc://irc.libera.chat:6697/%23convos');
    this.prop('rw', 'highlightKeywords', []);
    this.prop('rw', 'status', 'pending');
    this.prop('rw', 'videoService', params.videoService || '');

    this.socket = params.socket || getSocket('/events');
    this.socket.on('message', (msg) => this._dispatchMessage(msg));
    this.socket.on('update', (socket) => this._onConnectionChange(socket));

    // setInterval(() => this.socket.close(), 5000); // debug WebSocket reconnect issues
  }

  conversations(cb) {
    const conversations = [];

    this.connections.toArray().forEach(conn => {
      conn.conversations.toArray().forEach(conversation => {
        if (!cb || cb(conversation)) conversations.push(conversation);
      });
    });

    return conversations;
  }

  ensureConversation(params, _lock) {
    params = {...params, videoService: this.videoService};
    // Ensure channel or private conversation
    if (params.conversation_id) {
      const conn = this.ensureConversation({connection_id: params.connection_id}, true);
      return this._maybeUpgradeActiveConversation(conn.ensureConversation(params));
    }

    // Find connection
    let conn = this.findConversation(params);
    if (conn) return conn.update(params);

    // Create connection
    conn = new Connection({...params});

    // TODO: Figure out how to update Chat.svelte, without updating the user object
    conn.on('conversationadd', (conversation) => this._maybeUpgradeActiveConversation(conversation));
    conn.on('conversationremove', (conversation) => (conversation == this.activeConversation && this.setActiveConversation(conversation)));
    conn.on('update', (conn) => this.update({connections: true}));
    this.connections.set(conn.connection_id, conn);
    this.update({connections: true});
    return _lock ? conn : this._maybeUpgradeActiveConversation(conn);
  }

  findConversation(params) {
    const conn = this.connections.get(params.connection_id);
    return !params.conversation_id ? conn : conn && conn.findConversation(params) || null;
  }

  is(statusOrRole) {
    if (Array.isArray(statusOrRole)) return !!statusOrRole.filter(sr => this.is(sr)).length;
    if (this.roles.has(statusOrRole)) return true;
    return this.status == statusOrRole;
  }

  async load() {
    if (this.is('loading')) return this;
    this.roles.clear();
    this.update({status: 'loading'});

    const p = new Promise(resolve => this.socket.send({method: 'load', object: 'user', params: {connections: true, conversations: true}}, resolve));
    const res = await p;

    // TODO: Improve error handling
    if (res.errors) {
      return this.update({email: '', roles: true, status: res.errors ? 'error' : 'success'});
    }

    const data = res.user || {};
    this.connections.clear();
    (data.connections || []).forEach(conn => this.ensureConversation({...conn, status: 'pending'}));
    (data.conversations || []).forEach(conversation => this.ensureConversation({...conversation, status: 'pending'}));

    this.updateNotificationCount();

    (data.roles || []).forEach(role => this.roles.add(role));

    return this.update({
      email: data.email || '',
      default_connection: data.default_connection || '',
      forced_connection: data.forced_connection || false,
      highlightKeywords: data.highlight_keywords || [],
      roles: true,
      status: res.errors ? 'error' : 'success',
      videoService: data.video_service || '',
    });
  }

  markNotificationsRead() {
    this.conversations().forEach(conv => conv.update({notifications: 0}));
    user.activeConversation.markAsRead();
  }

  removeConversation(params) {
    const conn = this.findConversation({connection_id: params.connection_id});
    if (params.conversation_id) return conn && conn.removeConversation(params);
    this.connections.delete(params.connection_id);
    if (conn == this.activeConversation) this.setActiveConversation(conn);
    this.update({connections: true});
  }

  setActiveConversation(params) {
    let activeConversation = !params.connection_id && !params.conversation_id && this.notifications;
    if (activeConversation) return this.update({activeConversation});

    activeConversation = this.findConversation(params);
    if (activeConversation) return this.update({activeConversation});

    // Need to expand params manually, in case we are passing in a reactive object
    const props = {...params, connection_id: params.connection_id || '', frozen: 'Not found.'};
    ['conversation_id', 'name'] .forEach(k => params.hasOwnProperty(k) && (props[k] = params[k]));
    return this.update({activeConversation: props.conversation_id ? new Conversation(props) : new Connection(props)});
  }

  update(params) {
    if (params.videoService) this.connections.forEach(conn => conn.update({videoService: params.videoService}));
    return super.update(params);
  }

  updateNotificationCount() {
    this.notifications.update({unread: this._calculateNotifications()});
  }

  _calculateNotifications() {
    return this.connections.toArray().reduce(
      (outersum, conn) => outersum + conn.conversations.toArray().reduce(
        (sum, conv) => sum + conv.notifications, 0), 0);
  }

  _calculateUnread() {
    const activeConversation = this.activeConversation;
    return this.notifications.unread
      + this.conversations(conversation => conversation.is('private'))
          .reduce((t, d) => { return t + (d == activeConversation ? 0 : d.unread) }, 0);
  }

  _dispatchMessage(msg) {
    msg.dispatchTo = camelize('wsEvent_' + this._getEventNameFromMessage(msg));
    msg.silent = this.ignoreStatuses;
    this.emit(msg.dispatchTo, msg);

    const conn = this.findConversation({connection_id: msg.connection_id});
    if (!conn) return;
    if (conn[msg.dispatchTo]) conn[msg.dispatchTo](msg);
    if (!msg.bubbles) return;

    const conversation = conn.findConversation(msg);
    if (conversation && conversation[msg.dispatchTo]) {
      conversation[msg.dispatchTo](msg);
    }

    if (msg.highlight) {
      this.notifications.addMessages(msg);
      conversation.update({notifications: conversation.notifications + 1});
      this.updateNotificationCount();
    }
  }

  _getEventNameFromMessage(msg) {
    if (msg.errors) return 'error';
    if (msg.event == 'state') return msg.type;

    if (msg.event == 'sent' && msg.message.match(/\/\S+/)) {
      msg.command = msg.message.split(/\s+/).filter(s => s.length);
      msg.command[0] = msg.command[0].substring(1);
      return 'sent_' + msg.command[0].toLowerCase();
    }

    return msg.event;
  }

  _maybeUpgradeActiveConversation(conversation) {
    const active = this.activeConversation;
    if (!conversation.conversation_id) return conversation;
    if (conversation.connection_id && conversation.connection_id != active.connection_id) return conversation;
    if (conversation.conversation_id && conversation.conversation_id != active.conversation_id) return conversation;
    this.update({activeConversation: conversation});
    return conversation;
  }

  _onConnectionChange(socket) {
    if (socket.is('open') && this.is('pending')) return this.load();
    if (socket.is('closed')) {
      this.connections.forEach(conn => conn.update({state: 'unreachable'}));
      if (!this.is(['error', 'loading'])) this.update({status: 'pending'});
    }
  }
}
