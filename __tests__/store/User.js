import Socket from '../../assets/js/Socket';
import TestWebSocket from '../../assets/js/TestWebSocket';
import User from '../../assets/store/User';

global.WebSocket = window.WebSocket = TestWebSocket;

test('ensureConversation connection', () => {
  const user = new User({});

  const conn = user.ensureConversation({connection_id: 'irc-foo'});
  expect(conn.connection_id).toBe('irc-foo');
  expect(user.activeConversation.connection_id).toBe('');

  // Upgrade activeConversation
  user.setActiveConversation({connection_id: 'irc-bar'});
  user.ensureConversation({connection_id: 'irc-bar'});
  expect(user.activeConversation.connection_id).toBe('irc-bar');
  expect(user.activeConversation.conversation_id).toBe(undefined);

  // Upgrade activeConversation from connection
  user.setActiveConversation({connection_id: 'irc-foo', conversation_id: '#cf'});
  expect(user.activeConversation.frozen).toBe('Not found.');
  conn.ensureConversation({conversation_id: '#cf'});
  expect(user.activeConversation.conversation_id).toBe('#cf');
  expect(user.activeConversation.frozen).toBe('');
});

test('ensureConversation conversation', () => {
  const user = new User({});

  const conversation = user.ensureConversation({connection_id: 'irc-foo', conversation_id: '#cf'});
  expect(conversation.connection_id).toBe('irc-foo');
  expect(user.activeConversation.connection_id).toBe('');
  expect(user.activeConversation.conversation_id).toBe('notifications');

  // Upgrade activeConversation
  user.setActiveConversation({connection_id: 'irc-bar', conversation_id: '#cr'});
  expect(user.findConversation({connection_id: 'irc-bar', conversation_id: '#cr'})).toBe(null);
  user.ensureConversation({connection_id: 'irc-bar', conversation_id: '#cr'});
  expect(user.activeConversation.connection_id).toBe('irc-bar');
  expect(user.activeConversation.conversation_id).toBe('#cr');
});

test('removeConversation connection', () => {
  const user = new User({});

  const conn = user.ensureConversation({connection_id: 'irc-baz'});
  user.update({activeConversation: conn});
  expect(user.activeConversation == conn).toBe(true);

  user.removeConversation(conn);
  expect(user.activeConversation != conn).toBe(true);
  expect(user.activeConversation.connection_id).toBe('irc-baz');
  expect(user.connections.size).toBe(0);
});

test('removeConversation conversation', () => {
  const user = new User({});

  const conn = user.ensureConversation({connection_id: 'irc-bax'});
  const conversation = user.ensureConversation({connection_id: 'irc-bax', conversation_id: '#cx'});

  user.update({activeConversation: conversation});
  expect(user.activeConversation == conversation).toBe(true);

  user.removeConversation(conversation);
  expect(user.activeConversation != conversation).toBe(true);
  expect(user.activeConversation.connection_id).toBe('irc-bax');
  expect(user.activeConversation.conversation_id).toBe('#cx');
  expect(user.connections.size).toBe(1);
  expect(user.conversations().length).toBe(0);
});

test('load success', async () => {
  const user = new User({socket: new Socket()});
  const socket = user.socket;

  // Start loading data
  socket.update({url: 'wss://example.convos.by/events'});
  expect(user.status).toBe('pending');
  user.load();
  await user.on('update');
  expect(user.status).toBe('loading');

  // Send the queued load() message
  socket.ws.dispatchEvent('open');
  expect(cleanWaiting(socket.getWaitingMessages())).toEqual([{
    id: '1',
    method: 'load',
    object: 'user',
    params: {connections: true, conversations: true},
    ts: true,
    waitingForResponse: true
  }]);

  expect(user.default_connection).toBe('irc://irc.libera.chat:6697/%23convos');
  expect(user.email).toBe('');
  expect(user.forced_connection).toBe(false);
  expect(user.highlightKeywords).toEqual([]);
  expect(user.notifications.unread).toBe(0);

  // Get response
  socket.ws.dispatchEvent('message', {
    data: {
      id : '1',
      user: {
        email: 'superwoman@convos.chat',
        default_connection: 'irc://irc.libera.chat',
        forced_connection: true,
        highlight_keywords: ['foo', 'bar'],
      },
    },
  });

  await user.on('update');
  expect(user.default_connection).toBe('irc://irc.libera.chat');
  expect(user.email).toBe('superwoman@convos.chat');
  expect(user.forced_connection).toBe(true);
  expect(user.highlightKeywords).toEqual(['foo', 'bar']);
  expect(user.status).toBe('success');

  // Notfications
  expect(user.notifications.unread).toBe(0);
  user.updateNotificationCount();
  expect(user.notifications.unread).toBe(0);
});

test('load error', async () => {
  const user = new User({socket: new Socket()});
  const socket = user.socket;

  let hasChanged = {};
  user.on('update', (user, changed) => (hasChanged = changed));

  // Start loading data
  socket.update({url: 'wss://example.convos.by/events'});
  user.load();
  await user.on('update');

  // Get error response
  socket.ws.dispatchEvent('open');
  socket.ws.dispatchEvent('message', {data: {id : '1', errors: [{message: 'Need to log in first.'}]}});
  await user.on('update');
  expect(hasChanged).toEqual({roles: false, status: true}); // "roles" need to be part of "changed" to start rendering in App.svelte
  expect(user.status).toBe('error');
  expect(user.default_connection).toBe('irc://irc.libera.chat:6697/%23convos');
  expect(user.email).toBe('');
  expect(user.forced_connection).toBe(false);
  expect(user.highlightKeywords).toEqual([]);
});

test('reload', async () => {
  const user = new User({socket: new Socket()});
  const socket = user.socket;
  socket.update({debug: 'yes'});

  // Start loading user data
  socket.reconnectIn = () => 50;
  socket.update({url: 'wss://example.convos.by/events'});
  user.load();
  await socket.on('update');
  await user.on('update');
  expect(socket.getWaitingMessages()).toEqual([]);
  expect(socket.queue.length).toEqual(1);
  expect(user.status).toBe('loading');

  // Close before data is loaded
  socket.ws.dispatchEvent('close');
  await socket.on('update');
  expect(socket.ws.readyState).toBe(WebSocket.CLOSED);
  await socket.on('update');
  expect(socket.ws.readyState).toBe(WebSocket.CONNECTING);
  expect(user.status).toBe('loading');
  expect(socket.getWaitingMessages()).toEqual([]);
  expect(socket.queue.length).toEqual(1);

  // Reconnect while loading
  socket.ws.readyState = WebSocket.OPEN;
  socket.ws.dispatchEvent('open');
  socket.ws.dispatchEvent('message', {data: {id : '1', user: {email: 'superwoman@convos.chat'}}});
  await user.on('update');
  expect(user.status).toBe('success');
  expect(user.email).toBe('superwoman@convos.chat');

  // Close after loaded
  socket.ws.dispatchEvent('close');
  await user.on('update');
  expect(socket.ws.readyState).toBe(WebSocket.CLOSED);
  expect(user.status).toBe('pending');

  // Reconnect after loaded
  await socket.on('update');
  expect(socket.ws.readyState).toBe(WebSocket.CONNECTING);
  socket.ws.dispatchEvent('open');
  await user.on('update');
  expect(user.status).toBe('loading');
});

function cleanWaiting(list) {
  return list.map(item => { return {...item, ts: item.ts ? true : false} });
}
